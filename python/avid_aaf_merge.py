"""Merge bounded external-reference AAFs into a new verified template."""
import hashlib,re,shutil
from pathlib import Path
import aaf2
from aaf2.mobid import MobID
import avid_aaf_graph as diagnostic

def substitute(value,mapping):
    if isinstance(value,dict):
        if value.get('type')=='MobID' and value.get('value') in mapping:
            return {**value,'value':str(mapping[value['value']])}
        return {key:substitute(child,mapping) for key,child in value.items()}
    if isinstance(value,list):return [substitute(child,mapping) for child in value]
    return value

def merge(request):
    from avid_aaf_builder import inspect
    sources=request.get('sources')
    if not isinstance(sources,list) or not 2<=len(sources)<=16:raise ValueError('Supply 2 to 16 source references')
    output=Path(request['output']).resolve()
    if output.suffix.lower()!='.aaf' or output.exists():raise ValueError('Output must be a new AAF')
    files=[];hashes=[];infos=[]
    for item in sources:
        file=Path(item['file']).resolve();digest=item['expectedSha256']
        if file in files or file==output or file.suffix.lower()!='.aaf':raise ValueError('Sources must be distinct AAF files')
        if not isinstance(digest,str) or not re.fullmatch('[a-f0-9]{64}',digest):raise ValueError('Invalid source checksum')
        if file.stat().st_size>64*1024*1024:raise ValueError('AAF exceeds 64 MiB limit')
        if hashlib.sha256(file.read_bytes()).hexdigest()!=digest:raise ValueError('Source checksum changed')
        infos.append(inspect(file));files.append(file);hashes.append(digest)
    if sum(len(info['masters']) for info in infos)>100:raise ValueError('Master count limit exceeded')
    diagnostic.visited=0
    seen=set();mappings=[];expected={};definitions={}
    for file in files:
        with aaf2.open(str(file)) as source:
            mobs=list(source.content.mobs)
            if not mobs or len(mobs)>1000:raise ValueError('Mob count limit exceeded')
            original_ids={str(m.mob_id) for m in mobs}
            if len(original_ids)!=len(mobs):raise ValueError('Duplicate source mob identity')
            mapping={key:MobID.new() for key in original_ids&seen}
            final_ids={str(mapping.get(key,key)) for key in original_ids}
            if final_ids&seen or len(final_ids)!=len(mobs):raise ValueError('Remapped identity collision')
            seen.update(final_ids);mappings.append(mapping);targets={}
            for mob in mobs:
                key=str(mapping.get(str(mob.mob_id),mob.mob_id))
                expected[key]=substitute(diagnostic.graph(mob,weak_targets=targets),mapping)
            for key,value in diagnostic.referenced_definitions(targets).items():
                if key in definitions and definitions[key]!=value:raise ValueError('Conflicting weak target definitions')
                definitions[key]=value
    with files[0].open('rb') as source,output.open('xb') as destination:shutil.copyfileobj(source,destination)
    with aaf2.open(str(output),'rw') as target:
        for file,mapping in zip(files[1:],mappings[1:]):
            with aaf2.open(str(file)) as source:
                for mob in source.content.mobs:
                    copied=mob.copy(root=target)
                    for obj,streams in copied.walk_references():
                        if streams:raise ValueError('Stream-backed graphs are unsupported')
                        for prop in obj.properties():
                            value=prop.value
                            if isinstance(value,MobID) and str(value) in mapping:prop.value=mapping[str(value)]
                    target.content.mobs.append(copied)
    if output.stat().st_size>64*1024*1024:raise ValueError('Combined AAF exceeds 64 MiB limit')
    with aaf2.open(str(output)) as result:
        targets={};actual={str(m.mob_id):diagnostic.graph(m,weak_targets=targets) for m in result.content.mobs}
        actual_definitions=diagnostic.referenced_definitions(targets)
    if actual!=expected or actual_definitions!=definitions:raise ValueError('Combined graph verification failed')
    for file,digest in zip(files,hashes):
        if hashlib.sha256(file.read_bytes()).hexdigest()!=digest:raise ValueError('Source changed during merging')
    inspection=inspect(output)
    return {'output':str(output),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'inspection':inspection,
            'sources':[{'file':str(file),'sha256':digest,'remappedMobIds':{key:str(value) for key,value in mapping.items()}} for file,digest,mapping in zip(files,hashes,mappings)],
            'graphVerified':True,'sourceHashesUnchanged':True,'hostImportVerified':False,
            'limitations':['Stored properties and reachable weak targets verified; implicit schemas are not fully compared','No native import, relink, playback or color verification']}
