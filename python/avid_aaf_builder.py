"""Reference-preserving AAF inspection and straight-cut composition authoring."""
import json
import sys
import hashlib
import shutil
from pathlib import Path
from fractions import Fraction
import aaf2
from aaf2.auid import AUID

COMBINER='6b46dd7a-132d-4856-ab21-8b751d8462ec'
BYTE_ORDER='c0038672-a8cf-11d3-a05b-006094eb75cb'
EFFECT_ID='93994bd6-a81d-11d3-a05b-006094eb75cb'
EFFECT_BYTES=list(b'EFF2_AUDIO_CHANNEL_COMBINER\0')

def stereo_inputs(component):
    if not isinstance(component,aaf2.components.OperationGroup) or str(component.operation.auid)!=COMBINER:
        raise ValueError('Unsupported stereo operation')
    operation=component.operation
    if operation.media_kind.lower()!='sound' or operation.number_inputs!=1 or operation['IsTimeWarp'].value is not False or operation['Bypass'].value!=0:
        raise ValueError('Unsupported stereo operation definition')
    if component.media_kind.lower()!='sound' or any(p.name not in ('DataDefinition','Length','Operation','Parameters','InputSegments') for p in component.properties()):
        raise ValueError('Unsupported stereo rendering')
    parameters=list(component.parameters)
    if len(parameters)!=2 or any(not isinstance(p,aaf2.misc.ConstantValue) for p in parameters):
        raise ValueError('Unsupported stereo parameters')
    values={str(p['Definition'].value):p['Value'].value for p in parameters}
    if values.get(BYTE_ORDER)!=18761 or values.get(EFFECT_ID)!=EFFECT_BYTES:
        raise ValueError('Unsupported stereo parameter values')
    clips=list(component.segments)
    if len(clips)!=2 or any(not isinstance(c,aaf2.components.SourceClip) or c.media_kind.lower()!='sound' or c.length!=component.length for c in clips):
        raise ValueError('Unsupported stereo inputs')
    if clips[0].mob_id!=clips[1].mob_id or clips[0].start!=clips[1].start or clips[0].slot_id==clips[1].slot_id:
        raise ValueError('Stereo inputs must be distinct synchronized channels of one master')
    return clips

