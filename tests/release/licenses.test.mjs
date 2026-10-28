import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('unresolvedLicenseBlocksRelease', async t => {
  const { collectLicenses } = await import('../../scripts/release/licenses.mjs');
  const root = await mkdtemp(join(tmpdir(), 'tilde-licenses-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'node_modules/fixture'), { recursive: true }); await writeFile(join(root, 'node_modules/fixture/package.json'), '{"name":"fixture","version":"1.0.0","license":"MIT"}');
  const lock = { packages: { 'node_modules/fixture': { version: '1.0.0', license: 'MIT', resolved: 'https://example.invalid/fixture.tgz' } } };
  const before = await collectLicenses({ root, productionLock: lock }); assert.ok(before.unresolved.some(x => x.name === 'fixture'));
  await writeFile(join(root, 'node_modules/fixture/LICENSE'), 'Synthetic fixture license text, not a legal license.');
  const after = await collectLicenses({ root, productionLock: lock }); assert.equal(after.unresolved.filter(x => x.name === 'fixture').length, 0); assert.equal(after.components.find(x => x.name === 'fixture').linkage, 'js');
});

import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
test('auditedShippedArtifactsHaveCompleteNoticeCoverage',async()=>{
 const root=resolve('.'),{collectLicenses}=await import('../../scripts/release/licenses.mjs');
 const inventory=await collectLicenses({root});assert.deepEqual(inventory.unresolved,[],'Every shipped dependency needs audited notice coverage');
 const provenance=JSON.parse(await readFile(join(root,'packaging/licenses/shipped-provenance.json'),'utf8'));
 assert.equal(provenance.version,1);assert.deepEqual(provenance.artifacts.map(a=>a.name).sort(),['@silvia-odwyer/photon','proxy-agent-negotiate','quickjs-wasi']);
 const lock=JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
 for(const artifact of provenance.artifacts){
  const entry=lock.packages['node_modules/'+artifact.name];assert.equal(artifact.version,entry.version);assert.equal(artifact.integrity,entry.integrity);
  for(const [path,fact]of Object.entries(artifact.files)){const bytes=await readFile(join(root,path));assert.equal(createHash('sha256').update(bytes).digest('hex'),fact.sha256);assert.equal(bytes.length,fact.bytes);}
  assert.ok(artifact.notices.length>0);
 }
 for(const notice of provenance.notices){assert.ok(notice.path.startsWith('packaging/licenses/'));assert.equal(createHash('sha256').update(await readFile(join(root,notice.path))).digest('hex'),notice.sha256);}
 assert.equal(provenance.photon.sourceCommit,'685f5b155b36c5611c08ca678bb78ddbab3edbac');assert.equal(provenance.photon.embeddedFont.exactByteMatch,true);assert.equal(provenance.photon.optionalWeeAllocActivated,false);
 assert.ok(provenance.quickjs.modules.includes('extensions/crypto/crypto.so'));assert.ok(provenance.quickjs.modules.includes('extensions/url/url.so'));assert.equal(provenance.quickjs.npmSlsaVerified,true);
});
