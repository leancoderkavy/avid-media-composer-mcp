"""Bounded semantic index of saved AVB tracks, source ranges and subclip bounds."""
import argparse
import hashlib
import json
import math
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path


def parameter_fingerprint(value):
    """Hash bounded known saved parameter structures, without interpreting them."""
    count=0
    byte_count=0
    def encode(item,depth=0):
        nonlocal count,byte_count
        count+=1
        if count>2048 or depth>16:
            raise ValueError('Parameter fingerprint traversal limit')
        if item is None:return ['null']
        if isinstance(item,bool):return ['bool',item]
        if isinstance(item,int):
            if abs(item)>2**63:raise ValueError('Parameter integer limit')
            return ['int',item]
        if isinstance(item,float):
            if not math.isfinite(item):raise ValueError('Nonfinite parameter')
            return ['float',item.hex()]
        if isinstance(item,str):
            if len(item)>4096:raise ValueError('Parameter string limit')
            byte_count+=len(item.encode('utf-8'))
            if byte_count>1048576:raise ValueError('Parameter byte limit')
            return ['str',item]
        if isinstance(item,uuid.UUID):return ['uuid',str(item)]
        if isinstance(item,(bytes,bytearray)):
            byte_count+=len(item)
            if byte_count>1048576:raise ValueError('Parameter byte limit')
            return ['bytes',len(item),hashlib.sha256(item).hexdigest()]
        if isinstance(item,(list,tuple)):
            if len(item)>1024:raise ValueError('Parameter collection limit')
            return ['list',[encode(child,depth+1) for child in item]]
        if (type(item).__module__=='avb.misc' and type(item).__name__ in
            ('ParameterItem','CFUserParam','EffectParamList','EffectParam')):
            properties=item.property_data
            if len(properties)>128 or any(not isinstance(key,str) or len(key)>256 for key in properties):
                raise ValueError('Parameter property limit')
            return [type(item).__name__,{key:encode(properties[key],depth+1) for key in sorted(properties)}]
        raise ValueError('Unsupported parameter class')
    if value is None:return None
    try:
        encoded=json.dumps(encode(value),sort_keys=True,separators=(',',':'),ensure_ascii=True).encode('utf-8')
        return {'schema':1,'sha256':hashlib.sha256(encoded).hexdigest()}
    except (ValueError,TypeError,UnicodeError):
        return None


def linear_lut_declaration(data):
    """Recognize bounded saved XML declarations; never infer applied color math."""
    if not isinstance(data,(bytes,bytearray)) or len(data)>65536:
        return None
    try:
        text=bytes(data).removesuffix(b'\x00').decode('utf-8')
        if '<!' in text or '<?' in text:
            return None
        root=ET.fromstring(text)
        if root.tag!='ColorTransformationList' or root.attrib or len(root)!=1:
            return None
        transform=root[0]
        if transform.tag!='ColorTransformation' or transform.attrib or len(transform)!=1:
            return None
        lut=transform[0]
        if lut.tag!='LinearLut' or lut.attrib:
            return None
        tags=[child.tag for child in lut]
        if tags not in (['Name','BitDepth','Black','White'],['Name','BitDepth','Black','White','Inverted']):
            return None
        if any(child.attrib or len(child) for child in lut):
            return None
        name=lut[0].text or ''
        if len(name)>256 or any(not (child.text or '').isascii() or not (child.text or '').isdigit() for child in lut[1:4]):
            return None
        depth,black,white=(int(child.text) for child in lut[1:4])
        if not 1<=depth<=32 or not 0<=black<white<2**depth:
            return None
        if len(lut)==5 and (lut[4].text or '').strip():
            return None
        return {'name':name,'bitDepth':depth,'black':black,'white':white,'invertedFlagPresent':len(lut)==5}
    except (ET.ParseError,UnicodeError,ValueError):
        return None


def color_declaration(component):
    if getattr(component,'effect_id',None)!='EFF2_LUTSFX':
        return None
    parameters=getattr(component,'param_list',None)
    if parameters is None or len(parameters)>128:
        return None
    matches=[p for p in parameters if str(getattr(p,'uuid',''))=='bd7f5cd8-15fd-424e-a34d-11642fbbb867']
    if len(matches)!=1:
        return None
    parameter=matches[0];value=getattr(parameter,'value',None)
    if (getattr(parameter,'value_type',None)!=4 or getattr(parameter,'enable',None) is not True
        or getattr(parameter,'control_track',None) is not None
        or str(getattr(value,'uuid',''))!='219a99cc-2c8b-4224-86fe-c05794055e1d'):
        return None
    return linear_lut_declaration(getattr(value,'data',None))


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
                                declaration=color_declaration(component)
                                if declaration is not None:
                                    node['effect']['linearLutDeclaration']=declaration
                                for source_field,target_field in [('param_list','parametersFingerprint'),('keyframes','keyframesFingerprint')]:
                                    fingerprint=parameter_fingerprint(getattr(component,source_field,None))
                                    if fingerprint is not None:node['effect'][target_field]=fingerprint
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
