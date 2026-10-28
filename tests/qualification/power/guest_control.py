#!/usr/bin/python3
"""Fixed-verb root helper for ONE disposable VM, never a product component."""
import fcntl
import hashlib
import json
import mmap
import os
import pwd
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time

SERVICE = 'tilde-m4-power-cache.service'
CONFIG = Path('/etc/tilde-m4-power.json')
HELPER = Path('/usr/local/libexec/tilde-m4-power-control')
LIB = Path('/usr/local/lib/tilde-m4-power')
VERBS = ('preflight', 'attach', 'detach', 'make-baseline', 'restore-baseline',
         'calibration-write', 'calibration-fua', 'calibration-read',
         'snapshot-recovery', 'read-trace', 'remove')
MOUNT_OPTIONS = 'noatime,nosuid,nodev,noexec'
REQUIRED_MOUNT_OPTIONS = {'nosuid', 'nodev', 'noexec'}


def open_directory(path, create=False):
    """Walk from / without following any directory symlink; return an anchor."""
    path = Path(path)
    if not path.is_absolute() or '..' in path.parts:
        raise ValueError('Expected an absolute directory path')
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for name in path.parts[1:]:
            try:
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            except FileNotFoundError:
                if not create:
                    raise
                # Creation is used only by the unprivileged initializer.
                os.mkdir(name, 0o700, dir_fd=fd)
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                os.fsync(fd)
            os.close(fd)
            fd = child
        result, fd = fd, None
        return result
    finally:
        if fd is not None:
            os.close(fd)


def owned_directory(path, uid):
    fd = open_directory(path)
    info = os.fstat(fd)
    if info.st_uid != uid or info.st_mode & 0o077:
        os.close(fd)
        raise ValueError('Fixture directory must be owned and private')
    return fd


def initialize_fixture(system=None, *, verified_uuid=None):
    """Use the installer's root-verified identity after dropping to the guest UID.

    This creates only user-owned files. Every privileged helper verb independently
    rereads DMI as root; this argument never grants privileged authority.
    """
    s = system or System()
    if os.geteuid() != s.uid or not isinstance(verified_uuid, str) or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', verified_uuid):
        raise ValueError('Initialize only as the identified guest user')
    fd = open_directory(s.root, create=True)
    os.close(fd)
    root = owned_directory(s.root, s.uid)
    try:
        try:
            os.mkdir('snapshots', 0o700, dir_fd=root)
        except FileExistsError:
            pass
        snapshots = os.open('snapshots', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root)
        try:
            info = os.fstat(snapshots)
            if info.st_uid != s.uid or info.st_mode & 0o077:
                raise ValueError('Snapshot directory must be owned and private')
            os.fsync(snapshots)
        finally:
            os.close(snapshots)
        for name, size in [('disk.raw', s.size), ('events.ndjson', 0)]:
            try:
                image = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=root)
                created = True
            except FileExistsError:
                image = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=root)
                created = False
            try:
                info = os.fstat(image)
                if not stat.S_ISREG(info.st_mode) or info.st_uid != s.uid or info.st_nlink != 1:
                    raise ValueError('Wrong fixture file')
                if created:
                    os.ftruncate(image, size)
                    os.fsync(image)
                elif name == 'disk.raw' and info.st_size != size:
                    raise ValueError('Wrong fixture size')
            finally:
                os.close(image)
        os.fsync(root)
    finally:
        os.close(root)
    return {'initialized': True}


