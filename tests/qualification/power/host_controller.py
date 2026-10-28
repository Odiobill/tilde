"""External fsynced oracle and guards for one explicitly approved disposable VM.
All data-file IO here is to owned regular files. No host block device is opened.
Transport mutations are fixed verbs; the cut path has no flush/guest command.
"""
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import time

SCENARIOS = ('negative-control', 'positive-control', 'fresh-state', 'committed-state',
             'pending-approval', 'effect-before-journal', 'budget-pause', 'owned-job', 'catalog-ui')
UUID = re.compile(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}')
IDENTITY = ('uri', 'name', 'uuid', 'disk', 'diskDevice', 'diskInode')
LIVE_IDENTITY = IDENTITY + ('pid', 'startTicks', 'hostBootId', 'state')

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)

def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()

def validate_grant(grant):
    if (not isinstance(grant, dict) or grant.get('version') != 1
            or grant.get('ownerApproved') is not True or not isinstance(grant.get('ownerStatement'),str) or not grant['ownerStatement']
            or not re.fullmatch(r'[a-f0-9]{64}', str(grant.get('sourceSha256','')))
            or grant.get('allowHostDevices') is not False
            or not isinstance(grant.get('expiresAt'), (int, float))
            or not math.isfinite(grant['expiresAt']) or grant['expiresAt'] <= time.time()
            or type(grant.get('maxCuts')) is not int or not 1 <= grant['maxCuts'] <= 32
            or not isinstance(grant.get('scenarios'), list) or not grant['scenarios']
            or len(set(grant['scenarios'])) != len(grant['scenarios'])
            or any(s not in SCENARIOS for s in grant['scenarios'])):
        raise ValueError('Explicit bounded owner power scope required')
    target = grant.get('target', {})
    if (set(target) != set(IDENTITY) or not UUID.fullmatch(str(target.get('uuid', '')))
            or not str(target.get('uri', '')).startswith('qmp+unix:///')
            or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', str(target.get('name', '')))
            or not Path(str(target.get('disk', ''))).is_absolute()
            or str(target['disk']).startswith('/dev/')
            or any(type(target.get(k)) is not int or target[k] < 1 for k in ('diskDevice', 'diskInode'))):
        raise ValueError('Exact owned VM/socket/disk identity required')
    return target

