import time
import unittest
from guest_setup import validate_setup_scope,FILES
class SetupScopeTest(unittest.TestCase):
    def test_ownerHostOrUnapprovedSetupRefuses(self):
        scope={'version':1,'ownerApproved':True,'ownerStatement':'Synthetic format fixture','expiresAt':time.time()+300,'targetUUID':'11111111-1111-4111-8111-111111111111','device':'/dev/nbd0','mount':'/mnt/tilde-m4-power','hashes':{k:'a'*64 for k in FILES}}
        observed={'euid':0,'uuid':scope['targetUUID'],'os':'arch','virtualization':'kvm','uid':1000,'home':'/home/tilde-check'}
        validate_setup_scope(scope,observed)
        for patch in ({'euid':1000},{'uuid':'wrong'},{'virtualization':'none'},{'home':'/home/owner'},{'os':'debian'}):
            with self.assertRaises(ValueError):validate_setup_scope(scope,{**observed,**patch})
        for patch in ({'ownerApproved':False},{'device':'/dev/vda'},{'mount':'/'},{'expiresAt':0},{'hashes':{}}):
            with self.assertRaises(ValueError):validate_setup_scope({**scope,**patch},observed)

import os
from pathlib import Path
import tempfile
from unittest.mock import patch
from guest_setup import ensure_directory
class SetupDurabilityTest(unittest.TestCase):
    def test_newSetupDirectoriesPersistEveryNewAncestor(self):
        with tempfile.TemporaryDirectory() as home:
            directory=Path(home)/'new-parent'/'mountpoint'
            synced=[];actual=os.fsync
            def sync(fd):
                synced.append(os.readlink('/proc/self/fd/'+str(fd)));actual(fd)
            with patch('guest_setup.os.fsync',side_effect=sync):ensure_directory(directory,0o700)
            self.assertEqual(directory.stat().st_mode&0o777,0o700)
            for path in (directory,directory.parent,Path(home)):
                self.assertIn(str(path),synced,'New directory entry missing a durability barrier')
