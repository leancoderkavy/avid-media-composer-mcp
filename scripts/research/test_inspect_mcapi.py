"""Offline boundary tests; no Avid installation or network access required."""

import unittest
from unittest.mock import MagicMock, patch

from google.protobuf import descriptor_pb2

from inspect_mcapi import MAX_RESPONSE, extract_descriptor, grpc_frames, read_rpc


class DescriptorTests(unittest.TestCase):
    def fixture(self):
        descriptor = descriptor_pb2.FileDescriptorProto(name="MCAPI.proto", syntax="proto3", package="mcapi")
        descriptor.service.add(name="MCAPI")
        return descriptor.SerializeToString()

    def test_service_only_descriptor_is_valid(self):
        data = self.fixture()
        descriptor, offset, size = extract_descriptor(b"prefix" + data + b"\0padding", "MCAPI.proto")
        self.assertEqual((offset, size), (6, len(data)))
        self.assertEqual(descriptor.service[0].name, "MCAPI")
        self.assertEqual(len(descriptor.message_type), 0)

    def test_ambiguous_descriptors_are_rejected(self):
        data = self.fixture()
        with self.assertRaisesRegex(ValueError, "found 2"):
            extract_descriptor(data + b"\0" + data + b"\0", "MCAPI.proto")

    def test_string_without_valid_descriptor_is_rejected(self):
        with self.assertRaises(ValueError):
            extract_descriptor(b"MCAPI.proto\0unrelated", "MCAPI.proto")

    def test_truncated_field_is_rejected(self):
        with self.assertRaises(ValueError):
            extract_descriptor(self.fixture() + b"\x22\x64short", "MCAPI.proto")


class TransportTests(unittest.TestCase):
    def test_multiple_grpc_messages(self):
        self.assertEqual(grpc_frames(b"\0\0\0\0\x03abc\0\0\0\0\0"), [b"abc", b""])

    def test_rejects_truncated_and_compressed_frames(self):
        for data in [b"\0", b"\0\0\0\0\x05short!\0", b"\1\0\0\0\0", b"\0\0\0\0\x02x"]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                grpc_frames(data)

    def test_rejects_oversized_frame(self):
        with self.assertRaises(ValueError):
            grpc_frames(b"\0" + (MAX_RESPONSE + 1).to_bytes(4, "big"))

    def test_write_and_arbitrary_rpcs_never_connect(self):
        with patch("socket.create_connection") as connect:
            for method in ["CreateBin", "ImportFile", "SetMobInfo", "../GetAppInfo", ""]:
                with self.subTest(method=method), self.assertRaises(ValueError):
                    read_rpc(method, b"")
            connect.assert_not_called()

    def test_retains_native_error_detail_when_http_is_successful(self):
        import h2.config
        import h2.connection
        import h2.events

        peer = h2.connection.H2Connection(config=h2.config.H2Configuration(client_side=False))
        peer.initiate_connection()
        stream = MagicMock()
        stream.__enter__.return_value = stream

        def receive_client(data):
            for event in peer.receive_data(data):
                if isinstance(event, h2.events.RequestReceived):
                    peer.send_headers(event.stream_id, [
                        (":status", "200"), ("content-type", "application/grpc"),
                        ("grpc-status", "2"), ("grpc-message", "Bin%20not%20found."),
                    ], end_stream=True)

        stream.sendall.side_effect = receive_client
        stream.recv.side_effect = lambda _size: peer.data_to_send()
        with patch("socket.create_connection", return_value=stream):
            with self.assertRaisesRegex(RuntimeError, r"HTTP 200, gRPC 2: Bin not found\."):
                read_rpc("GetAppInfo", b"")


if __name__ == "__main__":
    unittest.main()