class Oracle:
    def __init__(self, path):
        self.path = Path(path)
    def __enter__(self):
        # Parent is created by the owner/controller preparation, never by a cut.
        anchor = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
        try:
            for part in self.path.parent.parts[1:]:
                if part in ('.', '..'): raise ValueError('Unsafe oracle path')
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=anchor)
                os.close(anchor); anchor = child
            parent = os.fstat(anchor)
            if parent.st_uid != os.getuid() or stat.S_IMODE(parent.st_mode) != 0o700:
                raise ValueError('Oracle parent must be private and owned')
            self.fd = os.open(self.path.name, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600, dir_fd=anchor)
            info = os.fstat(self.fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > 8*1024*1024:
                os.close(self.fd); raise ValueError('Unsafe oracle file')
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            raw = os.pread(self.fd, info.st_size, 0)
            if raw and not raw.endswith(b'\n'): raise ValueError('Incomplete oracle record')
            self.records = [json.loads(line) for line in raw.splitlines()]
            previous = '0'*64
            for i, record in enumerate(self.records):
                value = {k:v for k,v in record.items() if k != 'sha256'}
                if record.get('seq') != i+1 or record.get('previous') != previous or record.get('sha256') != digest(value):
                    raise ValueError('Oracle integrity failure')
                previous = record['sha256']
            os.fsync(anchor)
            return self
        except Exception:
            if hasattr(self, 'fd'):
                try: os.close(self.fd)
                except OSError: pass
            raise
        finally:
            os.close(anchor)
    def append(self, value):
        record = {**value, 'seq':len(self.records)+1, 'previous':self.records[-1]['sha256'] if self.records else '0'*64}
        record['sha256'] = digest(record)
        data = (canonical(record)+'\n').encode()
        if os.fstat(self.fd).st_size + len(data) > 8*1024*1024: raise ValueError('Oracle limit')
        os.lseek(self.fd, 0, os.SEEK_END)
        while data:
            count = os.write(self.fd, data)
            if count <= 0: raise OSError('Short oracle write')
            data = data[count:]
        os.fsync(self.fd); self.records.append(record)
    def __exit__(self, *args):
        os.close(self.fd)

class HostController:
    def __init__(self, grant, transport, oracle):
        self.grant, self.transport, self.oracle = grant, transport, Path(oracle)
    def identity(self, expected_state='running'):
        target = validate_grant(self.grant)
        observed = self.transport.observe()
        if any(observed.get(k) != target[k] for k in IDENTITY) or observed.get('state') != expected_state:
            raise ValueError('Wrong/inactive guest or disk identity')
        if expected_state == 'running' and (type(observed.get('pid')) is not int or observed['pid'] < 2 or not str(observed.get('startTicks', '')).isdigit() or not UUID.fullmatch(str(observed.get('hostBootId', '')))):
            raise ValueError('Missing current process/boot identity')
        return observed
    def validate_ack(self, ack, scenario):
        if (scenario not in self.grant['scenarios'] or not isinstance(ack, dict)
                or ack.get('version') != 1 or ack.get('phase') != 'held'
                or ack.get('scenario') != scenario or ack.get('targetUUID') != self.grant['target']['uuid']
                or not UUID.fullmatch(str(ack.get('bootId', '')))
                or not UUID.fullmatch(str(ack.get('backendInstance', '')))
                or type(ack.get('backendSeq')) is not int or ack['backendSeq'] < 1
                or not isinstance(ack.get('expected'), dict)
                or ack.get('kind') != ('calibration' if scenario.endswith('control') else 'application')):
            raise ValueError('Wrong/incomplete held acknowledgement')
    def cut_after_ack(self, ack, scenario):
        # Refusal happens before oracle or guest mutation; repeat identity after
        # external fsync and let transport revalidate PID/start before SIGKILL.
        before = self.identity(); self.validate_ack(ack, scenario)
        if ack['kind']=='application':
            pragmas=ack['expected'].get('pragmas')
            if not isinstance(pragmas,list) or {p.get('store') for p in pragmas} != {'pi','operations'} or any(p.get('activeConnection') is not True or p.get('journalMode')!='wal' or p.get('synchronous')!=2 or p.get('integrity')!='ok' for p in pragmas):
                raise ValueError('Actual product SQLite connection policy/integrity missing')
        scope = digest(self.grant)
        with Oracle(self.oracle) as oracle:
            if any(r.get('scope') != scope for r in oracle.records): raise ValueError('Oracle bound to another grant')
            cuts = [r for r in oracle.records if r['event'] == 'cut-authorized']
            token = digest({k:ack[k] for k in ('bootId', 'backendInstance', 'backendSeq', 'scenario')})
            if len(cuts) >= self.grant['maxCuts'] or any(r.get('token') == token for r in cuts):
                raise ValueError('Cut limit or acknowledgement replay')
            if not scenario.endswith('control'):
                controls = {r.get('scenario') for r in oracle.records if r['event'] == 'calibration-verified'}
                if not {'negative-control', 'positive-control'} <= controls:
                    raise ValueError('Independent positive and negative controls required')
            oracle.append({'event':'cut-authorized','scope':scope,'scenario':scenario,'ack':ack,'target':before,'token':token})
            after = self.identity()
            if any(after.get(k) != before.get(k) for k in LIVE_IDENTITY): raise ValueError('Identity changed across oracle fsync')
            self.transport.cut(after)
            oracle.append({'event':'cut-sent','scope':scope,'scenario':scenario,'token':token})
    def verify_calibration(self, scenario, acknowledged, recovered, trace):
        validate_grant(self.grant)
        if scenario not in ('negative-control','positive-control'): raise ValueError('Not a control')
        self.validate_ack(acknowledged, scenario)
        # Recovery is inspected before any filesystem mount/replay. Metadata log
        # sequence must contain the acknowledged boundary and no failed backend.
        events = [e for e in trace if e.get('instance') == acknowledged['backendInstance']]
        if (not events or [e.get('seq') for e in events] != list(range(1,len(events)+1))
                or events[0].get('op') != 'ready' or events[0].get('bootId') != acknowledged['bootId'] or any(e.get('op') == 'error' for e in events)
                or not any(e.get('seq') == acknowledged['backendSeq'] for e in events)
                or not any(e.get('op') == 'flush-complete' for e in events)):
            raise ValueError('Calibration trace incomplete or failed')
        if scenario == 'negative-control':
            writes = [e for e in events if e.get('op') == 'write-complete' and e.get('offset') == 4096]
            if not writes or any(str(e.get('op')).startswith('flush-') and e['seq'] > writes[-1]['seq'] for e in events):
                raise ValueError('Negative control was flushed')
            passed = recovered.get('durable') is True and recovered.get('volatile') is False and recovered.get('zeroVolatile') is True
        else:
            passed = recovered.get('fua') is True
        if not passed: raise ValueError('Calibration effect mismatch')
        with Oracle(self.oracle) as oracle:
            scope = digest(self.grant)
            token=digest({k:acknowledged[k] for k in ('bootId','backendInstance','backendSeq','scenario')})
            if any(r.get('scope')!=scope for r in oracle.records) or not any(r['event']=='cut-sent' and r.get('token')==token and r.get('scenario')==scenario for r in oracle.records): raise ValueError('Missing prior cut')
            oracle.append({'event':'calibration-verified','scope':scope,'scenario':scenario,'recovered':recovered,'traceSha256':digest(trace)})
