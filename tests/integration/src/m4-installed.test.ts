import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('M4 installed daemon GUI helper and activation admit no work with checkout hidden', () => {
  const child = spawnSync(process.execPath, ['tests/release/installed-smoke.mjs'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(child.status, 0, child.stderr);
  const proof = JSON.parse(child.stdout.trim().split('\n').at(-1)!);
  assert.equal(proof.originalCheckoutHidden, true); assert.equal(proof.cleanup, true); assert.equal(proof.newProviderRequests, 0);
});
