"""Read-only bounded tar audit before extracting/copying any supplied artifact."""
import argparse
import hashlib
import json
import posixpath
import subprocess
import tarfile
from pathlib import PurePosixPath

PRIVATE={'.git','.superpowers','.aws','.codex','.agents','.env','.build','node_modules','dist','__pycache__','experiments'}
FIXED=('LICENSE','THIRD_PARTY_NOTICES.md','docs/public/release-notes-0.1.0.md','packaging/licenses/inventory.json','package.json','packaging/release/public-files.json','packaging/arch/PKGBUILD')
def audit(path,kind):
    process=None
    if kind=='package':
        process=subprocess.Popen(['/usr/bin/zstd','-dc','--',path],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        archive=tarfile.open(fileobj=process.stdout,mode='r|')
    else:archive=tarfile.open(path,mode='r:*')
    records=[];names=set();links={};bodies={};total=0;root='tilde-0.1.0';source_names=set()
    try:
        for index,member in enumerate(archive):
            raw=member.name.rstrip('/')
            while raw.startswith('./'):raw=raw[2:]
            if raw=='.' and member.isdir():continue
            if index>=20000 or not raw or raw.startswith('/') or any(p in ('','.','..') for p in raw.split('/')) or raw in names or member.mode&0o6000 or not (member.isfile() or member.isdir() or member.issym()):raise ValueError('ARCHIVE_PATH_OR_TYPE_UNSAFE')
            names.add(raw);total+=member.size
            if member.size>64*1024*1024 or total>512*1024*1024:raise ValueError('ARCHIVE_SIZE_LIMIT')
            if kind=='source':
                if raw==root:
                    if not member.isdir():raise ValueError('SOURCE_ROOT_UNSAFE')
                    continue
                if not raw.startswith(root+'/'):raise ValueError('SOURCE_ROOT_MISMATCH')
                name=raw[len(root)+1:]
                if any(p in PRIVATE or p.endswith('.tsbuildinfo') for p in name.split('/')) or name.startswith('docs/superpowers/'):raise ValueError('PRIVATE_SOURCE_MEMBER')
            else:
                name=raw
                if not (name in ('.PKGINFO','.BUILDINFO','.MTREE') or name=='usr' or name.startswith('usr/')) or name.startswith('usr/share/libalpm/hooks/'):raise ValueError('PACKAGE_PATH_UNSAFE')
            if member.isdir():continue
            source_names.add(name)
            record={'path':name,'mode':member.mode&0o777}
            if member.issym():
                target=posixpath.normpath(posixpath.join(posixpath.dirname(raw),member.linkname))
                if member.linkname.startswith('/') or target.startswith('../') or target=='..' or (kind=='source' and not target.startswith(root+'/')) or (kind=='package' and not target.startswith('usr/')):raise ValueError('ARCHIVE_LINK_ESCAPE')
                links[raw]=target;record.update(type='symlink',target=member.linkname)
            else:
                stream=archive.extractfile(member);digest=hashlib.sha256();capture=bytearray()
                keep=kind=='source' and name in FIXED or kind=='package' and name=='.PKGINFO'
                count=0
                while True:
                    chunk=stream.read(65536)
                    if not chunk:break
                    count+=len(chunk);digest.update(chunk)
                    if keep:
                        capture.extend(chunk)
                        if len(capture)>8*1024*1024:raise ValueError('ARCHIVE_METADATA_LIMIT')
                if count!=member.size:raise ValueError('SHORT_ARCHIVE_FILE')
                record.update(type='file',sha256=digest.hexdigest())
                if keep:bodies[name]=capture.decode('utf8')
            records.append(record)
        padding=0
        while True:
            tail=archive.fileobj.read(65536)
            if not tail:break
            padding+=len(tail)
            if padding>1024*1024 or any(tail):raise ValueError('ARCHIVE_TRAILING_PAYLOAD')
        if process and process.wait(timeout=5)!=0:raise ValueError('ARCHIVE_DECOMPRESSION_FAILED')
        for name,target in links.items():
            seen={name};resolved=target
            while resolved in links:
                if resolved in seen:raise ValueError('ARCHIVE_LINK_CYCLE')
                seen.add(resolved);resolved=links[resolved]
            if resolved not in names:raise ValueError('ARCHIVE_LINK_MISSING')
        for name in names:
            parts=name.split('/')
            if any('/'.join(parts[:i]) in links for i in range(1,len(parts))):raise ValueError('ARCHIVE_LINK_PARENT')
        if kind=='source':
            if any(name not in bodies for name in FIXED):raise ValueError('SOURCE_RELEASE_METADATA_MISSING')
            public=json.loads(bodies['packaging/release/public-files.json'])
            if public.get('version')!=1 or not isinstance(public.get('files'),list) or len(public['files'])!=len(set(public['files'])) or set(public['files'])!=source_names:raise ValueError('SOURCE_ALLOWLIST_MISMATCH')
            if json.loads(bodies['package.json']).get('version')!='0.1.0':raise ValueError('SOURCE_VERSION_MISMATCH')
        return {'kind':kind,'files':records,'bodies':bodies}
    finally:
        archive.close()
        if process:
            if process.poll() is None:process.terminate()
            process.wait(timeout=5)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('kind',choices=['source','package']);p.add_argument('path');a=p.parse_args();print(json.dumps(audit(a.path,a.kind)))
