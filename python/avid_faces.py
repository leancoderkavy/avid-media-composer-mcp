"""Local face features through OpenCV APIs; no identity inference or network access."""
import json
import sys
import hashlib
import math
import os
import uuid
from pathlib import Path
import cv2
import numpy as np


def digest(file, limit):
    if file.stat().st_size > limit:
        raise ValueError('Checkpoint input exceeds size limit')
    result = hashlib.sha256()
    total = 0
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            total += len(block)
            if total > limit:
                raise ValueError('Checkpoint input exceeds size limit')
            result.update(block)
    return result.hexdigest()


def read_checkpoint(file, root, expected, face_offset):
    if not file.resolve().is_relative_to(root) or file.stat().st_size > 512 * 1024:
        raise ValueError('Invalid face checkpoint path or size')
    with file.open('r', encoding='utf8') as stream:
        content = stream.read(512 * 1024 + 1)
    if len(content) > 512 * 1024:
        raise ValueError('Face checkpoint exceeds size limit')
    record = json.loads(content)
    if record.get('input') != expected or record.get('schema') != 1:
        raise ValueError('Face checkpoint input changed')
    faces = record.get('faces')
    if not isinstance(faces, list) or len(faces) > 50 or face_offset + len(faces) > 1000:
        raise ValueError('Invalid checkpoint face count')
    hashes = record.get('cropHashes', {})
    if set(hashes) != {f'f{face_offset+i:05d}.jpg' for i in range(len(faces))}:
        raise ValueError('Invalid checkpoint crop membership')
    for i, face in enumerate(faces):
        identity = f'f{face_offset+i:05d}'
        if face.get('faceId') != identity or face.get('crop') != identity+'.jpg' or face.get('mediaId') != expected['mediaId'] or face.get('time') != expected['time']:
            raise ValueError('Invalid checkpoint face identity')
        for field, count in [('embedding', 128), ('box', 4)]:
            values = face.get(field)
            if not isinstance(values, list) or len(values) != count or any(type(value) not in (int, float) or not math.isfinite(value) for value in values):
                raise ValueError('Invalid checkpoint face features')
        if abs(sum(value*value for value in face['embedding'])-1) > 0.001 or face['box'][2] <= 0 or face['box'][3] <= 0:
            raise ValueError('Invalid checkpoint feature normalization or box')
        confidence = face.get('confidence')
        if type(confidence) not in (int, float) or not math.isfinite(confidence) or not 0 <= confidence <= 1:
            raise ValueError('Invalid checkpoint detection confidence')
        crop = (root / face['crop']).resolve()
        if not crop.is_relative_to(root) or digest(crop, 4*1024*1024) != hashes[face['crop']]:
            raise ValueError('Face checkpoint crop changed')
    return faces


def save_checkpoint(file, root, expected, faces):
    payload = {'schema': 1, 'input': expected, 'faces': faces,
               'cropHashes': {face['crop']: digest(root/face['crop'], 4*1024*1024) for face in faces}}
    temporary = file.with_name(file.name+'.'+str(uuid.uuid4())+'.tmp')
    try:
        with temporary.open('x', encoding='utf8') as stream:
            json.dump(payload, stream, separators=(',', ':'), allow_nan=False)
        os.link(temporary, file)
    finally:
        temporary.unlink(missing_ok=True)


def analyze(request):
    root=Path(request['root']).resolve()
    model=Path(request['models']).resolve()
    frames=request['frames']
    if not 1<=len(frames)<=1200:
        raise ValueError('Face frame limit exceeded')
    checkpointed = request.get('checkpoint', False)
    resume = request.get('resume', False)
    if type(checkpointed) is not bool or type(resume) is not bool or (resume and not checkpointed):
        raise ValueError('Invalid face checkpoint options')
    models = {name: digest(model/name, 64*1024*1024) for name in ['face_detection_yunet_2023mar.onnx', 'face_recognition_sface_2021dec.onnx']} if checkpointed else None
    detector=cv2.FaceDetectorYN.create(str(model/'face_detection_yunet_2023mar.onnx'),'',(640,640),0.8,0.3,1000)
    recognizer=cv2.FaceRecognizerSF.create(str(model/'face_recognition_sface_2021dec.onnx'),'')
    faces=[]
    reused_frames=0
    prefix=True
    for position, frame in enumerate(frames):
        target=Path(frame['file']).resolve()
        if not target.is_relative_to(root) or target.stat().st_size>4*1024*1024:
            raise ValueError('Frame is outside job directory or exceeds size limit')
        checkpoint = root/f'faces-{position}.json'
        expected = {'position': position, 'mediaId': frame['id'], 'time': frame['time'], 'frameSha256': digest(target, 4*1024*1024), 'models': models, 'opencv': cv2.__version__} if checkpointed else None
        if checkpointed and checkpoint.exists():
            if not resume or not prefix:
                raise ValueError('Existing face checkpoint requires explicit contiguous resume')
            faces.extend(read_checkpoint(checkpoint, root, expected, len(faces)))
            reused_frames += 1
            continue
        prefix=False
        offset=len(faces)
        image=cv2.imread(str(target))
        if image is None or max(image.shape[:2])>2048:
            raise ValueError('Invalid face input frame')
        detector.setInputSize((image.shape[1],image.shape[0]))
        _,detections=detector.detect(image)
        if detections is None:
            detections=[]
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
        if checkpointed:
            save_checkpoint(checkpoint, root, expected, faces[offset:])
    return {'faces':faces,'opencv':cv2.__version__,'reusedFrames':reused_frames,'completedFrames':len(frames),'sampling':'Sampled frames only; clusters require user review'}


if __name__=='__main__':
    with open(sys.argv[1],encoding='utf8') as manifest:
        payload=manifest.read(2*1024*1024+1)
    if len(payload)>2*1024*1024:
        raise ValueError('Face manifest exceeds limit')
    print(json.dumps(analyze(json.loads(payload)),separators=(',',':')))
