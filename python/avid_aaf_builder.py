"""Reference-preserving AAF inspection and straight-cut composition authoring."""
import json
import sys
import hashlib
import shutil
from pathlib import Path
from fractions import Fraction
import aaf2

def inspect(file,allow_composition=False):
    file=Path(file)
    if file.stat().st_size>64*1024*1024:raise ValueError('AAF exceeds 64 MiB limit')
    with aaf2.open(str(file)) as f:
        if len(f.content.essencedata):raise ValueError('Embedded essence is not supported by this builder')
        if not allow_composition and list(f.content.compositionmobs()):raise ValueError('Supply an exported master AAF without existing compositions')
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

def inspect_selects(file):
    """Describe the same-rate, direct-master straight-cut subset before host import."""
    info=inspect(file,allow_composition=True)
    with aaf2.open(str(file)) as f:
        compositions=list(f.content.compositionmobs())
        if len(compositions)!=1:raise ValueError('Expected exactly one composition')
        composition=compositions[0];slots=list(composition.slots)
        if not 1<=len(slots)<=16:raise ValueError('Composition track limit exceeded')
        tracks=[];rate=None;frames=None;ids=set()
        masters={master['mobId']:master for master in info['masters']}
        for slot in slots:
            if slot.slot_id in ids:raise ValueError('Duplicate composition slot')
            ids.add(slot.slot_id)
            if not hasattr(slot,'edit_rate') or slot.origin!=0:raise ValueError('Unsupported slot rate or origin')
            current_rate=Fraction(slot.edit_rate)
            if current_rate<=0 or current_rate>120 or (rate is not None and rate!=current_rate):raise ValueError('Composition rate mismatch')
            rate=current_rate;segment=slot.segment
            if not isinstance(segment,aaf2.components.Sequence):raise ValueError('Expected straight-cut sequence')
            kind=segment.media_kind.lower()
            if kind not in ('picture','sound'):raise ValueError('Unsupported track kind')
            components=list(segment.components)
            if not 1<=len(components)<=500:raise ValueError('Composition cut limit exceeded')
            cuts=[];position=0
            for clip in components:
                if not isinstance(clip,aaf2.components.SourceClip) or clip.media_kind.lower()!=kind:raise ValueError('Only direct source clips are supported')
                master=masters.get(str(clip.mob_id))
                source=next((s for s in master['slots'] if s['slotId']==clip.slot_id),None) if master else None
                if not source or source['kind']!=kind or Fraction(source['rate'])!=rate:raise ValueError('Source kind/rate or master mismatch')
                if clip.start<0 or clip.length<=0 or clip.start+clip.length>source['length']:raise ValueError('Source range exceeds track length')
                cuts.append({'mobId':str(clip.mob_id),'slotId':clip.slot_id,'start':clip.start,'length':clip.length,'position':position})
                position+=clip.length
            if position>2147483647 or position!=segment.length or (frames is not None and frames!=position):raise ValueError('Composition duration mismatch')
            frames=position
            tracks.append({'slotId':slot.slot_id,'name':slot.name or '', 'kind':kind,'cuts':cuts})
        return {**info,'composition':{'mobId':str(composition.mob_id),'name':composition.name or '', 'rate':str(rate),'frames':frames,'tracks':tracks}}

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
    actions={'inspect':lambda:inspect(request['source']),'inspect_selects':lambda:inspect_selects(request['source']),'build':lambda:build(request)}
    if request['action'] not in actions:raise ValueError('Unsupported AAF action')
    print(json.dumps(actions[request['action']](),ensure_ascii=True))
