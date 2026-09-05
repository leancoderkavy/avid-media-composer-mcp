"""Read native build identifiers and hash wheel-owned binaries; no mutation."""
import hashlib
import importlib.metadata as metadata
import json
import re
import sherpa_onnx
import numpy

result = {"reported": {key: (getattr(sherpa_onnx, key)() if callable(getattr(sherpa_onnx, key)) else getattr(sherpa_onnx, key)) for key in
                       ["version", "git_sha1", "onnxruntime_version"]},
          "numpyBuild": numpy.__config__.show(mode="dicts"), "binaries": []}
for name in ["sherpa-onnx", "sherpa-onnx-core", "numpy"]:
    distribution = metadata.distribution(name)
    for relative in distribution.files or []:
        if not str(relative).endswith((".dll", ".pyd")):
            continue
        file = distribution.locate_file(relative)
        if file.stat().st_size > 128 * 1024 * 1024:
            raise ValueError("Native inventory file exceeds limit")
        data = file.read_bytes()
        strings = [value.decode("ascii") for value in re.findall(rb"[\x20-\x7e]{8,}", data)
                   if any(term in value.lower() for term in
                          [b"espeak_", b"espeak-ng", b"espeakng", b"phonemize"])]
        result["binaries"].append({"distribution": name, "path": str(relative),
                                   "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                                   "phonemizerStringCount": len(strings),
                                   "phonemizerStringExamples": strings[:8]})
print(json.dumps(result))
