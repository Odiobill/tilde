import errno
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from volatile_disk import VolatileDisk


class VolatileDiskTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name) / 'disk.raw'
        self.base.write_bytes(bytes(16384))
        self.base.chmod(0o600)

    def disk(self, **kwargs):
        disk = VolatileDisk(self.base, **kwargs)
        self.addCleanup(disk.close)
        return disk

    def test_negativeControlLosesUnflushedData(self):
        disk = self.disk()
        disk.write(4096, b'PENDING')
        self.assertEqual(disk.read(4096, 7), b'PENDING')
        self.assertEqual(self.base.read_bytes()[4096:4103], bytes(7))
        disk.close()
        self.assertEqual(self.base.read_bytes()[4096:4103], bytes(7))

    def test_discard_loses_only_pending_data(self):
        disk = self.disk()
        disk.write(0, b'DURABLE')
        disk.flush()
        disk.write(4096, b'VOLATILE')
        disk.discard()
        self.assertEqual(disk.read(0, 7), b'DURABLE')
        self.assertEqual(disk.read(4096, 8), bytes(8))

    def test_positiveControlRetainsAcknowledgedFlush(self):
        disk = self.disk()
        disk.write(8192, b'COMMITTED')
        disk.flush()
        disk.close()
        reopened = self.disk()
        self.assertEqual(reopened.read(8192, 9), b'COMMITTED')

    def test_overlapping_writes_keep_latest_bytes(self):
        disk = self.disk()
        disk.write(2, b'ABCD')
        disk.write(4, b'xy')
        self.assertEqual(disk.read(0, 8), b'\0\0ABxy\0\0')
        disk.flush()
        self.assertEqual(self.base.read_bytes()[:8], b'\0\0ABxy\0\0')

    def test_bounds_and_limit_fail_before_mutation(self):
        disk = self.disk(limit_bytes=8)
        for offset, data in [(-1, b'x'), (16384, b'x')]:
            with self.assertRaises(ValueError):
                disk.write(offset, data)
        with self.assertRaises(ValueError):
            disk.read(-1, 1)
        with self.assertRaises(ValueError):
            disk.read(16380, 8)
        disk.write(0, b'abcd')
        with self.assertRaises(BufferError):
            disk.write(4, b'12345')
        self.assertEqual(disk.read(0, 9), b'abcd' + bytes(5))
        self.assertEqual(self.base.read_bytes()[:9], bytes(9))

    def test_persist_or_fsync_error_is_not_success(self):
        for syscall in ['pwrite', 'fsync']:
            with self.subTest(syscall=syscall):
                disk = self.disk()
                disk.write(0, b'WRITE')
                with patch('volatile_disk.os.' + syscall,
                           side_effect=OSError(errno.EIO, 'injected I/O error')):
                    with self.assertRaises(OSError):
                        disk.flush()
                with self.assertRaises(OSError):
                    disk.write(0, b'RETRY')
                with self.assertRaises(OSError):
                    disk.flush()
                disk.close()

    def test_short_writes_are_completed_before_flush_ack(self):
        disk = self.disk()
        disk.write(0, b'abcdef')
        real_pwrite = os.pwrite
        with patch('volatile_disk.os.pwrite',
                   side_effect=lambda fd, data, offset: real_pwrite(fd, data[:2], offset)):
            disk.flush()
        self.assertEqual(self.base.read_bytes()[:6], b'abcdef')

    def test_hardlinked_or_public_base_refuses_before_write(self):
        alias = self.base.parent / 'alias.raw'
        os.link(self.base, alias)
        with self.assertRaises(ValueError):
            VolatileDisk(self.base)
        alias.unlink()
        self.base.chmod(0o644)
        with self.assertRaises(ValueError):
            VolatileDisk(self.base)
        self.assertEqual(self.base.read_bytes(), bytes(16384))

    def test_symlink_base_is_refused(self):
        link = self.base.parent / 'link.raw'
        link.symlink_to(self.base)
        with self.assertRaises(OSError):
            VolatileDisk(link)


if __name__ == '__main__':
    unittest.main()
