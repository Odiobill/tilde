import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desktopCase, sessionMatches, parseDesktopFacts } from '../../scripts/qualify-desktops.mjs';
const observed = { id: '3', uid: process.geteuid(), remote: false, type: 'wayland', desktop: 'KDE' };
const facts = { backend: 'wayland', qtVersion: '6.12.0', activationAck: true, exposed: true, focused: true, draftPreserved: true, geometryPreserved: true };
const outcomes = { window: 0, tray: 0, trayHost: 0, notifications: 0, cleanup: true };
test('xcbInWaylandIsNotIndependentX11', () => {
  assert.equal(sessionMatches('plasma-x11', observed, 'xcb'), false);
  assert.notEqual(desktopCase('plasma-x11', observed, { ...facts, backend: 'xcb' }, outcomes).status, 'pass');
  assert.equal(sessionMatches('plasma-x11', { ...observed, type: 'x11' }, 'xcb'), true);
});
test('missingSessionCannotPass', () => {
  assert.equal(desktopCase('plasma-wayland', null, facts, outcomes).status, 'unavailable');
  assert.notEqual(desktopCase('plasma-wayland', observed, null, outcomes).status, 'pass');
});
test('focusFailureRemainsFailed', () => {
  const row = desktopCase('plasma-wayland', observed, { ...facts, focused: false }, { ...outcomes, window: 1 });
  assert.equal(row.status, 'fail'); assert.equal(row.details.activationAck, true); assert.equal(row.details.focused, false);
  assert.equal(desktopCase('plasma-wayland', observed, facts, { ...outcomes, cleanup: false }).status, 'fail');
});
test('activationAckAloneCannotProveFocusOrExposure', () => {
  const parsed = parseDesktopFacts('QINFO : M4_FACT {"backend":"wayland","qtVersion":"6.12.0"}\nQINFO : M4_FACT {"activationAck":true}\n');
  assert.notEqual(desktopCase('plasma-wayland', observed, parsed, outcomes).status, 'pass');
});

import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {qualifyDesktop} from '../../scripts/qualify-desktops.mjs';
async function boundedDesktopFixture(t,exhaust){
 const home=await mkdtemp('/tmp/tilde-desktop-bound-');t.after(()=>rm(home,{recursive:true,force:true}));
 const socket=join(home,'display');const server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socket,resolve);});t.after(()=>new Promise(resolve=>server.close(resolve)));
 const previous=process.env.WAYLAND_DISPLAY;process.env.WAYLAND_DISPLAY=socket;t.after(()=>{if(previous===undefined)delete process.env.WAYLAND_DISPLAY;else process.env.WAYLAND_DISPLAY=previous;});
 const privateDir=join(home,'approval');await mkdir(privateDir,{mode:0o700});const evidence=join(home,'evidence'),approvalFile=join(privateDir,'grant.json');
 const expiry=Date.now()+60000;await writeFile(approvalFile,JSON.stringify({version:1,ownerApproved:true,session:'plasma-wayland',sessionId:'synthetic',evidence,expiresAt:new Date(expiry).toISOString(),maxDurationMs:50,allowCompositorChanges:false}),{mode:0o600});
 let monotonic=0,wall=Date.now();const launches=[];
 const options={session:'plasma-wayland',evidence,approvalFile,root:home,observation:()=>({...observed,id:'synthetic'}),monotonicNow:()=>monotonic,wallNow:()=>wall,commandRunner:async options=>{
  launches.push(options.name);await writeFile(join(evidence,options.name+'.log'),'M4_FACT '+JSON.stringify(facts)+'\n');
  if(exhaust==='duration')monotonic=51;else wall=expiry+1;
  return {exitCode:0,timedOut:false};
 }};
 return {options,launches,expiry};
}
test('desktopDurationExhaustionNeverStartsAnotherFixture',async t=>{
 const f=await boundedDesktopFixture(t,'duration');await assert.rejects(qualifyDesktop(f.options),/DESKTOP_APPROVAL_EXHAUSTED/);assert.deepEqual(f.launches,['window']);
});
test('desktopGrantExpiryNeverStartsAnotherFixture',async t=>{
 const f=await boundedDesktopFixture(t,'expiry');await assert.rejects(qualifyDesktop(f.options),/DESKTOP_APPROVAL_EXHAUSTED/);assert.deepEqual(f.launches,['window']);
});

test('desktopExpiryBoundsTheFirstFixtureTimeout',async t=>{
 const f=await boundedDesktopFixture(t,'unused');let timeout;
 f.options.wallNow=()=>f.expiry-10;
 f.options.commandRunner=async options=>{timeout=options.timeout;return {exitCode:0,timedOut:true};};
 await assert.rejects(qualifyDesktop(f.options),/DESKTOP_APPROVAL_EXHAUSTED/);assert.ok(timeout>0&&timeout<=10);
});
