"""Inspect locally installed MCAPI descriptors; optionally perform three read-only RPCs.

Research utility, separate from the production MCP/Extension bridge. Does not
extract credentials, install panels, write host files, or issue editing RPCs.
"""

import argparse
import hashlib
import json
from pathlib import Path, PureWindowsPath
import socket
import subprocess
import sys
import time
from urllib.parse import unquote
from datetime import datetime, timezone

from google.protobuf import descriptor_pb2, descriptor_pool, json_format, message_factory
from google.protobuf.message import DecodeError


MAX_DESCRIPTOR = 2_000_000
MAX_RESPONSE = 1_048_576
READ_METHODS = frozenset({"GetAppInfo", "GetOpenProjectInfo", "GetBins"})


def varint(data, pos, limit):
    value = 0
    for shift in range(0, 70, 7):
        if pos >= limit:
            raise ValueError("Truncated protobuf varint")
        byte = data[pos]
        pos += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, pos
    raise ValueError("Oversized protobuf varint")


def extract_descriptor(raw, name):
    encoded = name.encode("ascii")
    needle = bytes([10, len(encoded)]) + encoded
    candidates = []
    search = 0
    while (start := raw.find(needle, search)) >= 0:
        search = start + len(needle)
        end = start
        limit = min(len(raw), start + MAX_DESCRIPTOR)
        try:
            while end < limit:
                tag, after = varint(raw, end, limit)
                if tag == 0 or tag >> 3 > 14:
                    break
                if tag & 7 == 2:
                    size, after = varint(raw, after, limit)
                    if after + size > limit:
                        raise ValueError("Descriptor exceeds bound")
                    end = after + size
                elif tag & 7 == 0:
                    _, end = varint(raw, after, limit)
                else:
                    break
            descriptor = descriptor_pb2.FileDescriptorProto.FromString(raw[start:end])
            if descriptor.name == name and descriptor.syntax == "proto3":
                candidates.append((descriptor, start, end - start))
        except (ValueError, DecodeError):
            continue
    if len(candidates) != 1:
        raise ValueError(f"Expected one valid {name} descriptor, found {len(candidates)}")
    return candidates[0]


def grpc_frames(data):
    messages = []
    pos = 0
    while pos < len(data):
        if pos + 5 > len(data) or data[pos] != 0:
            raise ValueError("Truncated or compressed gRPC frame")
        size = int.from_bytes(data[pos + 1:pos + 5], "big")
        pos += 5
        if size > MAX_RESPONSE or pos + size > len(data):
            raise ValueError("Invalid gRPC message length")
        messages.append(data[pos:pos + size])
        pos += size
        if len(messages) > 2048:
            raise ValueError("Too many gRPC messages")
    return messages


def verify_listener_owner(binary):
    if sys.platform != "win32":
        raise RuntimeError("Live probe is qualified for Windows only")
    # Static PowerShell; no user-supplied text is interpolated into shell code.
    command = (
        "$ErrorActionPreference='Stop'; "
        "@(Get-NetTCPConnection -State Listen -LocalPort 9100 | "
        "Where-Object { $_.LocalAddress -eq '127.0.0.1' } | "
        "ForEach-Object { (Get-Process -Id $_.OwningProcess).Path }) | ConvertTo-Json -Compress"
    )
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
        check=True, capture_output=True, text=True, timeout=10,
    )
    owners = json.loads(result.stdout or "null")
    if isinstance(owners, str):
        owners = [owners]
    if not owners or len(owners) != 1 or Path(owners[0]).resolve() != binary:
        raise RuntimeError("Loopback port 9100 is not owned by the inspected executable")


def read_rpc(method, payload):
    if method not in READ_METHODS:
        raise ValueError("RPC is outside the fixed read-only allowlist")
    return _loopback_rpc(method, payload)


def _loopback_rpc(method, payload):
    """Internal transport; callers must constrain methods and fixture scope."""
    import h2.config
    import h2.connection
    import h2.events

    connection = h2.connection.H2Connection(
        config=h2.config.H2Configuration(client_side=True, header_encoding="utf-8")
    )
    connection.initiate_connection()
    connection.send_headers(1, [
        (":method", "POST"), (":scheme", "http"),
        (":authority", "127.0.0.1:9100"), (":path", f"/mcapi.MCAPI/{method}"),
        ("content-type", "application/grpc"), ("te", "trailers"), ("grpc-timeout", "4S"),
    ])
    connection.send_data(1, b"\x00" + len(payload).to_bytes(4, "big") + payload, end_stream=True)
    deadline = time.monotonic() + 5
    response = bytearray()
    headers = {}
    wire_bytes = 0
    with socket.create_connection(("127.0.0.1", 9100), timeout=3) as stream:
        stream.sendall(connection.data_to_send())
        ended = False
        while not ended:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("RPC deadline exceeded")
            stream.settimeout(remaining)
            incoming = stream.recv(65536)
            if not incoming:
                raise RuntimeError("Connection closed before gRPC completion")
            wire_bytes += len(incoming)
            if wire_bytes > 2 * MAX_RESPONSE:
                raise ValueError("HTTP/2 response exceeds bound")
            for event in connection.receive_data(incoming):
                if isinstance(event, (h2.events.ResponseReceived, h2.events.TrailersReceived)):
                    headers.update(dict(event.headers))
                elif isinstance(event, h2.events.DataReceived):
                    response.extend(event.data)
                    if len(response) > MAX_RESPONSE:
                        raise ValueError("gRPC response exceeds bound")
                    connection.acknowledge_received_data(event.flow_controlled_length, event.stream_id)
                elif isinstance(event, h2.events.StreamEnded) and event.stream_id == 1:
                    ended = True
                elif isinstance(event, (h2.events.StreamReset, h2.events.ConnectionTerminated)):
                    raise RuntimeError("HTTP/2 stream reset or connection terminated")
            pending = connection.data_to_send()
            if pending and not ended:
                stream.sendall(pending)
    if headers.get(":status") != "200" or headers.get("grpc-status") != "0":
        detail = unquote(headers.get("grpc-message", ""))[:512]
        raise RuntimeError(f"RPC rejected: HTTP {headers.get(':status')}, gRPC {headers.get('grpc-status')}: {detail}")
    if not headers.get("content-type", "").startswith("application/grpc"):
        raise RuntimeError("Unexpected RPC content type")
    return grpc_frames(response)


