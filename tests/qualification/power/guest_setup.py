"""Test-only fixed installer for a separately approved disposable Arch guest.
Dependencies (including a verified nbdkit Python build) must already be present.
This never installs host/guest packages or enables a service automatically.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import time
from guest_control import initialize_fixture, System, VERBS

FILES=('guest_control.py','volatile_disk.py','nbdkit_plugin.py')
def validate_setup_scope(scope, observed):
    if (not isinstance(scope,dict) or scope.get('version')!=1 or scope.get('ownerApproved') is not True
            or not isinstance(scope.get('ownerStatement'),str) or not scope['ownerStatement']
            or not isinstance(scope.get('expiresAt'),(int,float)) or scope['expiresAt']<=time.time()
            or observed.get('euid')!=0 or observed.get('uuid')!=scope.get('targetUUID')
            or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',str(scope.get('targetUUID','')))
            or observed.get('os')!='arch' or observed.get('virtualization') not in ('kvm','qemu')
            or observed.get('uid')!=1000 or observed.get('home')!='/home/tilde-check'
            or scope.get('device')!='/dev/nbd0' or scope.get('mount')!='/mnt/tilde-m4-power'
            or set(scope.get('hashes',{}))!=set(FILES)
            or any(not re.fullmatch(r'[a-f0-9]{64}',str(h)) for h in scope['hashes'].values())):
        raise ValueError('Explicit exact disposable guest setup scope required')

def regular(path,uid,private=False):
    path=Path(path)
    if path.resolve()!=path:raise ValueError('Canonical regular file required')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    info=os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=uid or info.st_nlink!=1 or info.st_mode&0o022 or private and stat.S_IMODE(info.st_mode)!=0o600:
        os.close(fd);raise ValueError('Untrusted setup input')
    return fd

def ensure_directory(path,mode):
    path=Path(path)
    if path.resolve()!=path:raise ValueError('Canonical setup directory required')
    if not path.exists():path.mkdir(mode=mode,parents=True)
    # A file fsync does not persist the mkdir entry naming its parent. Persist
    # every ancestor too, including parents created by mkdir(parents=True).
    for directory in (path,*path.parents):
        fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
        try:os.fsync(fd)
        finally:os.close(fd)

def install_file(path,data,mode):
    path=Path(path)
    if path.exists():
        fd=regular(path,0)
        with os.fdopen(fd,'rb') as f:existing=f.read()
        if existing!=data or stat.S_IMODE(path.stat().st_mode)!=mode:raise ValueError('Refusing existing untracked setup file')
        return
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    try:
        view=memoryview(data)
        while view:
            n=os.write(fd,view)
            if n<=0:raise OSError('Short installer write')
            view=view[n:]
        os.fchmod(fd,mode);os.fsync(fd)
    finally:os.close(fd)
    fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)

def setup(scope_file):
    fd=regular(scope_file,0,private=True)
    with os.fdopen(fd) as f:scope=json.load(f)
    account=pwd.getpwnam('tilde-check')
    fields=dict(line.split('=',1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
    observed={'euid':os.geteuid(),'uuid':Path('/sys/class/dmi/id/product_uuid').read_text().strip().lower(),'os':fields.get('ID','').strip('"'),'virtualization':subprocess.check_output(['/usr/bin/systemd-detect-virt','--vm'],text=True,timeout=3).strip(),'uid':account.pw_uid,'home':account.pw_dir}
    validate_setup_scope(scope,observed)
    source=Path(__file__).resolve().parent
    bodies={}
    for name in FILES:
        fd=regular(source/name,0)
        with os.fdopen(fd,'rb') as f:bodies[name]=f.read()
        if hashlib.sha256(bodies[name]).hexdigest()!=scope['hashes'][name]:raise ValueError('Approved helper source changed')
    # Require existing audited dependencies. Their acquisition/build is a distinct
    # guest-only operator step; no package manager is invoked by this installer.
    nbdkit=Path(scope['nbdkit'])
    if str(nbdkit) not in ('/usr/bin/nbdkit','/opt/tilde-m4-power/nbdkit/bin/nbdkit'):raise ValueError('Fixed verified nbdkit location required')
    fd=regular(nbdkit,0)
    with os.fdopen(fd,'rb') as f:
        if hashlib.file_digest(f,'sha256').hexdigest()!=scope['nbdkitSha256']:raise ValueError('nbdkit identity mismatch')
    for path in ('/usr/bin/nbd-client','/usr/bin/mkfs.ext4','/usr/bin/modprobe','/usr/bin/mount','/usr/bin/umount','/usr/bin/visudo'):
        if not Path(path).exists():raise ValueError('Missing guest dependency '+path)
    subprocess.run(['/usr/bin/python3','-c','import nbd'],check=True,timeout=3)
    for path in ('/usr/local/lib/tilde-m4-power','/usr/local/libexec'):
        p=Path(path)
        ensure_directory(p,0o755)
        if p.resolve()!=p or p.stat().st_uid!=0 or p.stat().st_mode&0o022:raise ValueError('Unsafe root installation directory')
    for name,data in bodies.items():install_file(Path('/usr/local/lib/tilde-m4-power')/name,data,0o644)
    install_file('/usr/local/libexec/tilde-m4-power-control',bodies['guest_control.py'],0o755)
    code="import sys;sys.path.insert(0,'/usr/local/lib/tilde-m4-power');from guest_control import initialize_fixture;initialize_fixture(verified_uuid=sys.argv[1])"
    subprocess.run(['/usr/bin/runuser','-u','tilde-check','--','/usr/bin/python3','-c',code,scope['targetUUID']],check=True,timeout=10)
    mount=Path('/mnt/tilde-m4-power')
    ensure_directory(mount,0o700)
    if mount.resolve()!=mount or mount.stat().st_uid!=0 or stat.S_IMODE(mount.stat().st_mode)!=0o700:raise ValueError('Fresh private mount point required')
    manifest={'uuid':scope['targetUUID'],'uid':1000,'gid':account.pw_gid,'root':'/home/tilde-check/.local/state/tilde-m4-power','device':'/dev/nbd0','mount':str(mount),'hashes':scope['hashes']}
    install_file('/etc/tilde-m4-power.json',(json.dumps(manifest,indent=2)+'\n').encode(),0o600)
    state={'targetUUID':scope['targetUUID'],'stage':'raw'}
    install_file('/var/lib/tilde-m4-power-state.json',(json.dumps(state,indent=2)+'\n').encode(),0o600)
    unit=f'''[Unit]
Description=Disposable Tilde M4 volatile-cache qualification
[Service]
Type=simple
RuntimeDirectory=tilde-m4-power
RuntimeDirectoryMode=0700
ExecStart={nbdkit} -f -U %t/tilde-m4-power/nbd.sock python /usr/local/lib/tilde-m4-power/nbdkit_plugin.py base=/home/tilde-check/.local/state/tilde-m4-power/disk.raw log=/home/tilde-check/.local/state/tilde-m4-power/events.ndjson
UMask=0077
KillMode=control-group
TimeoutStopSec=5
Restart=no
MemoryMax=192M
TasksMax=32
'''
    install_file('/etc/systemd/user/tilde-m4-power-cache.service',unit.encode(),0o644)
    sudoers=''.join('tilde-check ALL=(root) NOPASSWD: /usr/local/libexec/tilde-m4-power-control '+verb+'\n' for verb in VERBS)
    temporary=Path('/etc/sudoers.d/.tilde-m4-power.install')
    install_file(temporary,sudoers.encode(),0o440)
    subprocess.run(['/usr/bin/visudo','-cf',str(temporary)],check=True,timeout=3)
    install_file('/etc/sudoers.d/tilde-m4-power',sudoers.encode(),0o440);temporary.unlink()
    subprocess.run(['/usr/bin/runuser','-u','tilde-check','--','/usr/bin/env','XDG_RUNTIME_DIR=/run/user/1000','DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus','/usr/bin/systemctl','--user','daemon-reload'],check=True,timeout=10)
    return {'ready':True,'targetUUID':scope['targetUUID'],'enabled':False,'deviceAttached':False,'filesystemFormatted':False}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--scope',required=True);a=p.parse_args();print(json.dumps(setup(a.scope)))
