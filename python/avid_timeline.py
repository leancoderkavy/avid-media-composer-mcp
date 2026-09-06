"""Bounded semantic index of saved AVB tracks, source ranges and subclip bounds."""
import argparse
import hashlib
import json
import math
from pathlib import Path


def descriptor_metadata(descriptor):
    """Selected saved declarations only; never open or resolve locator paths."""
    if descriptor is None:
        return None
    def class_id(value):
        return value.class_id.decode('ascii', errors='replace')
    values = {}
    for field in ('edit_rate', 'length', 'sample_rate', 'channels', 'quantization_bits',
                  'stored_width', 'stored_height', 'mob_kind'):
        value = getattr(descriptor, field, None)
        if value is not None:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > 9007199254740991:
                raise ValueError('Invalid descriptor numeric declaration')
            values[field] = value
    result = {'classId': class_id(descriptor), 'values': values, 'locator': None}
    locator = getattr(descriptor, 'locator', None)
    if locator is not None:
        paths = []
        for field in ('path', 'path_posix', 'path_utf8', 'path2_utf8', 'last_known_volume', 'last_known_volume_utf8'):
            value = getattr(locator, field, None)
            if value is not None:
                if not isinstance(value, str) or len(value) > 4096:
                    raise ValueError('Invalid or oversized locator declaration')
                paths.append({'field': field, 'value': value})
        result['locator'] = {'classId': class_id(locator), 'paths': paths}
        identity = getattr(locator, 'mob_id', None)
        if identity is not None:
            result['locator']['mobId'] = str(identity)
    physical = getattr(descriptor, 'physical_media', None)
    if physical is not None:
        result['physicalMediaClassId'] = class_id(physical)
    return result


def index_bin(filename, max_nodes=10000):
    import avb
    file=Path(filename)
    before=hashlib.sha256(file.read_bytes()).hexdigest()
    warnings=[]
    count=0
    mobs=[]
    with avb.open(str(file)) as source:
        for mob in source.content.mobs:
            if len(mobs)>=1000:
                raise ValueError('Mob count exceeds index limit')
            rate=float(mob.edit_rate)
            attributes=getattr(mob,'attributes',None) or {}
            start=int(attributes.get('_START',0)) if mob.usage_code==2 else 0
            end=int(attributes.get('_END',mob.length)) if mob.usage_code==2 else int(mob.length)
            if rate<=0 or start<0 or end<start or end>mob.length:
                raise ValueError('Invalid mob edit rate or bounds')
            tracks=[]
            for ordinal,track in enumerate(mob.tracks):
                if len(tracks)>=128:
                    raise ValueError('Track count exceeds index limit')
                nodes=[]

                def visit(component, position, depth, channel=None):
                    nonlocal count
                    count+=1
                    if count>max_nodes or depth>32:
                        raise ValueError('Timeline traversal limit exceeded')
                    kind=component.class_id.decode('ascii',errors='replace')
                    component_rate=float(component.edit_rate)
                    if component_rate!=rate:
                        warnings.append({'mobId':str(mob.mob_id),'track':ordinal,'code':'MIXED_EDIT_RATE','kind':kind,
                                         'mobRate':rate,'componentRate':component_rate,'mapping':'omitted; no rate conversion inferred'})
                        return False
                    if kind=='SEQU':
                        for _,offset,child in component.positions():
                            if visit(child,position+offset,depth+1) is False:
                                warnings.append({'mobId':str(mob.mob_id),'track':ordinal,'code':'UNRESOLVED_SEQUENCE_OFFSETS',
                                                 'kind':kind,'mapping':'remaining sequence nodes omitted after mixed-rate component'})
                                return False
                        return
                    length=int(getattr(component,'length',0))
                    left=max(position,start)
                    right=min(position+length,end)
                    if right<=left:
                        return
                    node={'kind':kind,'timelineStart':left-start,'timelineEnd':right-start}
                    if kind=='TKFX' and component.effect_id=='EFF2_AUDIO_CHANNEL_COMBINER':
                        children=list(component.tracks)
                        qualified=(component.media_kind=='sound' and len(children)==2
                                   and [getattr(child,'index',None) for child in children]==[1,2]
                                   and getattr(component,'info_is_reversed',None)==0
                                   and getattr(component,'mc_mode',None)==0
                                   and getattr(component,'num_scalars',None)==0
                                   and getattr(component,'param_list',None) is None
                                   and getattr(component,'keyframes',None) is None)
                        qualified=qualified and all(
                            getattr(child,'component',None) is not None
                            and child.component.class_id==b'SCLP'
                            and child.component.media_kind=='sound'
                            and float(child.component.edit_rate)==rate
                            and child.component.length==length for child in children)
                        if qualified:
                            for child in children:
                                visit(child.component,position,depth+1,
                                      {'channelIndex':int(child.index),'channelCount':2})
                            return
                    if kind=='SCLP':
                        node.update(sourceMobId=str(component.mob_id),sourceTrackId=int(component.track_id),
                                    sourceStart=int(component.start_time)+left-position)
                        if channel is not None:node['channelCombiner']=channel
                    elif kind=='TCCP':
                        node['timecode']={'start':int(component.start)+left-position,'fps':int(component.fps),'flags':int(component.flags)}
                    elif kind!='FILL':
                        node['opaque']=True
                        if kind=='TKFX':
                            effect_id=getattr(component,'effect_id',None)
                            if effect_id is not None:
                                if not isinstance(effect_id,str) or len(effect_id)>1024:
                                    raise ValueError('Invalid or oversized effect identifier')
                                node['effect']={'id':effect_id,
                                                'hasParameters':getattr(component,'param_list',None) is not None,
                                                'hasKeyframes':getattr(component,'keyframes',None) is not None}
                        warnings.append({'mobId':str(mob.mob_id),'track':ordinal,'code':'OPAQUE_COMPONENT','kind':kind})
                    nodes.append(node)

                if getattr(track,'component',None) is not None:
                    visit(track.component,0,0)
                tracks.append({'ordinal':ordinal,'index':int(getattr(track,'index',ordinal)),
                               'mediaKind':str(track.media_kind),'nodes':nodes})
            mobs.append({'mobId':str(mob.mob_id),'name':mob.name or '', 'mobType':mob.mob_type,
                         'usageCode':int(mob.usage_code),'rate':rate,'duration':end-start,
                         'sourceBounds':{'start':start,'end':end},'tracks':tracks,
                         'descriptor':descriptor_metadata(getattr(mob,'descriptor',None))})
    if hashlib.sha256(file.read_bytes()).hexdigest()!=before:
        raise ValueError('Bin changed while indexing; retry after saving')
    return {'schema':1,'file':str(file.resolve()),'sha256':before,'mobs':mobs,'warnings':warnings[:1000],
            'complete':not warnings,'nodeCount':count,'stateOrigin':'saved-bin; unsaved editor changes are not included'}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file')
    parser.add_argument('--max-nodes',type=int,default=10000)
    args=parser.parse_args()
    if not 1<=args.max_nodes<=10000:
        parser.error('max-nodes must be 1–10000')
    print(json.dumps(index_bin(args.file,args.max_nodes),separators=(',',':')))
