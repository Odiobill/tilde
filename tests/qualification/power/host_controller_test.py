import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from host_controller import HostController

UUID = '11111111-1111-4111-8111-111111111111'
class Transport:
    def __init__(self, target):
        self.target = dict(target)
        self.commands = []
    def observe(self):
        return {**self.target, 'state': 'running', 'pid': 123, 'startTicks': '456', 'hostBootId': UUID}
    def cut(self, observed):
        self.commands.append(('SIGKILL', observed['pid']))
    def flush(self):
        raise AssertionError('A cut never flushes')
    def guest(self, verb):
        raise AssertionError('A cut never runs a guest command')

class HostControllerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.target = {'uri':'qmp+unix:///fixture/qmp.sock', 'name':'disposable-fixture', 'uuid':UUID, 'disk':'/fixture/owned.qcow2', 'diskDevice':1, 'diskInode':2}
        self.grant = {'version':1, 'sourceSha256':'a'*64, 'ownerApproved':True, 'ownerStatement':'Synthetic test only', 'target':self.target, 'scenarios':['negative-control','positive-control','pending-approval'], 'maxCuts':3, 'expiresAt':99999999999, 'allowHostDevices':False}
        self.ack = {'version':1,'kind':'calibration','scenario':'negative-control','phase':'held','targetUUID':UUID,'bootId':UUID,'backendInstance':UUID,'backendSeq':3,'expected':{'durable':True,'volatile':False}}
        self.transport = Transport(self.target)
    def controller(self):
        return HostController(self.grant,self.transport,self.root/'oracle.ndjson')
    def test_unapprovedOrWrongGuestRefusesBeforeMutation(self):
        self.grant['ownerApproved']=False
        with self.assertRaises(ValueError):self.controller().cut_after_ack(self.ack,'negative-control')
        self.assertEqual(self.transport.commands,[])
        self.grant['ownerApproved']=True;self.transport.target['uuid']='wrong'
        with self.assertRaises(ValueError):self.controller().cut_after_ack(self.ack,'negative-control')
        self.assertEqual(self.transport.commands,[])
    def test_controllerNeverFlushesOnCut_and_oracle_precedes_cut(self):
        original=self.transport.cut
        def cut(observed):
            records=[json.loads(s) for s in (self.root/'oracle.ndjson').read_text().splitlines()]
            self.assertEqual(records[-1]['event'],'cut-authorized');self.assertEqual(records[-1]['ack'],self.ack)
            original(observed)
        self.transport.cut=cut
        self.controller().cut_after_ack(self.ack,'negative-control')
        self.assertEqual(self.transport.commands,[('SIGKILL',123)])
    def test_changedPidBootDiskOrSecondObservationRefuses(self):
        for key,value in [('pid',999),('startTicks','different'),('hostBootId','different'),('diskInode',99),('state','stopped')]:
            with self.subTest(key=key):
                original=self.transport.observe;calls=0
                def changed():
                    nonlocal calls
                    calls+=1;v=original()
                    if calls==2:v[key]=value
                    return v
                self.transport.observe=changed
                with self.assertRaises(ValueError):self.controller().cut_after_ack(self.ack,'negative-control')
                self.transport.observe=original
                self.assertEqual(self.transport.commands,[])
    def test_oracleTamperOrAckReplayRefuses(self):
        c=self.controller();c.cut_after_ack(self.ack,'negative-control')
        with self.assertRaises(ValueError):c.cut_after_ack(self.ack,'negative-control')
        path=self.root/'oracle.ndjson';path.write_text(path.read_text().replace('cut-authorized','tampered'))
        with self.assertRaises(ValueError):self.controller().cut_after_ack({**self.ack,'backendSeq':3},'negative-control')
    def test_calibrationMustObserveLossAndFlushBeforeProductCut(self):
        c=self.controller()
        negative=dict(self.ack)
        c.cut_after_ack(negative,'negative-control')
        trace=[{'instance':UUID,'bootId':UUID,'seq':1,'op':'ready'},{'instance':UUID,'bootId':UUID,'seq':2,'op':'flush-complete'},{'instance':UUID,'bootId':UUID,'seq':3,'op':'write-complete','offset':4096}]
        # The acknowledgement must refer to an actually retained event boundary.
        with self.assertRaises(ValueError):c.verify_calibration('negative-control',negative,{'durable':True,'volatile':True,'zeroVolatile':False},trace)
        c.verify_calibration('negative-control',negative,{'durable':True,'volatile':False,'zeroVolatile':True},trace)
        positive={**negative,'scenario':'positive-control','backendSeq':3}
        c.cut_after_ack(positive,'positive-control')
        positive_trace=[{'instance':UUID,'bootId':UUID,'seq':1,'op':'ready'},{'instance':UUID,'bootId':UUID,'seq':2,'op':'write-complete','offset':8192},{'instance':UUID,'bootId':UUID,'seq':3,'op':'flush-complete'}]
        c.verify_calibration('positive-control',positive,{'fua':True},positive_trace)
        app={**negative,'kind':'application','scenario':'pending-approval','expected':{'pragmas':[{'store':store,'activeConnection':True,'journalMode':'wal','synchronous':2,'integrity':'ok'} for store in ('pi','operations')]}}
        c.cut_after_ack(app,'pending-approval')
        self.assertEqual(len(self.transport.commands),3)

    def test_productCasesNeedBothIndependentCalibrationControls(self):
        ack={**self.ack,'kind':'application','scenario':'pending-approval'}
        with self.assertRaises(ValueError):self.controller().cut_after_ack(ack,'pending-approval')
        self.assertEqual(self.transport.commands,[])
