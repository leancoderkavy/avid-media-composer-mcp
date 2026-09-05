"""Exercise face overflow handling without downloading optional model runtimes."""
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


class FaceLimits(unittest.TestCase):
    def test_crowded_frame_fails_before_silently_dropping_detections(self):
        detector = SimpleNamespace(setInputSize=Mock(), detect=Mock(return_value=(None, [object()] * 51)))
        recognizer = SimpleNamespace(alignCrop=Mock())
        cv2 = SimpleNamespace(FaceDetectorYN=SimpleNamespace(create=Mock(return_value=detector)),
                              FaceRecognizerSF=SimpleNamespace(create=Mock(return_value=recognizer)),
                              imread=Mock(return_value=SimpleNamespace(shape=(640, 640, 3))))
        spec = importlib.util.spec_from_file_location('face_limit_subject', Path(__file__).parents[1] / 'avid_faces.py')
        module = importlib.util.module_from_spec(spec)
        with patch.dict('sys.modules', {'cv2': cv2, 'numpy': SimpleNamespace()}):
            spec.loader.exec_module(module)
        with TemporaryDirectory() as directory:
            frame = Path(directory) / 'frame.jpg'
            frame.write_bytes(b'fixture')
            with self.assertRaisesRegex(ValueError, 'per frame exceed limit'):
                module.analyze({'root': directory, 'models': directory,
                                'frames': [{'file': str(frame), 'id': 'fixture', 'time': 0}]})
        recognizer.alignCrop.assert_not_called()


if __name__ == '__main__':
    unittest.main()
