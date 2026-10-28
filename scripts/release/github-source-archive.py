"""Validate GitHub-generated source without extracting its members."""
import argparse,gzip,hashlib,json,posixpath,stat,tarfile,tempfile,zipfile
from pathlib import Path
LIMIT=512*1024*1024

def verify(path,fmt,record):
    if Path(path).stat().st_size>LIMIT:raise ValueError('archive size')
    expected={f['path']:f for f in record['files']};seen=set();files={};links={};root=None;total=0
    def member(raw,kind,mode,size,stream):
        nonlocal root,total
        raw=raw.rstrip('/')
        if not raw or raw.startswith('/') or '\\' in raw or any(p in ('','.','..') for p in raw.split('/')) or raw in seen or len(seen)>=20000 or mode&0o6000:raise ValueError('unsafe member')
        seen.add(raw);parts=raw.split('/')
        if root is None:root=parts[0]
        if parts[0]!=root:raise ValueError('multiple wrappers')
        if len(parts)==1:
            if kind!='directory':raise ValueError('missing wrapper')
            return
        name='/'.join(parts[1:])
        if kind=='directory':return
        f=expected.get(name)
        if f is None or name in files or size>64*1024*1024 or size<0:raise ValueError('membership or size')
        total+=size
        if total>LIMIT:raise ValueError('expanded size')
        digest=hashlib.sha256();count=0;target=bytearray()
        while True:
            chunk=stream.read(65536)
            if not chunk:break
            count+=len(chunk)
            if count>size:raise ValueError('size changed')
            digest.update(chunk)
            if kind=='symlink':
                target.extend(chunk)
                if len(target)>512:raise ValueError('link size')
        if count!=size:raise ValueError('short member')
        if kind=='symlink':
            text=target.decode('utf8');resolved=posixpath.normpath(posixpath.join(posixpath.dirname(name),text))
            if text.startswith('/') or '\\' in text or resolved.startswith('../') or resolved=='..':raise ValueError('escaping link')
            links[name]=resolved;actual={'path':name,'type':'symlink','mode':0o777,'target':text}
        elif kind=='file':actual={'path':name,'type':'file','mode':0o755 if mode&0o111 else 0o644,'sha256':digest.hexdigest()}
        else:raise ValueError('special member')
        if any(actual.get(k)!=f.get(k) for k in ('type','mode','sha256','target')):raise ValueError('content or executable mode')
        files[name]=actual
    if fmt=='zip':
        with zipfile.ZipFile(path) as z:
            for info in z.infolist():
                mode=info.external_attr>>16
                kind='directory' if info.is_dir() else 'symlink' if stat.S_ISLNK(mode) else 'file'
                if stat.S_IFMT(mode) not in (0,stat.S_IFREG,stat.S_IFDIR,stat.S_IFLNK) or info.flag_bits&1:raise ValueError('zip type')
                with z.open(info) as stream:member(info.filename,kind,mode,info.file_size,stream)
    else:
        with open(path,'rb') as raw,tempfile.SpooledTemporaryFile(max_size=8*1024*1024) as expanded:
            magic=raw.read(2);raw.seek(0);source=gzip.GzipFile(fileobj=raw) if magic==b'\x1f\x8b' else raw
            size=0
            while True:
                block=source.read(65536)
                if not block:break
                size+=len(block)
                if size>LIMIT:raise ValueError('tar expansion')
                expanded.write(block)
            expanded.seek(0)
            with tarfile.open(fileobj=expanded,mode='r:') as archive:
                import io
                for info in archive:
                    if info.issym():data=info.linkname.encode();member(info.name,'symlink',info.mode,len(data),io.BytesIO(data))
                    elif info.isdir():member(info.name,'directory',info.mode,0,io.BytesIO())
                    elif info.isfile():
                        with archive.extractfile(info) as stream:member(info.name,'file',info.mode,info.size,stream)
                    else:raise ValueError('tar special member')
                tail=expanded.read()
                if len(tail)>1024*1024 or any(tail):raise ValueError('tar trailing payload')
    if set(files)!=set(expected):raise ValueError('missing files')
    for name,target in links.items():
        visited={name}
        while target in links:
            if target in visited:raise ValueError('link cycle')
            visited.add(target);target=links[target]
        if target not in files:raise ValueError('missing link target')
    for name in files:
        pieces=name.split('/')
        if any('/'.join(pieces[:i]) in links for i in range(1,len(pieces))):raise ValueError('link parent')
    return {'valid':True,'files':len(files)}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--archive',required=True);p.add_argument('--format',choices=['tar','zip'],required=True);p.add_argument('--record',required=True);a=p.parse_args()
    try:print(json.dumps(verify(a.archive,a.format,json.loads(Path(a.record).read_text()))))
    except Exception:raise SystemExit('SOURCE_ARCHIVE_INVALID')
