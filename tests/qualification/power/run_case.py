"""Guarded concrete runner. No action is taken without an exact private grant."""
import argparse
import json
import os
from pathlib import Path
import selectors
import subprocess
import time
from host_controller import HostController, Oracle, digest, SCENARIOS
from host_transport import read_grant, QmpSshTransport

def held_ack(child, destination, timeout=60):
    selector=selectors.DefaultSelector();selector.register(child.stdout,selectors.EVENT_READ,'stdout');selector.register(child.stderr,selectors.EVENT_READ,'stderr')
    streams={'stdout':bytearray(),'stderr':bytearray()};deadline=time.monotonic()+timeout
    try:
        while time.monotonic()<deadline:
            for key,_ in selector.select(min(1,max(0,deadline-time.monotonic()))):
                data=os.read(key.fileobj.fileno(),4096)
                if not data:selector.unregister(key.fileobj);continue
                streams[key.data].extend(data)
                if len(streams['stdout'])>65536 or len(streams['stderr'])>16384:raise ValueError('Held acknowledgement framing limit')
                if b'\n' in streams['stdout']:
                    line,extra=streams['stdout'].split(b'\n',1)
                    if extra.strip():raise ValueError('More than one acknowledgement')
                    if child.poll() is not None:raise ValueError('Worker did not remain held')
                    return json.loads(line)
            if child.poll() is not None:raise ValueError('Held worker exited early')
        raise TimeoutError('Held acknowledgement deadline')
    finally:
        selector.close()
        Path(destination).write_bytes(bytes(streams['stdout']));os.chmod(destination,0o600)
        Path(str(destination)+'.stderr').write_bytes(bytes(streams['stderr']));os.chmod(str(destination)+'.stderr',0o600)

def readiness(transport):
    deadline=time.monotonic()+90
    while True:
        try:return transport.guest('preflight',timeout=10)
        except (RuntimeError,TimeoutError,subprocess.TimeoutExpired):
            if time.monotonic()>=deadline:raise
            time.sleep(.25)

