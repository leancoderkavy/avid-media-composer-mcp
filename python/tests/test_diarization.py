"""Contract checks without installing optional models or native runtimes."""
import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("diarization_subject", Path(__file__).parents[1] / "avid_diarization.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class DiarizationContract(unittest.TestCase):
    def test_rejects_invalid_options_before_loading_models(self):
        with patch.object(worker, "models") as models:
            for count in [0, 21, -2, 1.5, True]:
                with self.assertRaisesRegex(ValueError, "Speaker count"):
                    worker.analyze(Path("missing"), speakers=count)
            for threshold in [0, -1, 1.1, float("nan"), float("inf")]:
                with self.assertRaisesRegex(ValueError, "threshold"):
                    worker.analyze(Path("missing"), threshold=threshold)
            models.assert_not_called()

    def test_bounds_files_and_never_downloads_during_model_verification(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            file = root / "input"
            file.write_bytes(b"12345")
            with self.assertRaisesRegex(ValueError, "byte limit"):
                worker.checked_bytes(file, 4)
            with patch.object(worker.urllib.request, "urlopen") as network:
                with self.assertRaises(ValueError):
                    worker.models(root)
                network.assert_not_called()
            with self.assertRaisesRegex(ValueError, "checksum"):
                worker.verify(b"12345", 5, "0" * 64)

    def test_extracts_only_checked_regular_archive_members(self):
        for symlink in [False, True]:
            with TemporaryDirectory() as directory:
                root = Path(directory)
                archive = root / "segmentation.tar.bz2"
                data = b"model"
                with tarfile.open(archive, "w:bz2") as target:
                    entry = tarfile.TarInfo("sherpa-onnx-pyannote-segmentation-3-0/model.onnx")
                    entry.size = len(data)
                    if symlink:
                        entry.type = tarfile.SYMTYPE
                        entry.linkname = "../../outside"
                    target.addfile(entry, None if symlink else io.BytesIO(data))
                    ignored = tarfile.TarInfo("../../outside")
                    ignored.size = 1
                    target.addfile(ignored, io.BytesIO(b"x"))
                assets = [(archive.name, "unused", archive.stat().st_size, hashlib.sha256(archive.read_bytes()).hexdigest())]
                members = [("model.onnx", len(data), hashlib.sha256(data).hexdigest())]
                with patch.object(worker, "ASSETS", assets), patch.object(worker, "MEMBERS", members), patch.object(worker.urllib.request, "urlopen") as network:
                    if symlink:
                        with self.assertRaisesRegex(ValueError, "archive member"):
                            worker.models(root, download=True)
                        self.assertFalse((root / "model.onnx").exists())
                    else:
                        worker.models(root, download=True)
                        self.assertEqual((root / "model.onnx").read_bytes(), data)
                        self.assertEqual({item.name for item in root.iterdir()}, {archive.name, "model.onnx"})
                    network.assert_not_called()
