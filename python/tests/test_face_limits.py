"""Exercise face overflow handling without downloading optional model runtimes."""
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


class FaceLimits(unittest.TestCase):
    def test_checkpoint_rejects_changed_inputs_crops_and_invalid_features(self):
        spec = importlib.util.spec_from_file_location('face_checkpoint_subject', Path(__file__).parents[1] / 'avid_faces.py')
        module = importlib.util.module_from_spec(spec)
        with patch.dict('sys.modules', {'cv2': SimpleNamespace(), 'numpy': SimpleNamespace()}):
            spec.loader.exec_module(module)
        with TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            crop = root / 'f00000.jpg'
            crop.write_bytes(b'crop')
            expected = {'position': 0, 'mediaId': 'media', 'time': 1, 'frameSha256': 'a'*64, 'models': {'detector': 'b'*64}, 'opencv': 'pinned'}
            face = {'faceId': 'f00000', 'crop': crop.name, 'mediaId': 'media', 'time': 1,
                    'box': [0, 0, 10, 10], 'confidence': 0.9, 'embedding': [1] + [0]*127}
            checkpoint = root / 'faces-0.json'
            module.save_checkpoint(checkpoint, root, expected, [face])
            original = checkpoint.read_bytes()
            self.assertEqual(module.read_checkpoint(checkpoint, root, expected, 0), [face])
            with self.assertRaises(FileExistsError):
                module.save_checkpoint(checkpoint, root, expected, [face])
            self.assertEqual(checkpoint.read_bytes(), original)
            with self.assertRaisesRegex(ValueError, 'input changed'):
                module.read_checkpoint(checkpoint, root, {**expected, 'models': {}}, 0)
            crop.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'crop changed'):
                module.read_checkpoint(checkpoint, root, expected, 0)
            crop.write_bytes(b'crop')
            malformed = json.loads(original)
            malformed['faces'][0]['embedding'] = [0]*128
            checkpoint.write_text(json.dumps(malformed), encoding='utf8')
            with self.assertRaisesRegex(ValueError, 'normalization'):
                module.read_checkpoint(checkpoint, root, expected, 0)

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