def execute(grant_file, scenario, evidence):
    grant=read_grant(grant_file);evidence=Path(evidence)
    if str(evidence.resolve())!=grant.get('evidence') or scenario not in grant['scenarios']:raise ValueError('Evidence/scenario scope mismatch')
    case=evidence/scenario;case.mkdir(mode=0o700)
    oracle=Path(grant['oracle']);transport=QmpSshTransport(grant,oracle);controller=HostController(grant,transport,oracle)
    child=None
    try:
        try:controller.identity()
        except (FileNotFoundError,ConnectionRefusedError):transport.boot()
        preflight=readiness(transport)
        if preflight.get('hashes')!=grant.get('helperHashes'):raise ValueError('Approved guest helper code differs')
        if preflight['devicePID'] or preflight['backendPID'] or preflight['mountSource']:raise ValueError('Guest fixture is already active')
        controls=scenario.endswith('control')
        if controls:
            if preflight['stage']!='raw':raise ValueError('Independent controls need unformatted image')
            child=transport.start_hold('calibration-write' if scenario=='negative-control' else 'calibration-fua')
        else:
            with Oracle(oracle) as records:
                passed={r.get('scenario') for r in records.records if r['event']=='calibration-verified'}
                if not {'negative-control','positive-control'}<=passed:raise ValueError('Qualify both controls before application setup')
            if preflight['stage']=='raw':transport.guest('make-baseline',timeout=120)
            transport.guest('restore-baseline');transport.guest('snapshot-recovery',timeout=120);transport.guest('attach')
            child=transport.start_worker('prepare',scenario)
        ack=held_ack(child,case/'held-ack.raw')
        controller.cut_after_ack(ack,scenario)
        # This path is after the cut and proves the guest is stopped before
        # snapshotting; no flush/shutdown/guest detach occurs in the cut path.
        tail,error=child.communicate(timeout=15)
        (case/'held-tail.raw').write_bytes(tail);(case/'held-tail.stderr').write_bytes(error)
        transport.copy_stopped_overlay(case/'crashed-os.qcow2')
        transport.boot();readiness(transport)
        snapshot=transport.guest('snapshot-recovery',timeout=120)
        trace=transport.guest('read-trace')
        (case/'snapshot.json').write_text(json.dumps(snapshot,indent=2)+'\n');(case/'backend-trace.json').write_text(json.dumps(trace,indent=2)+'\n')
        if controls:
            recovered=transport.guest('calibration-read')
            if recovered.get('runId')!=ack['bootId']:raise ValueError('Wrong control boot recovery')
            controller.verify_calibration(scenario,ack,recovered,trace['events'])
            result={'scenario':scenario,'verdict':'pass','calibratedVolatileCache':True,'recovered':recovered}
        else:
            # Verify the exact previously acknowledged backend trace before any
            # application recovery, rather than trusting a post-cut worker claim.
            events=[e for e in trace['events'] if e.get('instance')==ack['backendInstance']]
            if not events or events[0].get('bootId')!=ack['bootId'] or [e.get('seq') for e in events]!=list(range(1,len(events)+1)) or any(e.get('op')=='error' for e in events) or not any(e.get('seq')==ack['backendSeq'] for e in events) or not any(e.get('op')=='flush-complete' for e in events):raise ValueError('Product backend trace unqualified')
            transport.guest('attach');child=transport.start_worker('recover',scenario)
            output,error=child.communicate((json.dumps(ack)+'\n').encode(),timeout=90)
            (case/'recovery.raw').write_bytes(output);(case/'recovery.stderr').write_bytes(error)
            if child.returncode or len(output)>65536:raise ValueError('Product recovery failed')
            result=json.loads(output)
            if result.get('verdict')!='pass' or result.get('scenario')!=scenario or result.get('noRedispatch') is not True or result.get('originalIdentities') is not True or result.get('providerCalls')!=0:raise ValueError('Incomplete product recovery')
            transport.guest('detach')
        current=readiness(transport)
        if current['devicePID'] or current['backendPID'] or current['mountSource']:raise ValueError('Guest fixture cleanup incomplete')
        result.update(cleanup=True,physicalPowerLoss=False,scope='calibrated flush-aware guest RAM cache only',snapshot=snapshot,target=grant['target'])
        (case/'result.json').write_text(json.dumps(result,indent=2)+'\n')
        with Oracle(oracle) as records:records.append({'event':'case-verified','scope':digest(grant),'scenario':scenario,'resultSha256':digest(result)})
        with Oracle(oracle) as records:
            verified={r['scenario']:r['resultSha256'] for r in records.records if r['event']=='case-verified' and r.get('scope')==digest(grant)}
        for name,checksum in verified.items():
            retained=json.loads((evidence/name/'result.json').read_text())
            if digest(retained)!=checksum:raise ValueError('Retained case result differs from external oracle')
        return {'result':result,'verifiedCases':list(verified),'sourceSha256':grant.get('sourceSha256'),'scopeSha256':digest(grant)}
    except Exception as error:
        (case/'failure.json').write_text(json.dumps({'scenario':scenario,'verdict':'fail-or-blocked','error':str(error),'cleanup':False,'noUnacknowledgedCut':True},indent=2)+'\n')
        raise
    finally:
        # Reap only this SSH channel. A failed setup never authorizes another cut,
        # guest shutdown, broad service stop, or formatting operation.
        if child and child.poll() is None:
            child.terminate()
            try:child.wait(timeout=3)
            except subprocess.TimeoutExpired:child.kill();child.wait(timeout=3)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--grant',required=True);parser.add_argument('--case',choices=SCENARIOS,required=True);parser.add_argument('--evidence',required=True);args=parser.parse_args()
    print(json.dumps(execute(args.grant,args.case,args.evidence)))
