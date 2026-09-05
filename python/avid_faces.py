"""Local face features through OpenCV APIs; no identity inference or network access."""
import json
import sys
from pathlib import Path
import cv2
import numpy as np


def analyze(request):
    root=Path(request['root']).resolve()
    model=Path(request['models']).resolve()
    frames=request['frames']
    if not 1<=len(frames)<=1200:
        raise ValueError('Face frame limit exceeded')
    detector=cv2.FaceDetectorYN.create(str(model/'face_detection_yunet_2023mar.onnx'),'',(640,640),0.8,0.3,1000)
    recognizer=cv2.FaceRecognizerSF.create(str(model/'face_recognition_sface_2021dec.onnx'),'')
    faces=[]
    for frame in frames:
        target=Path(frame['file']).resolve()
        if not target.is_relative_to(root) or target.stat().st_size>4*1024*1024:
            raise ValueError('Frame is outside job directory or exceeds size limit')
        image=cv2.imread(str(target))
        if image is None or max(image.shape[:2])>2048:
            raise ValueError('Invalid face input frame')
        detector.setInputSize((image.shape[1],image.shape[0]))
        _,detections=detector.detect(image)
        if detections is None:
            continue
        if len(detections)>50:
            raise ValueError('Face detections per frame exceed limit; narrow the input instead of dropping detections')
        for detection in detections:
            if len(faces)>=1000:
                raise ValueError('Face count exceeds limit')
            aligned=recognizer.alignCrop(image,detection)
            feature=recognizer.feature(aligned).reshape(-1)
            norm=float(np.linalg.norm(feature))
            if not np.isfinite(feature).all() or norm<=0:
                raise ValueError('Invalid face feature')
            face_id=f'f{len(faces):05d}'
            crop=root/f'{face_id}.jpg'
            if crop.exists() or not cv2.imwrite(str(crop),aligned):
                raise ValueError('Could not write unique face crop')
            faces.append({'faceId':face_id,'mediaId':frame['id'],'time':frame['time'],
                          'box':[float(value) for value in detection[:4]],'confidence':float(detection[-1]),
                          'crop':crop.name,'embedding':(feature/norm).tolist()})
    return {'faces':faces,'opencv':cv2.__version__,'sampling':'Sampled frames only; clusters require user review'}


if __name__=='__main__':
    with open(sys.argv[1],encoding='utf8') as manifest:
        payload=manifest.read(2*1024*1024+1)
    if len(payload)>2*1024*1024:
        raise ValueError('Face manifest exceeds limit')
    print(json.dumps(analyze(json.loads(payload)),separators=(',',':')))
