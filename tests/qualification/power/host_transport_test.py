import os
from pathlib import Path
import signal
import tempfile
import unittest
from unittest.mock import patch
from host_controller import digest
from host_transport import QmpSshTransport

UUID='11111111-1111-4111-8111-111111111111'
class TransportGuardsTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        for name in ('disk.qcow2','key','known-hosts'):
            p=self.root/name;p.write_bytes(b'synthetic fixture');p.chmod(0o600)
        s=(self.root/'disk.qcow2').stat()
        self.target={'uri':'qmp+unix://'+str(self.root/'qmp.sock'),'uuid':UUID,'name':'fixture','disk':str(self.root/'disk.qcow2'),'diskDevice':s.st_dev,'diskInode':s.st_ino}
        argv=['/usr/bin/qemu-system-x86_64','-name','fixture','-uuid',UUID,'-drive','file='+self.target['disk']+',format=qcow2']
        self.g={'version':1,'sourceSha256':'a'*64,'ownerApproved':True,'ownerStatement':'Synthetic fixture only','expiresAt':99999999999,'maxCuts':1,'maxBoots':2,'allowHostDevices':False,'scenarios':['negative-control'],'target':self.target,'vm':{'argv':argv,'argvSha256':digest(argv),'pidfile':str(self.root/'qemu.pid'),'qmp':str(self.root/'qmp.sock'),'ssh':{'host':'127.0.0.1','port':45555,'user':'tilde-check','key':str(self.root/'key'),'knownHosts':str(self.root/'known-hosts')}}}
    def transport(self):return QmpSshTransport(self.g,self.root/'oracle.ndjson')
    def test_activeOrWrongDeviceRefusesBeforeSpawn(self):
        p=self.root/'qemu.pid';p.write_text(str(os.getpid()));p.chmod(0o600)
        with patch('host_transport.subprocess.Popen',side_effect=AssertionError('No launch')):
            with self.assertRaises(ValueError):self.transport().boot()
        self.g['target']['disk']='/dev/null'
        with self.assertRaises(ValueError):self.transport()
    def test_hostShareAndChangedRecipeRefuseBeforeSpawn(self):
        for extra in (['-fsdev','local,path=/'],['-drive','file=/dev/null']):
            old=list(self.g['vm']['argv']);self.g['vm']['argv']+=extra;self.g['vm']['argvSha256']=digest(self.g['vm']['argv'])
            with patch('host_transport.subprocess.Popen',side_effect=AssertionError('No launch')):
                with self.assertRaises(ValueError):self.transport().boot()
            self.g['vm']['argv']=old
        self.g['vm']['argvSha256']='wrong'
        with self.assertRaises(ValueError):self.transport().boot()
    def test_actualCutTransportUsesOnlyPinnedSigkill(self):
        transport=self.transport();observed={**self.target,'state':'running','pid':99999999,'startTicks':'12','hostBootId':UUID};transport.observe=lambda:dict(observed)
        with patch('host_transport.ticks',return_value='12'),patch('host_transport.os.kill') as kill,patch('host_transport.Path.exists',return_value=False):
            transport.cut(observed)
        kill.assert_called_once_with(99999999,signal.SIGKILL)
        with patch('host_transport.ticks',return_value='13'),patch('host_transport.os.kill') as kill:
            with self.assertRaises(ValueError):transport.cut(observed)
            kill.assert_not_called()
    def test_remoteSshOrForeignPrivateKeyRefuses(self):
        self.g['vm']['ssh']['host']='example.invalid'
        with self.assertRaises(ValueError):self.transport()
        self.g['vm']['ssh']['host']='127.0.0.1';(self.root/'key').chmod(0o644)
        with self.assertRaises(ValueError):self.transport()
