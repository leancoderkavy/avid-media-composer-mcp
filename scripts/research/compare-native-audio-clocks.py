"""Locate the owned two-cut Avid render in source-clock and sample-clock audio.

Research only. Requires NumPy and FFmpeg; writes unique diagnostic artifacts,
never changes source, render, AAF, project, bin or any audio timing.
"""
import argparse
import hashlib
import json
import subprocess
import uuid
from pathlib import Path
import numpy as np


def locate(source, query):
    """Normalized valid cross-correlation at every sample using an FFT."""
    source = np.asarray(source, dtype=np.float64)
    query = np.asarray(query, dtype=np.float64)
    if len(source) < len(query) or not np.isfinite(source).all() or not np.isfinite(query).all():
        raise ValueError('Invalid PCM arrays')
    n = len(query)
    fft_size = 1 << (len(source) + n - 2).bit_length()
    dots = np.fft.irfft(np.fft.rfft(source, fft_size) * np.fft.rfft(query[::-1], fft_size), fft_size)[n-1:len(source)]
    sums = np.concatenate(([0.], np.cumsum(source)))
    squares = np.concatenate(([0.], np.cumsum(source*source)))
    window_sums = sums[n:] - sums[:-n]
    window_squares = squares[n:] - squares[:-n]
    centered = dots - window_sums * query.sum()/n
    denominator = np.sqrt(np.maximum(0, window_squares-window_sums**2/n) * np.sum((query-query.mean())**2))
    scores = np.full(len(dots), -np.inf)
    np.divide(centered, denominator, out=scores, where=denominator > 1e-15)
    if not np.isfinite(scores).any():
        raise ValueError('No nonconstant comparison window')
    best = int(np.argmax(scores))
    selected = source[best:best+n]
    variance = np.sum((selected-selected.mean())**2)
    gain = np.sum((selected-selected.mean())*(query-query.mean()))/variance
    intercept = query.mean()-gain*selected.mean()
    return {'startSample':best, 'correlation':float(scores[best]), 'gain':float(gain),
            'intercept':float(intercept), 'rmse':float(np.sqrt(np.mean((selected-query)**2))),
            'fittedRmse':float(np.sqrt(np.mean((selected*gain+intercept-query)**2))),
            'atSearchBoundary':best in (0,len(scores)-1)}


def self_test():
    rng = np.random.default_rng(9100)
    source = rng.normal(size=1200)
    for start in (0,343,1000):
        result = locate(source, source[start:start+200]*0.7+0.2)
        assert result['startSample'] == start, result
        assert abs(result['correlation']-1)<1e-12
        assert abs(result['gain']-.7)<1e-12
        assert abs(result['intercept']-.2)<1e-12
        assert result['fittedRmse']<1e-12
    try:
        locate(np.zeros(300),np.zeros(200))
    except ValueError:
        pass
    else:
        raise AssertionError('Constant PCM should not produce a timing claim')


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()


def main(render):
    source=Path('D:/Sonoma Escape Edit/Sonoma_Escape_RoughCut_v1_preview.mp4')
    render=Path(render).resolve()
    if render.suffix.lower()!='.mp4':
        raise ValueError('Expected existing Sonoma MP4 render')
    source_hash,render_hash=sha(source),sha(render)
    assert source_hash=='3025fb298baee4c3beec50480a3d9376c99d0fc79d05f55f91e2e1c500539fca'
    root=render.parent/('audio-clocks-'+str(uuid.uuid4()));root.mkdir()
    def command(args):
        result=subprocess.run(args,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=90,creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode:raise RuntimeError(result.stderr.decode(errors='replace')[:4000])
        return result.stdout
    for file in (source,render):
        streams=json.loads(command(['ffprobe','-v','error','-select_streams','a','-show_streams','-of','json',str(file)]))['streams']
        assert len(streams)==1 and streams[0]['channels']==2 and streams[0]['sample_rate']=='48000'
    def extract(file,name,filter_text,frames):
        output=root/name
        command(['ffmpeg','-nostdin','-v','error','-n','-i',str(file),'-map','0:a:0','-af',filter_text,'-c:a','pcm_f32le','-f','f32le',str(output)])
        values=np.fromfile(output,dtype='<f4')
        assert values.size==frames*2 and np.isfinite(values).all()
        return values.reshape(-1,2).astype(np.float64)
    rendered=extract(render,'render.f32','anull',192000)
    assert np.array_equal(rendered[:,0],rendered[:,1]), 'This experiment targets the observed dual-mono export'
    comparisons=[]
    for cut,start in enumerate((95,110)):
        query=rendered[cut*96000:(cut+1)*96000,0]
        for mode,clock in [('presentation','aresample=48000:async=1:first_pts=0'),('decoded_samples','asetpts=N/SR/TB')]:
            window_start=start-2
            values=extract(source,f'{cut}-{mode}.f32',f'{clock},atrim=start={window_start}:end={start+4},asetpts=PTS-STARTPTS',288000)
            for channel in ('left','right','mean'):
                vector=values.mean(axis=1) if channel=='mean' else values[:,0 if channel=='left' else 1]
                result=locate(vector,query)
                result.update({'cut':cut,'clock':mode,'sourceChannel':channel,'intendedSourceStartSeconds':start,
                               'matchedSourceStartSeconds':window_start+result['startSample']/48000,
                               'sourceOffsetSeconds':result['startSample']/48000-2})
                comparisons.append(result)
    assert sha(source)==source_hash and sha(render)==render_hash
    report={'source':str(source),'render':str(render),'sourceSha256':source_hash,'renderSha256':render_hash,
            'sourceUnchanged':True,'renderUnchanged':True,'numpyVersion':np.__version__,
            'method':'Full two-second query; every source offset within +/-2 seconds, normalized FFT cross-correlation. Positive source offset means rendered audio matches later source audio. Source presentation clock and continuous decoded-sample clock are tested independently.',
            'limitations':['This identifies similarity, not perceptual audio/video sync.','No automatic correction is applied.','Similar source channels and dual mono do not establish original channel preservation.'],
            'comparisons':comparisons}
    evidence=root/'evidence.json';evidence.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({'evidence':str(evidence),'comparisons':comparisons}))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('render',nargs='?');parser.add_argument('--self-test',action='store_true')
    args=parser.parse_args();self_test()
    if args.render:main(args.render)
    elif args.self_test:print('FFT timing self-test passed')
    else:parser.error('Supply the existing render or --self-test')
