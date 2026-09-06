# Face model provenance

The optional face workflow uses the two unchanged OpenCV Zoo ONNX files pinned in `src/library/face-runtime.ts` at revision `47534e27c9851bb1128ccc0102f1145e27f23f98`. Model weights are downloaded only through explicit setup; the npm package includes their upstream license notices, not the weights.

| Model | Upstream notice | Notice SHA-256 |
| --- | --- | --- |
| YuNet face detection | [MIT](https://raw.githubusercontent.com/opencv/opencv_zoo/47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_detection_yunet/LICENSE) | `c83b8120c50ccbd4c4f96edf53141bdd566ebb8f8e9227e415326aa1b1aba958` |
| SFace face recognition | [Apache-2.0](https://raw.githubusercontent.com/opencv/opencv_zoo/47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_recognition_sface/LICENSE) | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |

Exact notices are retained under `docs/licenses/`. Git preserves their upstream bytes. The setup downloader validates notice length and checksum before publication. Runtime loading checks both notices alongside the already checked model weights. Existing cache manifests remain compatible; no manifest rewrite or model re-download is required when notices already match.

A missing notice can be restored through explicit face setup. Changed notices are not overwritten automatically: restore the corresponding pinned upstream bytes or choose a fresh model directory. This check identifies expected files; it is not a complete license audit of training data, model distribution, Python wheels or the other optional models.

Qualification: build and 15 focused tests passed, including changed/missing notice rejection. The existing local face cache passed weight and license verification with installation disabled; `.avid-mcp-analysis/face-license-verification.json` records the hashes. This is provenance/cache integrity evidence, not a new face-recognition accuracy benchmark.
Fresh-tarball verification also passed with both bundled notices checked by the installed verifier. Log: `.avid-mcp-analysis/package-face-notices.log`.