def combiner_definition(f):
    existing=next((d for d in f.dictionary['OperationDefinitions'] if str(d.auid)==COMBINER),None)
    if existing:return existing
    definitions=[]
    for uid,name,typedef in [(BYTE_ORDER,'AvidParameterByteOrder','aafUInt16'),(EFFECT_ID,'AvidEffectID','AvidBagOfBits')]:
        definition=next((d for d in f.dictionary['ParameterDefinitions'] if str(d.auid)==uid),None)
        if definition is None:
            definition=f.create.ParameterDef(uid,name,'',typedef);f.dictionary.register_def(definition)
        definitions.append(definition)
    operation=f.create.OperationDef(COMBINER,'Audio Channel Combiner','');operation.media_kind='sound'
    operation.number_inputs=1;operation['IsTimeWarp'].value=False;operation['Bypass'].value=0
    operation['OperationCategory'].value='OperationCategory_Effect'
    for definition in definitions:operation.parameters.append(definition)
    f.dictionary.register_def(operation)
    return operation

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
            formats=[t.value for t in slot.get('TimelineMobAttributeList',[]) if t.name=='_TRACK_FORMAT']
            stereo=formats==[2]
            if formats and not stereo:raise ValueError('Unsupported track format')
            if stereo and kind!='sound':raise ValueError('Stereo requires sound')
            components=list(segment.components)
            if not 1<=len(components)<=500:raise ValueError('Composition cut limit exceeded')
            cuts=[];position=0
            for component in components:
                clips=stereo_inputs(component) if stereo else [component]
                for channel,clip in enumerate(clips,1):
                    if not isinstance(clip,aaf2.components.SourceClip) or clip.media_kind.lower()!=kind:raise ValueError('Only direct source clips are supported')
                    master=masters.get(str(clip.mob_id))
                    source=next((s for s in master['slots'] if s['slotId']==clip.slot_id),None) if master else None
                    if not source or source['kind']!=kind or Fraction(source['rate'])!=rate:raise ValueError('Source kind/rate or master mismatch')
                    if clip.start<0 or clip.length<=0 or clip.start+clip.length>source['length']:raise ValueError('Source range exceeds track length')
                    cuts.append({'mobId':str(clip.mob_id),'slotId':clip.slot_id,'start':clip.start,'length':clip.length,'position':position,**({'channelIndex':channel} if stereo else {})})
                position+=component.length
            if position>2147483647 or position!=segment.length or (frames is not None and frames!=position):raise ValueError('Composition duration mismatch')
            frames=position
            tracks.append({'slotId':slot.slot_id,'name':slot.name or '', 'kind':kind,'cuts':cuts,**({'channels':2} if stereo else {})})
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
        for track,mapping in zip(tracks,select['slotIds']):
            stereo=track.get('channels')==2
            if 'channels' in track and (not stereo or track['kind']!='sound'):raise ValueError('Stereo requires sound')
            if stereo:
                if not isinstance(mapping,list) or len(mapping)!=2 or len(set(mapping))!=2:raise ValueError('Stereo needs two distinct source slots')
                slots=mapping
            else:slots=[mapping]
            for slot_id in slots:
                if type(slot_id) is not int or slot_id<=0:raise ValueError('Invalid source slot mapping')
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
            stereo=track.get('channels')==2
            if stereo:slot['TimelineMobAttributeList'].append(f.create.TaggedValue('_TRACK_FORMAT',2))
            for select in selects:
                master=next(m for m in f.content.mastermobs() if str(m.mob_id)==select['mobId'])
                mapping=select['slotIds'][index]
                if stereo:
                    operation=combiner_definition(f)
                    component=f.create.OperationGroup(operation,length=select['length'],media_kind='sound')
                    component.parameters.append(f.create.ConstantValue(AUID(BYTE_ORDER),18761))
                    component.parameters.append(f.create.ConstantValue(AUID(EFFECT_ID),EFFECT_BYTES))
                    for source_slot in mapping:component.segments.append(master.create_source_clip(slot_id=source_slot,start=select['start'],length=select['length'],media_kind='sound'))
                else:component=master.create_source_clip(slot_id=mapping,start=select['start'],length=select['length'],media_kind=track['kind'])
                slot.segment.components.append(component)
            slot.segment.length=total
        mob_id=str(composition.mob_id)
    if hashlib.sha256(source.read_bytes()).hexdigest()!=before:raise ValueError('Template changed during build')
    with aaf2.open(str(output)) as f:
        composition=next(m for m in f.content.compositionmobs() if str(m.mob_id)==mob_id)
        for index,slot in enumerate(composition.slots):
            stereo=tracks[index].get('channels')==2
            actual=[[(str(c.mob_id),c.slot_id,c.start,c.length) for c in (stereo_inputs(component) if stereo else [component])] for component in slot.segment.components]
            expected=[[(s['mobId'],sid,s['start'],s['length']) for sid in (s['slotIds'][index] if stereo else [s['slotIds'][index]])] for s in selects]
            if actual!=expected or slot.segment.length!=total:raise ValueError('AAF output conformance failed')
    inspect_selects(output)
    return {'output':str(output),'mobId':mob_id,'frames':total,'rate':str(rate),'tracks':len(tracks),'cuts':len(selects),'conformanceVerified':True,'hostImportVerified':False}

if __name__=='__main__':
    with open(sys.argv[1],encoding='utf8') as stream:request=json.loads(stream.read(1024*1024+1))
    actions={'inspect':lambda:inspect(request['source']),'inspect_selects':lambda:inspect_selects(request['source']),'build':lambda:build(request)}
    if request['action'] not in actions:raise ValueError('Unsupported AAF action')
    print(json.dumps(actions[request['action']](),ensure_ascii=True))
