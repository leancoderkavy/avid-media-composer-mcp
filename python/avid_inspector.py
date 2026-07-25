#!/usr/bin/env python3
"""Bounded JSON inspection for Avid AVB bins and AAF interchange files.

This helper is intentionally read-only. It opens files through pyavb/pyaaf2 and
serializes public metadata without modifying the source or saving a new file.
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import hashlib
import importlib.metadata
import json
import os
import platform
import sys
from collections import Counter
from fractions import Fraction
from pathlib import Path
from typing import Any, Iterable


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


class Serializer:
    """Cycle-safe, bounded serializer for third-party object graphs."""

    def __init__(self, max_depth: int, max_items: int) -> None:
        self.max_depth = max_depth
        self.max_items = max_items
        self._seen: dict[int, str] = {}
        self._next_reference = 1

    def _reference(self, value: object) -> tuple[str, bool]:
        identity = id(value)
        existing = self._seen.get(identity)
        if existing:
            return existing, True
        reference = f"obj-{self._next_reference}"
        self._next_reference += 1
        self._seen[identity] = reference
        return reference, False

    def serialize(self, value: Any, depth: int = 0) -> Any:
        if value is None or isinstance(value, (bool, int, float, str)):
            return value
        if isinstance(value, Fraction):
            return {
                "numerator": value.numerator,
                "denominator": value.denominator,
                "decimal": float(value),
            }
        if isinstance(value, (dt.datetime, dt.date, dt.time)):
            return value.isoformat()
        if isinstance(value, Path):
            return str(value)
        if isinstance(value, bytes):
            return {
                "_type": "bytes",
                "length": len(value),
                "sha256": hashlib.sha256(value).hexdigest(),
                "hexPreview": value[:64].hex(),
            }
        if type(value).__name__ in {"AUID", "MobID", "MobID32", "UUID"}:
            try:
                return str(value)
            except Exception:
                pass
        if depth >= self.max_depth:
            return {
                "_type": f"{type(value).__module__}.{type(value).__name__}",
                "_truncated": "max-depth",
            }

        if isinstance(value, dict):
            reference, repeated = self._reference(value)
            if repeated:
                return {"_ref": reference}
            items = list(value.items())
            result: dict[str, Any] = {"_id": reference}
            for key, item in items[: self.max_items]:
                result[str(key)] = self.serialize(item, depth + 1)
            if len(items) > self.max_items:
                result["_omittedItems"] = len(items) - self.max_items
            return result

        if isinstance(value, (list, tuple, set)):
            reference, repeated = self._reference(value)
            if repeated:
                return {"_ref": reference}
            items = list(value)
            return {
                "_id": reference,
                "_type": type(value).__name__,
                "items": [self.serialize(item, depth + 1) for item in items[: self.max_items]],
                **(
                    {"_omittedItems": len(items) - self.max_items}
                    if len(items) > self.max_items
                    else {}
                ),
            }

        reference, repeated = self._reference(value)
        if repeated:
            return {"_ref": reference}

        result: dict[str, Any] = {
            "_id": reference,
            "_type": f"{type(value).__module__}.{type(value).__name__}",
        }

        if dataclasses.is_dataclass(value) and not isinstance(value, type):
            for field in dataclasses.fields(value):
                try:
                    result[field.name] = self.serialize(getattr(value, field.name), depth + 1)
                except Exception as exc:  # pragma: no cover - defensive third-party access
                    result[field.name] = {"_error": str(exc)}
            return result

        properties = self._object_properties(value)
        for key, item in list(properties.items())[: self.max_items]:
            result[key] = self.serialize(item, depth + 1)
        if len(properties) > self.max_items:
            result["_omittedProperties"] = len(properties) - self.max_items
        if len(result) == 2:
            result["_repr"] = self._safe_repr(value)
        return result

    @staticmethod
    def _safe_repr(value: object) -> str:
        try:
            return repr(value)[:500]
        except Exception:
            return f"<{type(value).__name__}>"

    def _object_properties(self, value: object) -> dict[str, Any]:
        properties: dict[str, Any] = {}

        property_data = getattr(value, "property_data", None)
        if isinstance(property_data, dict):
            properties["property_data"] = property_data

        properties_method = getattr(value, "properties", None)
        if callable(properties_method):
            try:
                property_items = list(properties_method())
                normalized: dict[str, Any] = {}
                for item in property_items[: self.max_items]:
                    name = getattr(item, "name", None) or getattr(item, "property_name", None)
                    key = str(name or type(item).__name__)
                    try:
                        normalized[key] = getattr(item, "value")
                    except Exception as exc:
                        normalized[key] = {"_error": str(exc)}
                properties["properties"] = normalized
            except Exception as exc:
                properties["properties_error"] = str(exc)

        namespace = getattr(value, "__dict__", None)
        if isinstance(namespace, dict):
            public_namespace = {
                str(key): item
                for key, item in namespace.items()
                if not str(key).startswith("_")
            }
            if public_namespace:
                properties["attributes"] = public_namespace

        for name in (
            "name",
            "mob_id",
            "mobID",
            "class_id",
            "class_name",
            "edit_rate",
            "usage_code",
            "tracks",
            "slots",
            "segment",
            "components",
            "length",
            "media_kind",
            "start_time",
            "mark_in",
            "mark_out",
            "user_comments",
            "descriptor",
            "source_mob",
            "items",
        ):
            if name in properties:
                continue
            try:
                candidate = getattr(value, name)
            except Exception:
                continue
            if callable(candidate):
                continue
            properties[name] = candidate

        return properties


def ensure_file(path_value: str | None, suffix: str) -> Path:
    if not path_value:
        raise ValueError("--path is required")
    path = Path(path_value).expanduser().resolve(strict=True)
    if not path.is_file():
        raise ValueError(f"Not a file: {path}")
    if path.suffix.lower() != suffix:
        raise ValueError(f"Expected a {suffix} file: {path}")
    return path


def safe_iter(value: Any) -> list[Any]:
    if value is None:
        return []
    try:
        return list(value)
    except TypeError:
        return []


def summarize_objects(objects: Iterable[Any]) -> dict[str, Any]:
    values = list(objects)
    types = Counter(type(item).__name__ for item in values)
    names: list[str] = []
    for item in values:
        name = getattr(item, "name", None)
        if isinstance(name, str) and name:
            names.append(name)
    return {
        "count": len(values),
        "types": dict(sorted(types.items())),
        "names": names,
    }


def analyze_bin(path: Path, serializer: Serializer) -> dict[str, Any]:
    import avb

    with avb.open(str(path)) as avid_file:
        content = avid_file.content
        bin_items = safe_iter(getattr(content, "items", []))
        mobs = [
            getattr(item, "mob")
            for item in bin_items
            if getattr(item, "mob", None) is not None
        ]
        return {
            "format": "avb",
            "path": str(path),
            "sizeBytes": path.stat().st_size,
            "sha256": file_hash(path),
            "backend": {"package": "pyavb", "version": package_version("pyavb")},
            "summary": {
                "binName": path.stem,
                "binItems": summarize_objects(bin_items),
                "mobs": summarize_objects(mobs),
            },
            "content": serializer.serialize(content),
            "binItems": serializer.serialize(bin_items),
        }


def analyze_aaf(path: Path, serializer: Serializer) -> dict[str, Any]:
    import aaf2

    with aaf2.open(str(path), "r") as aaf_file:
        mobs = safe_iter(aaf_file.content.mobs)
        essence_data = safe_iter(aaf_file.content.essencedata)
        definitions: dict[str, Any] = {}
        dictionary = getattr(aaf_file, "dictionary", None)
        if dictionary is not None:
            for name in (
                "classdefs",
                "typedefs",
                "datadefs",
                "containerdefs",
                "codecdefs",
                "operationdefs",
                "parameterdefs",
                "interpolationdefs",
                "plugindefs",
                "taggedvaluedefs",
            ):
                try:
                    definitions[name] = summarize_objects(safe_iter(getattr(dictionary, name)))
                except Exception:
                    continue
        return {
            "format": "aaf",
            "path": str(path),
            "sizeBytes": path.stat().st_size,
            "sha256": file_hash(path),
            "backend": {"package": "pyaaf2", "version": package_version("pyaaf2")},
            "summary": {
                "mobs": summarize_objects(mobs),
                "essenceData": summarize_objects(essence_data),
                "dictionary": definitions,
            },
            "mobs": serializer.serialize(mobs),
            "essenceData": serializer.serialize(essence_data),
        }


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def probe() -> dict[str, Any]:
    packages = {"pyavb": package_version("pyavb"), "pyaaf2": package_version("pyaaf2")}
    return {
        "ready": all(packages.values()),
        "python": platform.python_version(),
        "executable": sys.executable,
        "platform": platform.platform(),
        "packages": packages,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("probe", "analyze-bin", "analyze-aaf"))
    parser.add_argument("--path")
    parser.add_argument("--max-depth", type=int, default=8)
    parser.add_argument("--max-items", type=int, default=500)
    args = parser.parse_args()
    if not 1 <= args.max_depth <= 32:
        parser.error("--max-depth must be between 1 and 32")
    if not 1 <= args.max_items <= 10_000:
        parser.error("--max-items must be between 1 and 10000")
    return args


def main() -> int:
    args = parse_args()
    try:
        if args.command == "probe":
            result = probe()
        else:
            serializer = Serializer(args.max_depth, args.max_items)
            if args.command == "analyze-bin":
                result = analyze_bin(ensure_file(args.path, ".avb"), serializer)
            else:
                result = analyze_aaf(ensure_file(args.path, ".aaf"), serializer)
        json.dump(result, sys.stdout, ensure_ascii=False, separators=(",", ":"))
        sys.stdout.write("\n")
        return 0
    except Exception as exc:
        json.dump(
            {
                "ok": False,
                "error": {
                    "type": type(exc).__name__,
                    "message": str(exc),
                    "command": args.command,
                    "path": os.fspath(args.path) if args.path else None,
                },
            },
            sys.stdout,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        sys.stdout.write("\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
