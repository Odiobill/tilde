import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, cp, symlink, rm, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { childEnvironment } from '../../scripts/release/runtime.mjs';
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'tilde-export-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const root = join(dir, 'input'); await mkdir(join(root, 'packaging/release'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"version":"0.1.1"}'); await writeFile(join(root, 'README.md'), '# Public\n');
  await writeFile(join(root, 'packaging/release/public-files.json'), JSON.stringify({ version: 1, files: ['README.md', 'package.json', 'packaging/release/public-files.json'] }));
  return { dir, root };
}
test('exportExcludesEvidenceCredentialsAndBuilds', async t => {
  const f = await fixture(t), { exportSource } = await import('../../scripts/export-source.mjs');
  for (const path of ['.superpowers', '.aws', '.codex', '.build', 'node_modules']) { await mkdir(join(f.root, path)); await writeFile(join(f.root, path, 'private'), 'synthetic private data'); }
  const result = await exportSource({ root: f.root, output: join(f.dir, 'out'), version: '0.1.1' });
  assert.deepEqual((await readdir(result.tree)).sort(), ['README.md', 'package.json', 'packaging']);
  assert.equal((await readFile(join(f.root, '.aws/private'), 'utf8')), 'synthetic private data');
  const again = await exportSource({ root: f.root, output: join(f.dir, 'again'), version: '0.1.1' }); assert.equal(result.sha256, again.sha256);
});
test('unlistedSourceFileCannotPass', async t => {
  const f = await fixture(t), { checkPublicSource } = await import('../../scripts/check-public-source.mjs');
  await writeFile(join(f.root, 'snapshot.log'), 'synthetic local evidence');
  const report = await checkPublicSource(f.root);
  assert.equal(report.clean, false); assert.ok(report.problems.some(p => p.reason === 'unlisted-file'));
});
test('exportRejectsEscapingLinksAndSecretCanaries', async t => {
  const f = await fixture(t), { exportSource } = await import('../../scripts/export-source.mjs');
  await rm(join(f.root, 'README.md')); await writeFile(join(f.dir, 'outside'), 'outside'); await symlink('../outside', join(f.root, 'README.md'));
  await assert.rejects(exportSource({ root: f.root, output: join(f.dir, 'link'), version: '0.1.1' }));
  await rm(join(f.root, 'README.md')); await writeFile(join(f.root, 'README.md'), ['TILDE', 'EXPORT', 'SECRET', 'CANARY', 'ABCDEF0123456789'].join('_'));
  await assert.rejects(exportSource({ root: f.root, output: join(f.dir, 'secret'), version: '0.1.1' }), /PUBLIC_SOURCE_REJECTED/);
});
test('publicDocsHaveNoPrivateLinks', async t => {
  const f = await fixture(t), { checkPublicSource } = await import('../../scripts/check-public-source.mjs');
  await writeFile(join(f.root, 'README.md'), '[private](.superpowers/evidence.md)\n');
  const report = await checkPublicSource(f.root); assert.equal(report.clean, false); assert.ok(report.problems.some(p => p.reason === 'private-link'));
});
test('exportedProtocolTestsKeepHistoricalChecks', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'tilde-public-protocol-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await cp('packages/protocol', join(dir, 'packages/protocol'), { recursive: true });
  await symlink(resolve('node_modules'), join(dir, 'node_modules'));
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  const args = ['--test', '--test-name-pattern', 'historicalSchemasAndFixturesUnchanged', join(dir, 'packages/protocol/dist/v4.test.js')];
  const result = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', env: childEnvironment(process.execPath) });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  await assert.rejects(lstat(join(dir, '.superpowers')));
  await writeFile(join(dir, 'packages/protocol/fixtures/wire-v1.json'), '[]');
  const corrupt = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8', env: childEnvironment(process.execPath) }); assert.equal(corrupt.status, 1);
});
