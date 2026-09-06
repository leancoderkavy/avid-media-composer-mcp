"""Read retained qualification bins; never writes to an AVB or opens media."""
import hashlib
import json
from pathlib import Path
import sys
import avb

assert len(sys.argv) == 2, 'Provide the native-comment evidence directory'
root = Path(sys.argv[1]).resolve()
evidence = json.loads((root / 'evidence.json').read_text(encoding='utf-8'))
assert evidence['setAndClearReopened'] is True
records = []
for label in ['baseline', 'set', 'clear']:
    file = root / (label + '.avb')
    before = hashlib.sha256(file.read_bytes()).hexdigest()
    with avb.open(str(file)) as handle:
        sequences = [m for m in handle.content.mobs if m.mob_type == 'CompositionMob' and m.usage_code == 0]
        assert len(sequences) == 1, 'Ambiguous saved composition'
        user = sequences[0].attributes.get('_USER', {})
        present = 'Comments' in user
        value = user.get('Comments')
        assert value is None or isinstance(value, str)
        records.append({'label': label, 'sha256': before, 'name': sequences[0].name,
                        'present': present, 'value': value})
    assert hashlib.sha256(file.read_bytes()).hexdigest() == before
assert len({r['name'] for r in records}) == 1
assert records[0]['value'] in (None, '')
assert records[1]['present'] and records[1]['value'] == 'MCP comment qualification - reviewed'
assert records[2]['value'] in (None, '')
result = {'verified': True, 'records': records,
          'scope': 'Independent pyavb reads of the retained Comments attribute, preserving file hashes; no unknown-field equivalence or media verification inferred'}
with (root / 'saved-comment-attributes.json').open('x', encoding='utf-8') as output:
    json.dump(result, output, indent=2)
print(json.dumps(result))
