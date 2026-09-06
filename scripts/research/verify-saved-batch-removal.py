"""Independently verify saved marker removal and decoded baseline restoration."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def verify(root):
    root = root.resolve(strict=True)
    evidence_file = root / 'evidence.json'
    evidence = json.loads(evidence_file.read_text(encoding='utf-8'))
    assert evidence['removedCount'] == 100 and evidence['finalMarkerCount'] == 0
    assert evidence['unrequestedMarkerPreserved'] is True
    prior_file = Path(evidence['input']).resolve(strict=True)
    prior = json.loads(prior_file.read_text(encoding='utf-8'))
    assert prior['mobId'] == evidence['mobId'] and prior['bin'] == evidence['bin']
    assert len(prior['markers']) == 100 and prior['markersRetained'] is True
    paths = {'original': prior_file.parent / 'before-markers.avb',
             **{label: root / (label + '.avb') for label in
                ['initial-100', 'with-sentinel', 'sentinel-only', 'cleaned']}}
    prior_manifest_file = prior_file.parent / 'snapshots.json'
    prior_manifest = json.loads(prior_manifest_file.read_text(encoding='utf-8'))
    protected = [evidence_file, prior_file, prior_manifest_file, *paths.values()]
    hashes = {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in protected}
    for label, path in paths.items():
        expected_label = 'before-markers' if label == 'original' else label
        manifest = prior_manifest if label == 'original' else evidence['snapshots']
        matches = [item for item in manifest if item['label'] == expected_label]
        assert len(matches) == 1
        assert Path(matches[0]['file']).resolve(strict=True) == path.resolve(strict=True)
        assert hashes[str(path)] == matches[0]['sha256']
    inspector = load_module('marker_inspector', Path(__file__).with_name('inspect-saved-markers.py'))
    timeline = load_module('timeline', Path(__file__).resolve().parents[2] / 'python' / 'avid_timeline.py')
    raw = {label: inspector.inspect(path) for label, path in paths.items()}
    graphs = {label: timeline.index_bin(path) for label, path in paths.items()}
    canonical = lambda value: value.removeprefix('urn:smpte:umid:').replace('.', '').replace('-', '').lower()
    owner = canonical(evidence['mobId'])
    native = {'initial-100': evidence['initial'], 'with-sentinel': evidence['baseline'],
              'sentinel-only': evidence['after'], 'cleaned': evidence['final']}
    assert [len(native[key]) for key in native] == [100, 101, 1, 0]
    assert raw['original']['records'] == []
    for label, expected in native.items():
        markers = [marker for mob in graphs[label]['mobs'] for marker in mob['markers']]
        assert len(markers) == len(raw[label]['records']) == len(expected)
        assert len({marker['guid'] for marker in markers}) == len(expected)
        for marker in markers:
            matches = [item for item in expected if item['guid'] == marker['guid']]
            assert len(matches) == 1
            item = matches[0]
            assert canonical(marker['path'][0]) == owner
            for field in ['name', 'comment', 'user', 'color']:
                assert marker[field] == item[field]
            assert marker['location']['sequenceFrame'] == item.get('offset', 0)
            assert marker['location']['trackIndex'] == item['track_label']['number']
            assert marker['location']['mediaKind'] == ('sound' if item['track_label'].get('type') == 'TRACKTYPE_SOUND' else 'picture')
    raw_index = lambda label: {record['attributes']['_ATN_CRM_ID']:
                              {key: value for key, value in record.items() if key != 'objectIndex'}
                              for record in raw[label]['records']}
    original_markers, added = raw_index('initial-100'), raw_index('with-sentinel')
    assert len(original_markers) == 100 and len(added) == 101
    for guid, record in original_markers.items():
        assert added[guid] == record
    sentinel = evidence['sentinel']['guid']
    assert set(added) - set(original_markers) == {sentinel}
    assert raw_index('sentinel-only') == {sentinel: added[sentinel]}
    baseline_fields = {key: graphs['original'][key] for key in ['mobs', 'warnings', 'complete', 'nodeCount']}
    assert {key: graphs['cleaned'][key] for key in baseline_fields} == baseline_fields
    without_markers = lambda graph: [{key: value for key, value in mob.items() if key != 'markers'} for mob in graph['mobs']]
    for label, graph in graphs.items():
        assert without_markers(graph) == without_markers(graphs['original']), label
        for key in ['warnings', 'complete', 'nodeCount']:
            assert graph[key] == graphs['original'][key], (label, key)
    assert {str(path): hashlib.sha256(path.read_bytes()).hexdigest() for path in protected} == hashes
    result = {'counts': {key: len(value['records']) for key, value in raw.items()},
              'unrequestedRawMarkerPreserved': True, 'originalRawMarkersPreservedOnAdd': True,
              'decodedBaselineRestored': True, 'protectedHashes': hashes,
              'completeGraphEquivalenceVerified': False, 'warnings': graphs['original']['warnings'],
              'scope': 'Saved reachable markers, raw TMBC fields excluding object indices, and all fields emitted by the timeline decoder. Opaque effects, unsaved state and full AVB bytes remain unverified.'}
    with (root / 'saved-removal-verification.json').open('x', encoding='utf-8') as output:
        json.dump(result, output, indent=2)
    return {'root': str(root), **{key: result[key] for key in ['counts', 'unrequestedRawMarkerPreserved', 'decodedBaselineRestored', 'completeGraphEquivalenceVerified']}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('evidence_directory', type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.evidence_directory)))
