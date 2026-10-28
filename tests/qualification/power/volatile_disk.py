"""Disposable power-loss model: pending writes exist only in process memory."""
import errno
import os
from pathlib import Path
import stat


class VolatileDisk:
    def __init__(self, base: Path, limit_bytes: int = 67108864):
        if not isinstance(limit_bytes, int) or limit_bytes <= 0:
            raise ValueError('Invalid cache limit')
        self.fd = os.open(base, os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC)
        info = os.fstat(self.fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600:
            os.close(self.fd)
            raise ValueError('Base must be an owned regular file')
        self.size = info.st_size
        self.limit_bytes = limit_bytes
        self.pending = []
        self.dirty_bytes = 0
        self.failed = False

    def _check(self, offset=0, count=0):
        if self.fd is None:
            raise OSError(errno.EBADF, 'Cache closed')
        if self.failed:
            raise OSError(errno.EIO, 'Cache poisoned by persistence failure')
        if (not isinstance(offset, int) or not isinstance(count, int)
                or offset < 0 or count < 0 or offset + count > self.size):
            raise ValueError('Request outside fixed image')

    def read(self, offset, count):
        self._check(offset, count)
        result = bytearray(os.pread(self.fd, count, offset))
        if len(result) != count:
            self.failed = True
            raise OSError(errno.EIO, 'Short base read')
        for start, data in self.pending:
            lo, hi = max(offset, start), min(offset + count, start + len(data))
            if lo < hi:
                result[lo - offset:hi - offset] = data[lo - start:hi - start]
        return bytes(result)

    def write(self, offset, data):
        self._check(offset, len(data))
        if self.dirty_bytes + len(data) > self.limit_bytes:
            raise BufferError('Pending-memory limit exceeded')
        if data:
            self.pending.append((offset, bytes(data)))
            self.dirty_bytes += len(data)

    def flush(self):
        self._check()
        try:
            for offset, data in self.pending:
                done = 0
                while done < len(data):
                    written = os.pwrite(self.fd, data[done:], offset + done)
                    if written <= 0:
                        raise OSError(errno.EIO, 'Zero-length base write')
                    done += written
            os.fsync(self.fd)
        except OSError:
            self.failed = True
            raise
        self.discard()

    def discard(self):
        self.pending.clear()
        self.dirty_bytes = 0

    def close(self):
        self.discard()
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None
