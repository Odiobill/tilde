import { readFile, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256, ownedPath, within, noSymlinkParents } from './files.mjs';
export async function collectLicenses({ root, productionLock }) {
  const lock = productionLock ?? JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  const components = [], unresolved = [];
  let overrides = {};
  try { overrides = JSON.parse(await readFile(join(root, 'packaging/licenses/overrides.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path.startsWith('node_modules/') || entry.dev || entry.link) continue;
    ownedPath(path);
    const pkg = JSON.parse(await readFile(join(root, path, 'package.json'), 'utf8'));
    const names = (await readdir(join(root, path))).filter(name => /^(?:licen[cs]e|copying|notice)(?:[._-]|$)/i.test(name)).sort();
    let text = '', source = entry.resolved ?? pkg.repository?.url ?? pkg.repository ?? 'unknown';
    for (const name of names) {
      const full = join(root, path, name);
      if (!within(join(root, 'node_modules'), await realpath(full))) throw new Error('LICENSE_UNSAFE_LINK');
      text += await readFile(full, 'utf8') + '\n';
    }
    const override = overrides[`${pkg.name}@${pkg.version}`];
    if (!text && override) {
      ownedPath(override.path); await noSymlinkParents(root, join(root, override.path));
      if (!within(root, await realpath(join(root, override.path)))) throw new Error('LICENSE_UNSAFE_LINK');
      text = await readFile(join(root, override.path), 'utf8');
      if (sha256(Buffer.from(text)) !== override.sha256) throw new Error('LICENSE_OVERRIDE_DIGEST_MISMATCH');
      source = override.source;
    }
    if (!text || typeof pkg.license !== 'string') { unresolved.push({ name: pkg.name, version: pkg.version, reason: !text ? 'missing-license-text' : 'missing-license-identifier', shippedPaths: [path] }); continue; }
    components.push({ name: pkg.name, version: pkg.version, source, license: pkg.license, textSha256: sha256(Buffer.from(text)), shippedPaths: [path], linkage: 'js' });
  }
  let extra = [];
  try { extra = JSON.parse(await readFile(join(root, 'packaging/licenses/components.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const component of extra) {
    const { textPath, auditPending, ...record } = component;
    if (auditPending) { unresolved.push({ name: record.name, version: record.version, reason: auditPending }); continue; }
    ownedPath(textPath);
    try { record.textSha256 = sha256(await readFile(join(root, textPath))); components.push(record); }
    catch (error) { if (error.code !== 'ENOENT') throw error; unresolved.push({ name: record.name, version: record.version, reason: 'missing-license-text' }); }
  }
  return { version: 1, components, unresolved };
}
