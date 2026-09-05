"""Reference-preserving AAF inspection and straight-cut composition authoring."""
import json
import sys
import hashlib
import shutil
from pathlib import Path
from fractions import Fraction
import aaf2

def inspect(file):
    file=Path(file)
    if file.stat().st_size>64*1024*1024:raise ValueError('AAF exceeds 64 MiB limit')
    with aaf2.open(str(file)) as f:
        if len(f.content.essencedata):raise ValueError('Embedded essence is not supported by this builder')
        if list(f.content.compositionmobs()):raise ValueError('Supply an exported master AAF without existing compositions')
        masters=[];locators=[]
        def descriptor(value,depth=0):
            if depth>8:raise ValueError('Descriptor nesting limit exceeded')
            for loc in value.get('Locator',[]):
                prop=loc.get('URLString',None)
                url=prop.value if prop is not None else None
                if not isinstance(url,str):raise ValueError('Unsupported locator')
                locators.append(url)
            for child in value.get('FileDescriptors',[]):descriptor(child,depth+1)
        for mob in f.content.sourcemobs():
            if mob.descriptor:descriptor(mob.descriptor)
        for mob in f.content.mastermobs():
            slots=[]
            for slot in mob.slots:
                if not hasattr(slot,'edit_rate'):continue
                slots.append({'slotId':slot.slot_id,'kind':slot.segment.media_kind.lower(),'rate':str(slot.edit_rate),'length':slot.segment.length})
            masters.append({'mobId':str(mob.mob_id),'name':mob.name,'slots':slots})
        if not 1<=len(masters)<=100 or not 1<=len(set(locators))<=100:raise ValueError('Unsupported master or locator count')
        return {'masters':masters,'locators':sorted(set(locators))}

def build(request):
    source=Path(request['source']);output=Path(request['output']);info=inspect(source)
    before=hashlib.sha256(source.read_bytes()).hexdigest()
    if before!=request['expectedSha256']:raise ValueError('AAF template changed')
    rate=Fraction(request['rate']);selects=request['selects'];tracks=request['tracks']
    if rate<=0 or rate>120 or not 1<=len(selects)<=500 or not 1<=len(tracks)<=16:raise ValueError('AAF build limits exceeded')
    if len({t['name'] for t in tracks})!=len(tracks):raise ValueError('Duplicate destination track names')
    total=0
    for select in selects:
        if type(select['start']) is not int or type(select['length']) is not int or select['start']<0 or select['length']<=0:raise ValueError('Invalid source range')
        master=next((m for m in info['masters'] if m['mobId']==select['mobId']),None)
        if master is None or len(select['slotIds'])!=len(tracks):raise ValueError('Unknown master or invalid track mapping')
        for track,slot_id in zip(tracks,select['slotIds']):
            slot=next((s for s in master['slots'] if s['slotId']==slot_id),None)
            if not slot or slot['kind']!=track['kind'] or Fraction(slot['rate'])!=rate:raise ValueError('Source kind/rate mismatch; resampling is unsupported')
            if select['start']+select['length']>slot['length']:raise ValueError('Source range exceeds track length')
        total+=select['length']
    if total>2147483647:raise ValueError('Composition too long')
    with source.open('rb') as src,output.open('xb') as dst:shutil.copyfileobj(src,dst)
    with aaf2.open(str(output),'rw') as f:
        composition=f.create.CompositionMob(request['name']);composition.usage='Usage_TopLevel';f.content.mobs.append(composition)
        counts={'picture':0,'sound':0}
        for index,track in enumerate(tracks):
            if track['kind'] not in counts:raise ValueError('Only picture and sound tracks are supported')
            counts[track['kind']]+=1
            slot=composition.create_empty_sequence_slot(str(rate),slot_id=index+1,media_kind=track['kind']);slot.name=track['name'];slot['PhysicalTrackNumber'].value=counts[track['kind']]
            for select in selects:
                master=next(m for m in f.content.mastermobs() if str(m.mob_id)==select['mobId'])
                slot.segment.components.append(master.create_source_clip(slot_id=select['slotIds'][index],start=select['start'],length=select['length'],media_kind=track['kind']))
            slot.segment.length=total
        mob_id=str(composition.mob_id)
    if hashlib.sha256(source.read_bytes()).hexdigest()!=before:raise ValueError('Template changed during build')
    with aaf2.open(str(output)) as f:
        composition=next(m for m in f.content.compositionmobs() if str(m.mob_id)==mob_id)
        for index,slot in enumerate(composition.slots):
            actual=[(str(c.mob_id),c.slot_id,c.start,c.length) for c in slot.segment.components]
            expected=[(s['mobId'],s['slotIds'][index],s['start'],s['length']) for s in selects]
            if actual!=expected or slot.segment.length!=total:raise ValueError('AAF output conformance failed')
    return {'output':str(output),'mobId':mob_id,'frames':total,'rate':str(rate),'tracks':len(tracks),'cuts':len(selects),'conformanceVerified':True,'hostImportVerified':False}

if __name__=='__main__':
    with open(sys.argv[1],encoding='utf8') as stream:request=json.loads(stream.read(1024*1024+1))
    print(json.dumps(inspect(request['source']) if request['action']=='inspect' else build(request)))