def typed_read(pool, method, body=None):
    request_type = message_factory.GetMessageClass(pool.FindMessageTypeByName(f"mcapi.{method}Request"))
    response_type = message_factory.GetMessageClass(pool.FindMessageTypeByName(f"mcapi.{method}Response"))
    request = request_type()
    if body:
        json_format.ParseDict({"body": body}, request)
    messages = [response_type.FromString(raw) for raw in read_rpc(method, request.SerializeToString())]
    if not messages:
        raise RuntimeError(f"{method} returned no application response")
    for message in messages:
        if not message.HasField("header") or message.header.HasField("error"):
            raise RuntimeError(f"{method} returned an application error or missing header")
    statuses = [json_format.MessageToDict(m.header).get("status") for m in messages]
    if statuses[-1] != "Completed":
        raise RuntimeError(f"{method} did not complete: {statuses[-1]}")
    return [json_format.MessageToDict(m.body, preserving_proto_field_name=True)
            for m in messages if m.HasField("body")]


def probe(pool, binary):
    verify_listener_owner(binary)
    app = typed_read(pool, "GetAppInfo")
    project = typed_read(pool, "GetOpenProjectInfo")
    if len(app) != 1 or len(project) != 1 or not project[0].get("path"):
        raise RuntimeError("Expected app information and an open project")
    bins = typed_read(pool, "GetBins", {"project_path": project[0]["path"], "request_flag": ["AllTypes"]})
    # Retain project/bin names and technical fields, excluding full paths, dates,
    # task identifiers, host identifiers, and any unknown future response fields.
    project_keys = {"project_type", "frame_rate", "color_space", "raster_width", "raster_height"}
    return {
        "endpoint": "127.0.0.1:9100", "transport": "HTTP/2 gRPC",
        "methods_completed": sorted(READ_METHODS),
        "credentials_supplied": False,
        "app": {k: app[0][k] for k in ("app_name", "app_version", "sdk_version") if k in app[0]},
        "project": {"name": PureWindowsPath(project[0]["path"]).name,
                    **{k: v for k, v in project[0].items() if k in project_keys}},
        "bins": [PureWindowsPath(b["absolute_path"]).name for b in bins if b.get("absolute_path")],
    }


def inspect(binary, live=False):
    if binary.stat().st_size > 512 * 1024 * 1024:
        raise ValueError("Executable exceeds the research size bound")
    raw = binary.read_bytes()
    descriptors = [extract_descriptor(raw, n) for n in ("MCAPI_Types.proto", "MCAPI.proto")]
    pool = descriptor_pool.DescriptorPool()
    pool.AddSerializedFile(descriptor_pb2.DESCRIPTOR.serialized_pb)
    for descriptor, _, _ in descriptors:
        pool.Add(descriptor)
    scope = pool.FindExtensionByName("mcapi.api_scope")
    options_type = message_factory.GetMessageClass(pool.FindMessageTypeByName("google.protobuf.MethodOptions"))
    methods = []
    for service in descriptors[1][0].service:
        for method in service.method:
            options = options_type.FromString(method.options.SerializeToString())
            methods.append({
                "name": method.name, "route": f"/mcapi.{service.name}/{method.name}",
                "input": method.input_type, "output": method.output_type,
                "client_streaming": method.client_streaming, "server_streaming": method.server_streaming,
                "api_scope": options.Extensions[scope] if options.HasExtension(scope) else None,
            })
    report = {
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "evidence": "installed-descriptor-metadata", "binary_name": binary.name,
        "binary_sha256": hashlib.sha256(raw).hexdigest(), "binary_bytes": len(raw),
        "descriptors": [{"name": d.name, "offset": offset, "bytes": size,
                         "package": d.package, "messages": len(d.message_type),
                         "dependencies": list(d.dependency)} for d, offset, size in descriptors],
        "method_count": len(methods), "methods": methods,
    }
    if live:
        report["live_read_only"] = probe(pool, binary)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("binary", type=Path, help="Installed AvidMediaComposer.exe to inspect read-only")
    parser.add_argument("--probe-read-only", action="store_true", help="Read app, open project, and bins from loopback port 9100")
    parser.add_argument("--output", type=Path, help="Create a new JSON report; refuses to overwrite an existing file")
    args = parser.parse_args()
    binary = args.binary.resolve(strict=True)
    if args.probe_read_only and binary.name.lower() != "avidmediacomposer.exe":
        raise ValueError("Live probe requires AvidMediaComposer.exe")
    if args.output and args.output.exists():
        raise FileExistsError("Output already exists; choose a new report path")
    report = inspect(binary, args.probe_read_only)
    rendered = json.dumps(report, indent=2) + "\n"
    if args.output:
        with args.output.open("x", encoding="utf-8") as output:
            output.write(rendered)
        print(json.dumps({"output": str(args.output.resolve()), "method_count": report["method_count"],
                          "live_read_only": report.get("live_read_only")}))
    else:
        print(rendered)


if __name__ == "__main__":
    main()