def digest(path):
    parent = open_directory(Path(path).parent)
    try:
        fd = os.open(Path(path).name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
    finally:
        os.close(parent)
    with os.fdopen(fd, 'rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def sync_directory(path):
    fd = os.open(path, os.O_DIRECTORY | os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic_json(path, value):
    fd, temporary = tempfile.mkstemp(prefix='.g9-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def proc_ticks(pid):
    text = Path('/proc/' + str(pid) + '/stat').read_text()
    return text[text.rfind(')') + 2:].split()[19]


class System:
    root = Path('/home/tilde-check/.local/state/tilde-m4-power')
    mount = Path('/mnt/tilde-m4-power')
    state_path = Path('/var/lib/tilde-m4-power-state.json')
    device = '/dev/nbd0'
    socket = '/run/user/1000/tilde-m4-power/nbd.sock'
    uid = 1000
    gid = 1000
    size = 512 * 1024 * 1024
    verify_installed = True

    def __init__(self):
        account = pwd.getpwnam('tilde-check')
        if account.pw_uid != 1000 or account.pw_dir != '/home/tilde-check' or account.pw_gid <= 0:
            raise ValueError('Unexpected guest account identity')
        self.gid = account.pw_gid

    def euid(self):
        return os.geteuid()

    def uuid(self):
        return Path('/sys/class/dmi/id/product_uuid').read_text().strip().lower()

    def boot(self):
        return Path('/proc/sys/kernel/random/boot_id').read_text().strip()

    def run(self, args, allowed=(0,), timeout=20):
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        if result.returncode not in allowed:
            raise RuntimeError(str(args[0]) + ': ' + result.stderr[-1800:])
        return result.stdout.strip()

    def exe(self, name):
        if name not in ('runuser', 'systemctl', 'findmnt', 'modprobe', 'nbd-client',
                        'mkfs.ext4', 'mount', 'umount', 'sync'):
            raise ValueError('Unknown system executable')
        path = shutil.which(name, path='/usr/sbin:/usr/bin:/sbin:/bin')
        if not path:
            raise ValueError('Missing system executable: ' + name)
        return path

    def userctl(self, *args, allowed=(0,)):
        return self.run([self.exe('runuser'), '-u', 'tilde-check', '--', '/usr/bin/env',
                         'XDG_RUNTIME_DIR=/run/user/1000',
                         'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus',
                         self.exe('systemctl'), '--user', *args], allowed=allowed)

    def backend_pid(self):
        value = self.userctl('show', SERVICE, '--property=MainPID', '--value', allowed=(0, 1, 4))
        return int(value or '0')

    def device_pid(self):
        path = Path('/sys/block/nbd0/pid')
        return path.read_text().strip() if path.exists() else ''

    def mount_source(self):
        return self.run([self.exe('findmnt'), '--mountpoint', str(self.mount),
                         '--noheadings', '--output', 'SOURCE'], allowed=(0, 1)) or None

    def mount_options(self):
        return self.run([self.exe('findmnt'), '--mountpoint', str(self.mount),
                         '--noheadings', '--output', 'OPTIONS'], allowed=(0, 1)) or None


class Hold:
    def __init__(self, payload, keep):
        self.payload, self.keep = payload, keep


class Control:
    def __init__(self, config, system=None):
        self.c = config
        self.s = system or System()
        self.base = self.s.root / 'disk.raw'
        self.baseline = self.s.root / 'baseline.raw'
        self.trace = self.s.root / 'events.ndjson'
        self.state = (json.loads(self.s.state_path.read_text()) if self.s.state_path.exists()
                      else {'stage': 'raw', 'targetUUID': self.c.get('uuid')})

    def save(self):
        atomic_json(self.s.state_path, self.state)

    def validate(self):
        if self.s.euid() != 0 or self.s.uuid() != self.c.get('uuid') or not re.fullmatch(r'[a-f0-9-]{36}', str(self.c.get('uuid', ''))):
            raise ValueError('This helper only runs as root in the identified disposable VM')
        expected = {'uuid': self.s.uuid(), 'uid': self.s.uid, 'gid': self.s.gid,
                    'root': str(self.s.root), 'device': self.s.device, 'mount': str(self.s.mount)}
        if set(self.c) != set(expected) | {'hashes'} or any(self.c.get(k) != v for k, v in expected.items()):
            raise ValueError('Manifest target/path mismatch')
        if self.state.get('targetUUID') != self.c.get('uuid'):
            raise ValueError('Wrong control-state identity')
        for path in (self.s.root, self.s.mount):
            if path.exists() and (path.is_symlink() or path.resolve() != path):
                raise ValueError('Noncanonical fixture directory')
        info = self.base.lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != self.s.uid
                or info.st_nlink != 1 or info.st_size != self.s.size):
            raise ValueError('Wrong fixture image')
        if self.s.verify_installed:
            files = {'guest_control.py': HELPER, 'nbdkit_plugin.py': LIB / 'nbdkit_plugin.py',
                     'volatile_disk.py': LIB / 'volatile_disk.py'}
            if set(self.c['hashes']) != set(files):
                raise ValueError('Missing installed-code hashes')
            for name, path in files.items():
                info = path.lstat()
                if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
                    raise ValueError('Untrusted installed helper code')
                if digest(path) != self.c['hashes'][name]:
                    raise ValueError('Installed-code hash mismatch')

    def idle(self):
        if self.s.device_pid() or self.s.mount_source() or self.s.backend_pid():
            raise ValueError('Fixture device/mount/backend is occupied')

    def owned_device(self):
        pid = self.s.device_pid()
        if (not pid or self.state.get('connectedBoot') != self.s.boot()
                or pid != self.state.get('kernelPID')
                or self.s.backend_pid() != self.state.get('backendPID')):
            raise ValueError('NBD device is not the recorded owned connection')
        return pid

    def start_backend(self):
        self.s.userctl('start', SERVICE)
        deadline = time.monotonic() + 8
        while not (Path(self.s.socket).is_socket() and self.s.backend_pid()):
            if time.monotonic() >= deadline:
                raise TimeoutError('nbdkit readiness timeout')
            time.sleep(.05)
        self.state.update(backendPID=self.s.backend_pid(), connectedBoot=self.s.boot())
        self.save()

    def connect(self, mount=False):
        self.idle()
        if mount and self.state.get('snapshotBoot') != self.s.boot():
            raise ValueError('Preserve a recovery snapshot before mounting')
        self.s.run([self.s.exe('modprobe'), 'nbd', 'nbds_max=1', 'max_part=0'])
        info = os.stat(self.s.device)
        if not stat.S_ISBLK(info.st_mode) or os.major(info.st_rdev) != 43 or os.minor(info.st_rdev) != 0:
            raise ValueError('Unexpected kernel NBD device')
        self.start_backend()
        self.s.run([self.s.exe('nbd-client'), '-unix', self.s.socket, '-b', '4096', self.s.device])
        pid = self.s.device_pid()
        if not pid:
            raise ValueError('Kernel NBD connection not observed')
        self.state['kernelPID'] = pid
        self.save()
        if mount:
            self.mount_data()
        return {'connected': True, 'mounted': mount}

    def mount_data(self):
        self.s.run([self.s.exe('mount'), '-o', MOUNT_OPTIONS, self.s.device, str(self.s.mount)])
        if self.s.mount_source() != self.s.device:
            raise ValueError('Mounted unexpected source')
        if not REQUIRED_MOUNT_OPTIONS <= set((self.s.mount_options() or '').split(',')):
            raise ValueError('Unsafe effective mount options')

    def stop_calibration(self):
        pid = self.state.get('calibrationPID')
        if pid and self.state.get('calibrationBoot') == self.s.boot():
            path = Path('/proc/' + str(pid))
            if path.exists() and proc_ticks(pid) == self.state.get('calibrationTicks'):
                args = (path / 'cmdline').read_bytes().split(b'\0')
                if str(HELPER).encode() not in args or pid == os.getpid():
                    raise ValueError('Calibration process identity mismatch')
                os.kill(pid, signal.SIGTERM)
                deadline = time.monotonic() + 5
                while path.exists() and proc_ticks(pid) == self.state.get('calibrationTicks'):
                    if time.monotonic() > deadline:
                        raise TimeoutError('Calibration process did not stop')
                    time.sleep(.05)
        self.state.pop('calibrationPID', None)

    def detach(self):
        self.stop_calibration()
        source, pid = self.s.mount_source(), self.s.device_pid()
        if source or pid:
            self.owned_device()
            if source:
                if source != self.s.device:
                    raise ValueError('Refusing to unmount an unrelated source')
                self.s.run([self.s.exe('sync'), '-f', str(self.s.mount)])
                self.s.run([self.s.exe('umount'), str(self.s.mount)])
            self.s.run([self.s.exe('nbd-client'), '-d', self.s.device])
            if self.s.device_pid():
                raise ValueError('NBD device still connected')
        backend = self.s.backend_pid()
        if backend:
            if (self.state.get('connectedBoot') != self.s.boot()
                    or backend != self.state.get('backendPID')):
                raise ValueError('Foreign backend process')
            self.s.userctl('stop', SERVICE)
        self.state.update(kernelPID=None, backendPID=None, connectedBoot=None)
        self.save()
        return {'detached': True}

    def copy_image(self, source, destination, replace=False):
        source, destination = Path(source), Path(destination)
        if source.parent != self.s.root or destination.parent not in (self.s.root, self.s.root / 'snapshots'):
            raise ValueError('Copy must stay inside fixed fixture directories')
        source_parent = owned_directory(source.parent, self.s.uid)
        try:
            destination_parent = owned_directory(destination.parent, self.s.uid)
        except Exception:
            os.close(source_parent)
            raise
        src = None
        flags = os.O_WRONLY | os.O_NOFOLLOW | (0 if replace else os.O_CREAT | os.O_EXCL)
        try:
            src = os.open(source.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=source_parent)
            info = os.fstat(src)
            if (not stat.S_ISREG(info.st_mode) or info.st_size != self.s.size
                    or info.st_uid != self.s.uid or info.st_nlink != 1):
                raise ValueError('Bad snapshot source')
            dst = os.open(destination.name, flags, 0o600, dir_fd=destination_parent)
            try:
                info = os.fstat(dst)
                if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
                        or (replace and (info.st_size != self.s.size or info.st_uid != self.s.uid))):
                    raise ValueError('Changed image destination; no writes allowed')
                for chunk in iter(lambda: os.read(src, 1024 * 1024), b''):
                    view = memoryview(chunk)
                    while view:
                        n = os.write(dst, view)
                        if n <= 0:
                            raise OSError('Short image copy')
                        view = view[n:]
                if not replace:
                    os.fchown(dst, self.s.uid, self.s.gid)
                os.fsync(dst)
            finally:
                os.close(dst)
            os.fsync(destination_parent)
        finally:
            if src is not None:
                os.close(src)
            os.close(source_parent)
            os.close(destination_parent)

    def snapshot(self):
        self.idle()
        folder = self.s.root / 'snapshots'
        # The installer creates this as UID1000. Never root-chown a user path.
        anchor = owned_directory(folder, self.s.uid)
        os.close(anchor)
        boot = self.s.boot()
        if not re.fullmatch(r'[a-f0-9-]{36}', boot):
            raise ValueError('Invalid boot ID')
        original = digest(self.base)
        target = folder / (boot + '-' + original[:16] + '.raw')
        if target.exists():
            if digest(target) != original:
                raise ValueError('Never overwrite an earlier recovery image')
        else:
            self.copy_image(self.base, target)
        if digest(target) != original:
            raise ValueError('Recovery snapshot mismatch')
        self.state.update(snapshotBoot=boot, snapshotHash=original, snapshot=str(target))
        self.save()
        return {'snapshot': str(target), 'sha256': original, 'bytes': self.s.size, 'stage': self.state['stage']}

    def make_baseline(self):
        if self.state['stage'] != 'raw' or self.baseline.exists():
            raise ValueError('Refusing to format an initialized filesystem')
        self.connect()
        self.owned_device()
        self.s.run([self.s.exe('mkfs.ext4'), '-q', '-F', '-b', '4096', '-E',
                    'nodiscard,lazy_itable_init=0,lazy_journal_init=0', self.s.device], timeout=90)
        self.mount_data()
        mount = open_directory(self.s.mount)
        try:
            os.fchown(mount, self.s.uid, self.s.gid)
            os.fchmod(mount, 0o700)
            os.fsync(mount)
        finally:
            os.close(mount)
        self.detach()
        self.copy_image(self.base, self.baseline)
        self.state.update(stage='filesystem', baselineHash=digest(self.baseline), snapshotBoot=None)
        self.save()
        return {'stage': 'filesystem', 'baselineHash': self.state['baselineHash']}

    def restore(self):
        self.idle()
        if self.state['stage'] != 'filesystem' or digest(self.baseline) != self.state.get('baselineHash'):
            raise ValueError('No trustworthy filesystem baseline')
        self.copy_image(self.baseline, self.base, replace=True)
        self.state['snapshotBoot'] = None
        self.save()
        return {'restored': True, 'sha256': digest(self.base)}

    def trace_tip(self):
        events = [json.loads(line) for line in self.trace.read_text().splitlines()]
        ready = next(e for e in reversed(events) if e['op'] == 'ready')
        current = [e for e in events if e['instance'] == ready['instance']]
        return ready['instance'], current

    def calibration(self, fua=False):
        if self.state['stage'] != 'raw':
            raise ValueError('Calibration needs an unformatted image')
        scenario = 'positive-control' if fua else 'negative-control'
        self.state.update(runId=self.s.boot(), calibrationScenario=scenario)
        self.save()
        if fua:
            self.idle()
            self.start_backend()
            import nbd
            keep = nbd.NBD()
            keep.connect_unix(self.s.socket)
            keep.pwrite(b'F' * 4096, 8192, flags=nbd.CMD_FLAG_FUA)
        else:
            self.connect()
            keep = os.open(self.s.device, os.O_RDWR | os.O_DIRECT)
            data = mmap.mmap(-1, 4096)
            data[:] = b'D' * 4096
            if os.pwrite(keep, data, 0) != 4096:
                raise OSError('Short durable control write')
            os.fsync(keep)
            data[:] = b'V' * 4096
            if os.pwrite(keep, data, 4096) != 4096:
                raise OSError('Short pending control write')
        instance, events = self.trace_tip()
        if not fua:
            pending = next(e for e in reversed(events) if e['op'] == 'write-complete' and e['offset'] == 4096)
            if any(e['op'].startswith('flush-') and e['seq'] > pending['seq'] for e in events):
                raise ValueError('Volatile control accidentally flushed')
        self.state.update(calibrationPID=os.getpid(), calibrationTicks=proc_ticks(os.getpid()),
                          calibrationBoot=self.s.boot())
        self.save()
        payload = {'version': 1, 'kind': 'calibration', 'bootId': self.state['runId'], 'scenario': scenario, 'expected': {'durable': True, 'volatile': False} if not fua else {'fua': True},
                   'phase': 'held', 'targetUUID': self.c.get('uuid'), 'backendInstance': instance,
                   'backendSeq': events[-1]['seq']}
        return Hold(payload, keep)

    def remove(self):
        self.idle()
        if self.s.verify_installed:
            for path in (Path('/etc/systemd/user') / SERVICE, Path('/etc/sudoers.d/tilde-m4-power'),
                         CONFIG, self.s.state_path, HELPER):
                path.unlink()
            shutil.rmtree(LIB)
            self.s.userctl('daemon-reload')
        return {'removed': True, 'imagesRetained': str(self.s.root)}

    def dispatch(self, verb):
        if verb not in VERBS:
            raise ValueError('Unknown helper verb')
        self.validate()
        if verb == 'preflight':
            return {'uuid': self.s.uuid(), 'bootId': self.s.boot(), 'stage': self.state['stage'],
                    'root': str(self.s.root), 'mount': str(self.s.mount), 'base': str(self.base),
                    'trace': str(self.trace), 'hashes': self.c['hashes'],
                    'devicePID': self.s.device_pid(), 'backendPID': self.s.backend_pid(),
                    'mountSource': self.s.mount_source(),
                    'mountOptions': self.s.mount_options() if self.s.mount_source() else None}
        if verb == 'attach':
            return self.connect(mount=self.state['stage'] == 'filesystem')
        if verb == 'detach':
            return self.detach()
        if verb == 'make-baseline':
            return self.make_baseline()
        if verb == 'restore-baseline':
            return self.restore()
        if verb == 'snapshot-recovery':
            return self.snapshot()
        if verb == 'calibration-write':
            return self.calibration()
        if verb == 'calibration-fua':
            return self.calibration(fua=True)
        if verb == 'read-trace':
            info = self.trace.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != self.s.uid or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > 16*1024*1024:
                raise ValueError('Unsafe bounded trace')
            lines = self.trace.read_text().splitlines(keepends=True)
            complete = [line for line in lines if line.endswith('\n')]
            return {'events': [json.loads(line) for line in complete], 'partialTail': bool(lines and not lines[-1].endswith('\n'))}
        if verb == 'calibration-read':
            self.idle()
            if self.state.get('snapshotBoot') != self.s.boot():
                raise ValueError('Snapshot raw image before recovery inspection')
            image = os.open(self.base, os.O_RDONLY | os.O_NOFOLLOW)
            try:
                durable = os.pread(image, 4096, 0) == b'D'*4096
                volatile = os.pread(image, 4096, 4096)
                fua = os.pread(image, 4096, 8192) == b'F'*4096
            finally:
                os.close(image)
            return {'durable': durable, 'volatile': volatile == b'V'*4096, 'zeroVolatile': volatile == bytes(4096), 'fua': fua, 'kind': 'calibration', 'runId': self.state.get('runId'),
                    'scenario': self.state.get('calibrationScenario'), 'phase': 'recovered',
                    'baseSha256': digest(self.base)}
        return self.remove()


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in VERBS:
        raise ValueError('Exactly one fixed helper verb is required')
    info = CONFIG.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
        raise ValueError('Untrusted root manifest')
    with open('/run/lock/tilde-m4-power.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        result = Control(json.loads(CONFIG.read_text())).dispatch(sys.argv[1])
    payload = result.payload if isinstance(result, Hold) else result
    print(json.dumps(payload), flush=True)
    if isinstance(result, Hold):
        signal.alarm(120)
        while True:
            signal.pause()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': str(error)}), file=sys.stderr)
        sys.exit(1)
