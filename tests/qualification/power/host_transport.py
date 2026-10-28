"""Bounded QMP/loopback SSH transport. Instantiated only after private grant checks.
Only an exact approved QEMU argv and freshly revalidated PID can be started/killed.
"""
import json
import os
from pathlib import Path
import re
import shlex
import signal
import socket
import stat
import subprocess
import time
from urllib.parse import urlparse
from host_controller import IDENTITY, LIVE_IDENTITY, validate_grant, digest, Oracle

HELPER = '/usr/local/libexec/tilde-m4-power-control'
VERBS = ('preflight','attach','detach','make-baseline','restore-baseline',
         'calibration-write','calibration-fua','calibration-read','snapshot-recovery','read-trace')

def private_file(path, maximum=65536):
    path=Path(path)
    anchor=os.open('/',os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC)
    try:
        for part in path.parent.parts[1:]:
            if part in ('.','..'):raise ValueError('Noncanonical private path')
            child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=anchor);os.close(anchor);anchor=child
        p=os.fstat(anchor)
        if p.st_uid!=os.getuid() or stat.S_IMODE(p.st_mode)!=0o700:raise ValueError('Private parent required')
        fd=os.open(path.name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=anchor)
    finally:os.close(anchor)
    try:
        s=os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_nlink!=1 or stat.S_IMODE(s.st_mode)!=0o600 or s.st_size>maximum:raise ValueError('Private owned single-link file required')
        return os.read(fd,maximum+1)
    finally:os.close(fd)

def read_grant(path):
    value=json.loads(private_file(path));validate_grant(value);return value

def ticks(pid):
    text=Path('/proc/'+str(pid)+'/stat').read_text();return text[text.rfind(')')+2:].split()[19]

