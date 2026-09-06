"""Build the qualified two-cut Sonoma research fixture from an Avid-exported AAF.

Preserves the exported source descriptors; does not write an Avid project/bin.
The fixed 30 fps three-track fixture is not a general AAF timeline exporter.
"""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
import aaf2

def build(source,output):
    source=Path(source).resolve();output=Path(output).resolve()
    if source.stat().st_size>50*1024*1024:raise ValueError('Research AAF exceeds size limit')
    before=hashlib.sha256(source.read_bytes()).hexdigest()
    with aaf2.open(str(source)) as f:
        masters=list(f.content.mastermobs())
        if len(masters)!=1 or not masters[0].name.startswith('Sonoma_Escape_RoughCut_v1_preview'):
            raise ValueError('Expected the exported Sonoma preview master')
        for slot_id in [1,2,3]:
            slot=masters[0].slot_at(slot_id)
            if slot.edit_rate!=30 or slot.segment.length<3360:raise ValueError('Unexpected source track rate or duration')
    with source.open('rb') as src,output.open('xb') as dst:shutil.copyfileobj(src,dst)
    with aaf2.open(str(output),'rw') as f:
        master=list(f.content.mastermobs())[0]
        composition=f.create.CompositionMob('MCP_Sonoma_AAF_Selects')
        composition.usage='Usage_TopLevel';f.content.mobs.append(composition)
        for slot_id,kind in [(1,'picture'),(2,'sound'),(3,'sound')]:
            slot=composition.create_empty_sequence_slot(30,slot_id=slot_id,media_kind=kind)
            slot.name='V1' if slot_id==1 else 'A'+str(slot_id-1)
            slot['PhysicalTrackNumber'].value=1 if slot_id==1 else slot_id-1
            for start in [2850,3300]:
                slot.segment.components.append(master.create_source_clip(slot_id=slot_id,start=start,length=60,media_kind=kind))
            slot.segment.length=120
        mob_id=str(composition.mob_id)
    if hashlib.sha256(source.read_bytes()).hexdigest()!=before:raise ValueError('Input AAF changed')
    with aaf2.open(str(output)) as f:
        composition=next(m for m in f.content.compositionmobs() if str(m.mob_id)==mob_id)
        for slot in composition.slots:
            if slot.segment.length!=120 or [(c.start,c.length) for c in slot.segment.components]!=[(2850,60),(3300,60)]:
                raise ValueError('Generated AAF conformance failed')
    return {'output':str(output),'mobId':mob_id,'frames':120,'rate':30,'tracks':3,'inputUnchanged':True}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source');parser.add_argument('output');args=parser.parse_args()
    print(json.dumps(build(args.source,args.output)))
