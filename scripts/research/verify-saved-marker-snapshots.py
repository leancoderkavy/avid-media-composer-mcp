"""Compare owned live-marker qualification snapshots without opening Avid."""
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


def verify(root, compare_positions=False):
    root = root.resolve(strict=True)
    evidence_file = root / 'evidence.json'
    evidence_hash = hashlib.sha256(evidence_file.read_bytes()).hexdigest()
    evidence = json.loads(evidence_file.read_text(encoding='utf-8'))
    assert evidence['markerBaselineRestored'] is True
    assert evidence['sourceUnchanged'] is True
    inspector = load_module('marker_inspector', Path(__file__).with_name('inspect-saved-markers.py'))
    timeline = load_module('timeline', Path(__file__).resolve().parents[2] / 'python' / 'avid_timeline.py')
    inventories = {label: inspector.inspect(root / (label + '.avb')) for label in
                   ['before-markers', 'persisted-markers', 'cleaned-markers']}
    assert inventories['before-markers']['records'] == []
    assert inventories['cleaned-markers']['records'] == []
    saved = inventories['persisted-markers']
    assert len(saved['records']) == len(evidence['markers'])
    for expected in evidence['markers']:
        matches = [record for record in saved['records']
                   if record['attributes'].get('_ATN_CRM_ID') == expected['guid']]
        assert len(matches) == 1
        record = matches[0]
        for field, attr in [('name', '_ATN_CRM_MARKNAME'), ('comment', '_ATN_CRM_COM'),
                            ('color', '_ATN_CRM_COLOR')]:
            assert record['attributes'][attr] == expected[field]
        assert record['attributes']['_ATN_CRM_USER'] == 'Avid MCP'
        paths = [ref['path'] for ref in saved['references'] if ref['objectIndex'] == record['objectIndex']]
        assert len(paths) == 1
        assert paths[0][-3:] == ['attributes', '_TMP_CRM', '0']
        canonical = lambda value: value.removeprefix('urn:smpte:umid:').replace('.', '').replace('-', '').lower()
        assert canonical(paths[0][0]) == canonical(evidence['mobId'])
        if compare_positions:
            location = next(ref['location'] for ref in saved['references'] if ref['objectIndex'] == record['objectIndex'])
            native = [item for item in evidence['persisted'] if item['guid'] == expected['guid']]
            assert len(native) == 1
            assert location['status'] in ['direct_sequence', 'declared_effect_input']
            assert location['sequenceFrame'] == expected['offset']
            assert location['sequenceFrame'] == native[0].get('offset', 0)
            assert location['trackIndex'] == expected['track']['number']
            assert location['trackIndex'] == native[0]['track_label']['number']
            assert native[0]['track_label'].get('type', 'TRACKTYPE_PICTURE') == expected['track']['type']
            assert location['mediaKind'] == {'TRACKTYPE_PICTURE': 'picture', 'TRACKTYPE_SOUND': 'sound'}[expected['track']['type']]
    graphs = {label: timeline.index_bin(root / (label + '.avb')) for label in inventories}
    for label in ['persisted-markers', 'cleaned-markers']:
        for field in ['mobs', 'warnings', 'complete', 'nodeCount']:
            if field == 'mobs':
                without_markers = lambda graph: [{key: value for key, value in mob.items() if key != 'markers'} for mob in graph['mobs']]
                assert without_markers(graphs[label]) == without_markers(graphs['before-markers']), (label, field)
            else:
                assert graphs[label][field] == graphs['before-markers'][field], (label, field)
    assert hashlib.sha256(evidence_file.read_bytes()).hexdigest() == evidence_hash
    for inventory in inventories.values():
        assert hashlib.sha256(Path(inventory['file']).read_bytes()).hexdigest() == inventory['sha256']
    report = {'inventories': inventories, 'markerIdentityAndTextVerified': True,
              'declaredPositionsMatchNativeFixture': compare_positions,
              'decodedTimelineFieldsUnchanged': True, 'savedMarkerRemovalVerified': True,
              'sequencePositionsVerified': False, 'completeGraphEquivalenceVerified': False,
              'warnings': graphs['before-markers']['warnings'],
              'scope': 'Owned saved snapshots; TMBC identities/text/color labels and reference paths. '
                       'Component offsets are not sequence positions. Opaque effects remain unverified.'}
    with (root / ('saved-marker-position-verification.json' if compare_positions else 'saved-marker-verification.json')).open('x', encoding='utf-8') as output:
        json.dump(report, output, indent=2)
    return {'root': str(root), 'markersVerified': len(saved['records']),
            'savedMarkerRemovalVerified': True, 'decodedTimelineFieldsUnchanged': True,
            'declaredPositionsMatchNativeFixture': compare_positions,
            'sequencePositionsVerified': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('evidence_directory', type=Path)
    parser.add_argument('--compare-positions', action='store_true')
    args = parser.parse_args()
    print(json.dumps(verify(args.evidence_directory, args.compare_positions)))
