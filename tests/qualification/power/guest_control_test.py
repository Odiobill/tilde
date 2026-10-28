import hashlib
import json
import os
import stat
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from guest_control import Control, System
TARGET_UUID = '11111111-1111-4111-8111-111111111111'


class FixtureSystem(System):
    def __init__(self, root):
        self.root = root
        self.mount = root / 'mount'
        self.state_path = root / 'control-state.json'
        self.uid = os.getuid()
        self.gid = os.getgid()
        self.size = 16384
        self.verify_installed = False
        self.identity = TARGET_UUID
        self.pid = ''
        self.mounted = None
        self.effects = root / 'unexpected-format'

    def uuid(self):
        return self.identity

    def boot(self):
        return '11111111-1111-4111-8111-111111111111'

    def euid(self):
        return 0

    def device_pid(self):
        return self.pid

    def mount_source(self):
        return self.mounted

    def backend_pid(self):
        return 0

    def run(self, args, **kwargs):
        if any('mkfs' in part for part in args):
            self.effects.write_text('FORMATTED')
        raise AssertionError('Unexpected privileged command in file-only guard test')


class GuestControlTest(unittest.TestCase):
    def test_expected_uid_can_have_different_primary_gid(self):
        with patch('pwd.getpwnam', return_value=SimpleNamespace(
                pw_uid=1000, pw_gid=1001, pw_dir='/home/tilde-check')):
            self.assertEqual(System().gid, 1001)

    def test_unexpected_account_identity_is_rejected(self):
        with patch('pwd.getpwnam', return_value=SimpleNamespace(
                pw_uid=999, pw_gid=1001, pw_dir='/home/tilde-check')):
            with self.assertRaises(ValueError):
                System()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.system = FixtureSystem(self.root)
        self.base = self.root / 'disk.raw'
        self.original = b'ORIGINAL' + bytes(16376)
        self.base.write_bytes(self.original)
        self.base.chmod(0o600)
        (self.root / 'snapshots').mkdir(mode=0o700)
        self.config = {'uuid': TARGET_UUID, 'uid': os.getuid(), 'gid': os.getgid(),
                       'root': str(self.root), 'device': '/dev/nbd0',
                       'mount': str(self.system.mount), 'hashes': {}}

    def control(self):
        return Control(self.config, self.system)

    def assert_untouched(self):
        self.assertEqual(self.base.read_bytes(), self.original)
        self.assertFalse(self.system.effects.exists())

    def test_wrong_vm_identity_refuses_actions(self):
        self.system.identity = '22222222-2222-4222-8222-222222222222'
        with self.assertRaises(ValueError):
            self.control().dispatch('make-baseline')
        self.assert_untouched()

    def test_nonfixture_path_refused(self):
        self.config['root'] = '/etc'
        with self.assertRaises(ValueError):
            self.control().dispatch('make-baseline')
        self.assert_untouched()

    def test_occupied_or_wrong_nbd_device_refused(self):
        self.system.pid = '9000'
        with self.assertRaises(ValueError):
            self.control().dispatch('attach')
        self.system.pid = ''
        self.config['device'] = '/dev/vda'
        with self.assertRaises(ValueError):
            self.control().dispatch('attach')
        self.assert_untouched()

    def test_recovery_never_formats(self):
        result = self.control().dispatch('snapshot-recovery')
        self.assertEqual(Path(result['snapshot']).read_bytes(), self.original)
        self.assertEqual(result['sha256'], hashlib.sha256(self.original).hexdigest())
        self.assert_untouched()

    def test_baseline_restore_requires_disconnected_device(self):
        baseline = self.root / 'baseline.raw'
        baseline.write_bytes(b'BASELINE' + bytes(16376))
        control = self.control()
        control.state.update(stage='filesystem', baselineHash=hashlib.sha256(baseline.read_bytes()).hexdigest())
        self.system.pid = '9000'
        with self.assertRaises(ValueError):
            control.dispatch('restore-baseline')
        self.assert_untouched()

    def test_reinitialization_refuses_existing_filesystem(self):
        control = self.control()
        control.state['stage'] = 'filesystem'
        with self.assertRaises(ValueError):
            control.dispatch('make-baseline')
        self.assert_untouched()

    def test_changed_restore_destination_is_not_truncated(self):
        destination = self.root / 'changed-destination'
        destination.write_bytes(b'PRESERVE')
        with self.assertRaises(ValueError):
            self.control().copy_image(self.base, destination, replace=True)
        self.assertEqual(destination.read_bytes(), b'PRESERVE')

    def test_snapshot_directory_symlink_cannot_touch_unrelated_directory(self):
        with tempfile.TemporaryDirectory() as other:
            outside = Path(other)
            sentinel = outside / 'sentinel'
            sentinel.write_bytes(b'UNRELATED')
            before = outside.stat()
            (self.root / 'snapshots').rmdir()
            (self.root / 'snapshots').symlink_to(outside, target_is_directory=True)
            with self.assertRaises((ValueError, OSError)):
                self.control().dispatch('snapshot-recovery')
            self.assertEqual(sentinel.read_bytes(), b'UNRELATED')
            self.assertEqual(list(outside.iterdir()), [sentinel])
            self.assertEqual((outside.stat().st_uid, outside.stat().st_gid, outside.stat().st_mode),
                             (before.st_uid, before.st_gid, before.st_mode))

    def test_copy_cannot_follow_replaced_snapshot_parent(self):
        with tempfile.TemporaryDirectory() as other:
            outside = Path(other)
            (self.root / 'snapshots').rmdir()
            (self.root / 'snapshots').symlink_to(outside, target_is_directory=True)
            with self.assertRaises((ValueError, OSError)):
                self.control().copy_image(self.base, self.root / 'snapshots' / 'image.raw')
            self.assertEqual(list(outside.iterdir()), [])

    def test_unprivileged_setup_rejects_root_and_snapshot_symlinks(self):
        from guest_control import initialize_fixture
        with tempfile.TemporaryDirectory() as other:
            outside = Path(other)
            outside.chmod(0o755)
            sentinel = outside / 'sentinel'
            sentinel.write_bytes(b'UNRELATED')
            for leaf in ['fixture-root', 'snapshots']:
                if leaf == 'fixture-root':
                    link = self.root / leaf
                    link.symlink_to(outside, target_is_directory=True)
                    self.system.root = link
                else:
                    self.system.root = self.root
                    link = self.root / leaf
                    link.rmdir()
                    link.symlink_to(outside, target_is_directory=True)
                before = outside.stat()
                with self.assertRaises((ValueError, OSError)):
                    initialize_fixture(self.system, verified_uuid=TARGET_UUID)
                self.assertEqual(list(outside.iterdir()), [sentinel])
                self.assertEqual(sentinel.read_bytes(), b'UNRELATED')
                self.assertEqual((outside.stat().st_uid, outside.stat().st_gid, outside.stat().st_mode),
                                 (before.st_uid, before.st_gid, before.st_mode))

    def test_setup_creates_owned_fixture_without_root_chown(self):
        from guest_control import initialize_fixture
        self.system.root = self.root / 'new-fixture'
        with patch('os.chown', side_effect=AssertionError('No path chown')):
            initialize_fixture(self.system, verified_uuid=TARGET_UUID)
        base = self.system.root / 'disk.raw'
        self.assertEqual(base.stat().st_size, self.system.size)
        self.assertEqual(base.stat().st_uid, os.getuid())

    def test_initializer_uses_root_verified_uuid_without_private_sysfs_read(self):
        from guest_control import initialize_fixture
        self.system.root = self.root / 'unprivileged-fixture'
        self.system.uuid = lambda: (_ for _ in ()).throw(PermissionError('root-only DMI'))
        try:
            result = initialize_fixture(self.system, verified_uuid=TARGET_UUID)
        except PermissionError:
            self.fail('Unprivileged initialization reread root-only DMI instead of using verified identity')
        self.assertTrue(result['initialized'])
        self.assertEqual((self.system.root / 'disk.raw').stat().st_uid, os.getuid())

    def test_initializer_refuses_missing_or_wrong_verified_uuid_before_creation(self):
        from guest_control import initialize_fixture
        self.system.root = self.root / 'unverified-fixture'
        for offered in (None, 'wrong-machine'):
            with self.assertRaises(ValueError):
                initialize_fixture(self.system, verified_uuid=offered)
            self.assertFalse(self.system.root.exists())

    def mount_fixture(self, effective=None):
        system = self.system
        system.backend = 0
        system.commands = []
        system.options = ''
        system.exe = lambda name: '/fixture-bin/' + name
        system.backend_pid = lambda: system.backend
        system.mount_options = lambda: effective if effective is not None else system.options
        def run(args, **kwargs):
            system.commands.append(args)
            if 'nbd-client' in args[0]:
                system.pid = '' if '-d' in args else '123'
            elif args[0].endswith('/mount'):
                system.mounted = system.device
                system.options = args[args.index('-o') + 1] if '-o' in args else 'rw'
            elif args[0].endswith('/umount'):
                system.mounted = None
            return ''
        system.run = run
        system.userctl = lambda *args, **kwargs: setattr(system, 'backend', 0) or ''
        system.mount.mkdir(mode=0o700)
        control = self.control()
        def backend():
            system.backend = 42
            control.state.update(connectedBoot=system.boot(), backendPID=42)
        control.start_backend = backend
        control.state['snapshotBoot'] = system.boot()
        real_stat = os.stat
        def device_stat(path, *args, **kwargs):
            if str(path) == system.device:
                return SimpleNamespace(st_mode=stat.S_IFBLK, st_rdev=os.makedev(43, 0))
            return real_stat(path, *args, **kwargs)
        return control, device_stat

    def test_recovery_mount_disables_setuid_devices_and_execution(self):
        control, device_stat = self.mount_fixture()
        with patch('os.stat', side_effect=device_stat):
            control.connect(mount=True)
        self.assertTrue({'nosuid', 'nodev', 'noexec'} <= set(self.system.options.split(',')))

    def test_initialization_mount_disables_setuid_devices_and_execution(self):
        control, device_stat = self.mount_fixture()
        with patch('os.stat', side_effect=device_stat):
            control.make_baseline()
        mounts = [cmd for cmd in self.system.commands if cmd[0].endswith('/mount')]
        self.assertEqual(len(mounts), 1)
        self.assertIn('-o', mounts[0])
        self.assertTrue({'nosuid', 'nodev', 'noexec'} <= set(mounts[0][mounts[0].index('-o')+1].split(',')))

    def test_effective_mount_flags_must_be_observed(self):
        control, device_stat = self.mount_fixture(effective='rw,noatime')
        with patch('os.stat', side_effect=device_stat):
            with self.assertRaisesRegex(ValueError, 'Unsafe effective mount options'):
                control.connect(mount=True)


if __name__ == '__main__':
    unittest.main()