class QmpSshTransport:
    def __init__(self, grant, oracle):
        validate_grant(grant);self.g=grant;self.oracle=Path(oracle);self.vm=grant['vm'];self.target=grant['target']
        self.qmp=Path(urlparse(self.target['uri']).path)
        parent=self.qmp.parent
        if parent.resolve()!=parent or parent.stat().st_uid!=os.getuid() or stat.S_IMODE(parent.stat().st_mode)!=0o700 or Path(self.vm['pidfile']).parent!=parent:raise ValueError('Private canonical QMP/PID directory required')
        if not self.qmp.is_absolute() or str(self.qmp)!=self.vm['qmp']:raise ValueError('QMP scope mismatch')
        ssh=self.vm['ssh']
        if ssh['host']!='127.0.0.1' or ssh['user']!='tilde-check' or type(ssh['port']) is not int or not 1024<=ssh['port']<=65535:raise ValueError('Loopback-only VM SSH required')
        private_file(ssh['key']);private_file(ssh['knownHosts'])
        self._disk()
    def _disk(self):
        path=Path(self.target['disk']);s=path.lstat()
        parent=path.parent.stat()
        if parent.st_uid!=os.getuid() or stat.S_IMODE(parent.st_mode)!=0o700:raise ValueError('Private VM directory required')
        if path.is_symlink() or path.resolve()!=path or not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_nlink!=1 or (s.st_dev,s.st_ino)!=(self.target['diskDevice'],self.target['diskInode']):raise ValueError('Owned overlay identity changed')
    def _qmp(self, command):
        if command not in ('query-uuid','query-name','query-status','query-block'):raise ValueError('Read-only QMP verb required')
        s=self.qmp.lstat();p=self.qmp.parent.stat()
        if not stat.S_ISSOCK(s.st_mode) or s.st_uid!=os.getuid() or p.st_uid!=os.getuid() or stat.S_IMODE(p.st_mode)!=0o700:raise ValueError('Private owned QMP socket required')
        with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as connection:
            connection.settimeout(3);connection.connect(str(self.qmp));stream=connection.makefile('rwb',buffering=0)
            def receive():
                for _ in range(32):
                    line=stream.readline(65537)
                    if not line or len(line)>65536:raise ValueError('QMP framing limit')
                    value=json.loads(line)
                    if 'event' not in value:return value
                raise ValueError('QMP event limit')
            if 'QMP' not in receive():raise ValueError('QMP greeting missing')
            stream.write(b'{"execute":"qmp_capabilities"}\n')
            if 'return' not in receive():raise ValueError('QMP negotiation failed')
            stream.write((json.dumps({'execute':command})+'\n').encode());reply=receive()
            if 'return' not in reply:raise ValueError('QMP query failed')
            return reply['return']
    def observe(self):
        self._disk();pid=int(private_file(self.vm['pidfile'],64).strip());start=ticks(pid)
        args=Path('/proc/'+str(pid)+'/cmdline').read_bytes().split(b'\0')
        expected=[a.encode() for a in self.vm['argv']]
        if args and args[-1]==b'':args.pop()
        if args!=expected or Path('/proc/'+str(pid)+'/exe').resolve()!=Path(self.vm['argv'][0]).resolve():raise ValueError('QEMU executable/argv mismatch')
        if self._qmp('query-uuid').get('UUID')!=self.target['uuid'] or self._qmp('query-name').get('name')!=self.target['name']:raise ValueError('Wrong QMP guest')
        blocks=self._qmp('query-block');paths=[b.get('inserted',{}).get('image',{}).get('filename') for b in blocks]
        if self.target['disk'] not in paths:raise ValueError('QMP overlay mismatch')
        status=self._qmp('query-status')
        return {**self.target,'state':'running' if status.get('running') is True else 'inactive','pid':pid,'startTicks':start,'hostBootId':Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
    def cut(self, observed):
        current=self.observe()
        if any(current.get(k)!=observed.get(k) for k in LIVE_IDENTITY):raise ValueError('Cut identity changed')
        # SIGKILL discards guest RAM, including the volatile nbdkit cache. Do not
        # send QMP quit, shutdown, detach, sync or flush along this path.
        if ticks(current['pid'])!=current['startTicks']:raise ValueError('PID reused')
        os.kill(current['pid'],signal.SIGKILL)
        if getattr(self,'child',None) is not None and self.child.pid==current['pid']:
            self.child.wait(timeout=10)
        deadline=time.monotonic()+10
        while Path('/proc/'+str(current['pid'])).exists():
            try:
                text=Path('/proc/'+str(current['pid'])+'/stat').read_text()
                if text[text.rfind(')')+2:].split()[0]=='Z' or ticks(current['pid'])!=current['startTicks']:break
            except FileNotFoundError:break
            if time.monotonic()>deadline:raise TimeoutError('Owned QEMU did not exit')
            time.sleep(.05)
    def boot(self):
        validate_grant(self.g)
        self._disk();argv=self.vm['argv']
        if digest(argv)!=self.vm['argvSha256'] or not Path(argv[0]).is_absolute() or Path(argv[0]).name!='qemu-system-x86_64':raise ValueError('Unapproved launch recipe')
        if any(a in argv for a in ('-fsdev','-virtfs','-hda','-hdb','-blockdev','-chardev','-object','-readconfig')):raise ValueError('Host shares/devices or extensible launch recipe refused')
        pairs={'-name':self.target['name'],'-uuid':self.target['uuid'],'-machine':'q35,accel=kvm','-cpu':'host','-smp':'4','-m':'6144','-display':'none','-monitor':'none','-qmp':'unix:'+str(self.qmp)+',server=on,wait=off','-pidfile':self.vm['pidfile'],'-netdev':'user,id=net0,hostfwd=tcp:127.0.0.1:'+str(self.vm['ssh']['port'])+'-:22','-device':'virtio-net-pci,netdev=net0'}
        i=1;seen=set();drives=0
        while i<len(argv):
            flag=argv[i]
            if flag=='-no-reboot':i+=1;continue
            if i+1>=len(argv):raise ValueError('Missing QEMU option value')
            value=argv[i+1]
            if flag=='-drive':drives+=1
            elif flag=='-serial':
                if value!='file:'+str(Path(self.target['disk']).parent/'serial.log'):raise ValueError('Private fixed serial log required')
            elif flag not in pairs or flag in seen or value!=pairs[flag]:raise ValueError('QEMU option outside fixed approved recipe')
            seen.add(flag);i+=2
        if drives>4:raise ValueError('Guest disk count limit')
        # Every configured disk must be a regular file; never an owner host block
        # device. The approved complete argv also binds firmware/seed/network.
        for i,a in enumerate(argv[:-1]):
            if a=='-drive':
                drive=dict(part.split('=',1) for part in argv[i+1].split(',') if '=' in part)
                f=Path(drive.get('file',''))
                if not f.is_absolute() or f.resolve()!=f or not stat.S_ISREG(f.stat().st_mode) or (not f.is_relative_to(Path(self.target['disk']).parent) and not (str(f)=='/usr/share/edk2/x64/OVMF_CODE.4m.fd' and drive.get('readonly')=='on')) or str(f).startswith('/dev/'):raise ValueError('Regular-file guest disks only')
        pidfile=Path(self.vm['pidfile'])
        if pidfile.exists():
            pid=int(private_file(pidfile,64).strip())
            if Path('/proc/'+str(pid)).exists():raise ValueError('Existing PID is not boot authority')
            pidfile.unlink()
        if self.qmp.exists():
            s=self.qmp.lstat()
            if not stat.S_ISSOCK(s.st_mode) or s.st_uid!=os.getuid():raise ValueError('Foreign stale QMP endpoint')
            self.qmp.unlink()
        with Oracle(self.oracle) as oracle:
            scope=digest(self.g)
            if any(r.get('scope')!=scope for r in oracle.records):raise ValueError('Oracle scope mismatch')
            count=sum(r['event']=='boot-authorized' for r in oracle.records)
            if type(self.g.get('maxBoots')) is not int or count>=self.g['maxBoots'] or self.g['maxBoots']>64:raise ValueError('Boot scope exhausted')
            oracle.append({'event':'boot-authorized','scope':scope,'attempt':count+1,'argvSha256':self.vm['argvSha256']})
        self.child=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True,umask=0o077)
        deadline=time.monotonic()+30
        while True:
            if self.child.poll() is not None:raise RuntimeError('Owned QEMU boot exited')
            try:return self.observe()
            except (OSError,ValueError):
                if time.monotonic()>deadline:raise TimeoutError('QMP boot readiness')
                time.sleep(.1)
    def ssh_args(self):
        s=self.vm['ssh']
        return ['/usr/bin/ssh','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+s['knownHosts'],'-o','ConnectTimeout=5','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=2','-i',s['key'],'-p',str(s['port']),s['user']+'@'+s['host']]
    def guest(self, verb, timeout=30):
        if verb!='preflight':validate_grant(self.g)
        if verb not in VERBS:raise ValueError('Fixed guest verb required')
        self.observe()
        result=subprocess.run(self.ssh_args()+[' '.join(map(shlex.quote,['/usr/bin/sudo','-n',HELPER,verb]))],capture_output=True,timeout=min(timeout,120))
        if result.returncode or len(result.stdout)>17*1024*1024:raise RuntimeError('Guest fixed verb failed')
        value=json.loads(result.stdout)
        if verb=='preflight' and value.get('uuid')!=self.target['uuid']:raise ValueError('Guest DMI target mismatch')
        return value
    def start_worker(self, action, scenario):
        validate_grant(self.g)
        if action not in ('prepare','recover') or scenario not in self.g['scenarios'] or scenario.endswith('control'):raise ValueError('Unapproved worker verb')
        self.observe()
        worker=self.vm['worker']
        if not re.fullmatch(r'/home/tilde-check/[a-zA-Z0-9_./-]+/tests/integration/dist/m4-power-worker.js',worker):raise ValueError('Fixed compiled worker path required')
        expected=self.vm.get('workerSha256','')
        if not re.fullmatch(r'[a-f0-9]{64}',expected):raise ValueError('Exact compiled worker hash required')
        check=subprocess.run(self.ssh_args()+[' '.join(map(shlex.quote,['/usr/bin/sha256sum','--',worker]))],capture_output=True,timeout=10)
        if check.returncode or check.stdout.decode().split()[0]!=expected:raise ValueError('Compiled guest worker changed')
        tokens=['/usr/bin/env','-i','PATH=/usr/bin:/bin','HOME=/home/tilde-check','LANG=C.UTF-8','XDG_RUNTIME_DIR=/run/user/1000','DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus','/usr/bin/node',worker,action,scenario,self.vm['workerScope']]
        return subprocess.Popen(self.ssh_args()+[' '.join(map(shlex.quote,tokens))],stdin=subprocess.PIPE if action=='recover' else subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    def start_hold(self, verb):
        validate_grant(self.g)
        if verb not in ('calibration-write','calibration-fua'):raise ValueError('Fixed held control verb required')
        self.observe()
        return subprocess.Popen(self.ssh_args()+[' '.join(map(shlex.quote,['/usr/bin/sudo','-n',HELPER,verb]))],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    def copy_stopped_overlay(self, destination):
        self._disk()
        pidfile=Path(self.vm['pidfile'])
        if pidfile.exists() and Path('/proc/'+str(int(private_file(pidfile,64).strip()))).exists():raise ValueError('Never copy a live VM disk')
        destination=Path(destination)
        if destination.exists() or destination.parent.resolve()!=destination.parent:raise ValueError('Fresh offline snapshot required')
        source=Path(self.target['disk']);space=os.statvfs(destination.parent)
        maximum=self.g.get('maxSnapshotTotalBytes')
        if type(maximum) is not int or maximum<1 or maximum>64*1024**3:raise ValueError('Bounded offline snapshot scope required')
        retained=sum(p.stat().st_blocks*512 for p in Path(self.g['evidence']).rglob('crashed-os.qcow2'))
        if retained+source.stat().st_blocks*512>maximum:raise ValueError('Offline snapshot scope exhausted')
        if space.f_bavail*space.f_frsize < source.stat().st_blocks*512 + 256*1024*1024:raise ValueError('Insufficient bounded snapshot space')
        result=subprocess.run(['/usr/bin/cp','--reflink=auto','--sparse=always','--no-clobber','--',str(source),str(destination)],capture_output=True,timeout=120)
        if result.returncode:raise RuntimeError('Offline overlay copy failed')
        os.chmod(destination,0o600);fd=os.open(destination,os.O_RDONLY|os.O_NOFOLLOW)
        try:os.fsync(fd)
        finally:os.close(fd)
        fd=os.open(destination.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(fd)
        finally:os.close(fd)
