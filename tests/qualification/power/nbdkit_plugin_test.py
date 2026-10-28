import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from volatile_disk import VolatileDisk


class PluginTest(unittest.TestCase):
    def test_unsafe_trace_is_refused_before_append(self):
        with tempfile.TemporaryDirectory() as folder:
            base,trace=Path(folder)/'disk.raw',Path(folder)/'events.ndjson'
            base.write_bytes(bytes(16384));base.chmod(0o600)
            trace.write_bytes(b'sentinel');trace.chmod(0o644)
            sdk=SimpleNamespace(THREAD_MODEL_SERIALIZE_ALL_REQUESTS=1,FUA_EMULATE=1,CACHE_NONE=0)
            spec=importlib.util.spec_from_file_location('m4_unsafe_trace',Path(__file__).with_name('nbdkit_plugin.py'))
            module=importlib.util.module_from_spec(spec)
            with patch.dict('sys.modules',{'nbdkit':sdk}):spec.loader.exec_module(module)
            module.config('base',str(base));module.config('log',str(trace))
            try:
                with self.assertRaises(ValueError):module.get_ready()
                self.assertEqual(trace.read_bytes(),b'sentinel')
            finally:module.cleanup()

    def test_callback_error_poison_prevents_later_flush_success(self):
        with tempfile.TemporaryDirectory() as folder:
            base, trace = Path(folder) / 'disk.raw', Path(folder) / 'events.ndjson'
            base.write_bytes(bytes(16384)); base.chmod(0o600)
            sdk = SimpleNamespace(THREAD_MODEL_SERIALIZE_ALL_REQUESTS=1, FUA_EMULATE=1, CACHE_NONE=0)
            spec = importlib.util.spec_from_file_location('g9_adapter_test', Path(__file__).with_name('nbdkit_plugin.py'))
            module = importlib.util.module_from_spec(spec)
            with patch.dict('sys.modules', {'nbdkit': sdk}):
                spec.loader.exec_module(module)
            module.config('base', str(base)); module.config('log', str(trace))
            # Real cache and file IO, small bound; SDK is only an import adapter.
            with patch.object(module, 'VolatileDisk', side_effect=lambda p: VolatileDisk(p, limit_bytes=4)):
                module.get_ready()
            try:
                module.pwrite(False, b'ABCD', 0, 0)
                with self.assertRaises(BufferError):
                    module.pwrite(False, b'X', 4, 0)
                with self.assertRaises(OSError):
                    module.flush(False, 0)
                self.assertEqual(base.read_bytes(), bytes(16384))
                events = [json.loads(line) for line in trace.read_text().splitlines()]
                self.assertTrue(any(e['op'] == 'error' for e in events))
            finally:
                module.cleanup()
