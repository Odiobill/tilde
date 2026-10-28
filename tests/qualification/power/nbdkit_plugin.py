"""nbdkit API 2 adapter; data is never logged, and close never flushes."""
import json
import os
from pathlib import Path
import stat
import sys
import uuid

import nbdkit

sys.path.insert(0, str(Path(__file__).resolve().parent))
from volatile_disk import VolatileDisk

API_VERSION = 2
_config = {}
_disk = None
_log = None
_failed = False
_sequence = 0
_instance = str(uuid.uuid4())
_boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()


def config(key, value):
    if key not in ('base', 'log') or key in _config:
        raise ValueError('Expected exactly one base and log')
    _config[key] = value


def config_complete():
    if set(_config) != {'base', 'log'}:
        raise ValueError('base and log are required')


def thread_model():
    return nbdkit.THREAD_MODEL_SERIALIZE_ALL_REQUESTS


def _event(operation, **fields):
    global _sequence, _failed
    _sequence += 1
    event = {'instance': _instance, 'bootId': _boot, 'seq': _sequence, 'op': operation, **fields}
    payload = (json.dumps(event) + '\n').encode()
    try:
        if os.fstat(_log).st_size + len(payload) > 16 * 1024 * 1024:
            raise OSError('Trace limit exceeded')
        offset = 0
        while offset < len(payload):
            written = os.write(_log, payload[offset:])
            if written <= 0:
                raise OSError('Short trace write')
            offset += written
        os.fsync(_log)
    except OSError:
        _failed = True
        raise


def get_ready():
    global _disk, _log
    _disk = VolatileDisk(Path(_config['base']))
    _log = os.open(_config['log'], os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
    info = os.fstat(_log)
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError('Trace must be an owned regular file')
    _event('ready', size=_disk.size, limit=_disk.limit_bytes)


def _backend():
    if _failed or _disk is None:
        raise OSError('Backend trace failed or not ready')
    return _disk


def open(readonly):
    _backend()
    return readonly


def get_size(h):
    return _backend().size


def can_write(h):
    return not h


def can_flush(h):
    return True


def can_fua(h):
    return nbdkit.FUA_EMULATE


def can_multi_conn(h):
    return False


def can_trim(h):
    return False


def can_zero(h):
    return False


def can_cache(h):
    return nbdkit.CACHE_NONE


def pread(h, buf, offset, flags):
    global _failed
    try:
        buf[:] = _backend().read(offset, len(buf))
    except Exception as error:
        _poison('read', error)
        raise


def _poison(operation, error):
    global _failed
    try:
        _event('error', request=operation, error=type(error).__name__)
    except OSError:
        pass
    _failed = True


def pwrite(h, buf, offset, flags):
    if h:
        raise PermissionError('Read-only connection')
    try:
        disk = _backend()
        _event('write-start', offset=offset, count=len(buf), flags=flags)
        disk.write(offset, buf)
        _event('write-complete', offset=offset, count=len(buf), flags=flags, dirty=disk.dirty_bytes)
    except Exception as error:
        _poison('write', error)
        raise


def flush(h, flags):
    try:
        disk = _backend()
        _event('flush-start', flags=flags, dirty=disk.dirty_bytes)
        disk.flush()
        _event('flush-complete', flags=flags, dirty=0)
    except Exception as error:
        _poison('flush', error)
        raise


def cleanup():
    if _disk is not None:
        _disk.close()
    if _log is not None:
        os.close(_log)
