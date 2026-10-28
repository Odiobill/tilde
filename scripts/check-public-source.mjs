import { readdir, readFile, lstat, realpath, readlink } from 'node:fs/promises';
import { resolve, relative, join, dirname, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { within, ownedPath, noSymlinkParents } from './release/files.mjs';
export const privateNames = new Set(['.git', '.superpowers', '.aws', '.codex', '.agents', '.env', '.build', 'node_modules', 'dist', '__pycache__', 'experiments']);
export function deniedPublicPath(path) { return path.split('/').some(part => privateNames.has(part) || part.endsWith('.tsbuildinfo')) || path.startsWith('docs/superpowers/'); }
export function publicTextProblems(path, text) {
  const problems = [];
  const secrets = [/TILDE_EXPORT_SECRET_CANARY_[A-Z0-9]{16,}/, /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/, /\bAKIA[0-9A-Z]{16}\b/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
  if (secrets.some(pattern => pattern.test(text))) problems.push({ path, reason: 'secret-pattern' });
  if (homedir() !== '/' && text.includes(homedir() + '/')) problems.push({ path, reason: 'host-path' });
  return problems;
}
export async function checkPublicSource(tree) {
  tree = resolve(tree); const problems = [], files = [];
  async function walk(prefix = '') {
    for (const entry of await readdir(join(tree, prefix), { withFileTypes: true })) {
      const path = join(prefix, entry.name);
      if (deniedPublicPath(path)) { problems.push({ path, reason: 'excluded-path' }); continue; }
      if (entry.isDirectory()) await walk(path);
      else if (entry.isSymbolicLink()) {
        try { if (!within(tree, await realpath(join(tree, path))) || isAbsolute(await readlink(join(tree, path)))) problems.push({ path, reason: 'escaping-link' }); }
        catch { problems.push({ path, reason: 'broken-link' }); }
        files.push(path);
      } else if (entry.isFile()) files.push(path);
      else problems.push({ path, reason: 'special-file' });
    }
  }
  await walk();
  try {
    const path = join(tree, 'packaging/release/public-files.json');
    await noSymlinkParents(tree, path);
    if (!(await lstat(path)).isFile()) throw new Error('unsafe');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    if (manifest.version !== 1 || !Array.isArray(manifest.files) || new Set(manifest.files).size !== manifest.files.length) throw new Error('invalid');
    for (const path of manifest.files) ownedPath(path);
    const expected = new Set(manifest.files), actual = new Set(files);
    for (const path of files) if (!expected.has(path)) problems.push({ path, reason: 'unlisted-file' });
    for (const path of expected) if (!actual.has(path)) problems.push({ path, reason: 'missing-file' });
  } catch { problems.push({ path: 'packaging/release/public-files.json', reason: 'invalid-public-manifest' }); }
  for (const path of files) {
    const stat = await lstat(join(tree, path)); if (!stat.isFile()) continue;
    const text = await readFile(join(tree, path), 'utf8'); problems.push(...publicTextProblems(path, text));
    if (!/\.(?:md|html|css)$/.test(path)) continue;
    const links = path.endsWith('.md') ? [...text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]) : [...text.matchAll(/(?:href|src)=["']([^"']+)["']/g)].map(m => m[1]);
    for (let target of links) {
      if (/^(?:https?:|mailto:|#)/.test(target)) continue;
      // Site templates refer to generated guide routes; validate their source,
      // rather than treating a template marker as a literal filesystem path.
      if (['docs/site/index.html','docs/site/guide.html'].includes(path)) {
        if (['{{SOURCE}}','{{CANONICAL}}'].includes(target)) continue;
        if (target.startsWith('{{BASE}}')) {
          const route=target.slice(8).split('#')[0];let source;
          if (/^guide\/(?:development\/m4-)?[a-z0-9][a-z0-9.-]*\.html$/.test(route)) source=route.startsWith('guide/development/')?'docs/'+route.slice(6,-5)+'.md':'docs/public/'+route.slice(6,-5)+'.md';
          else if (/^(?:index\.html|style\.css|assets\/[A-Za-z0-9._-]+)$/.test(route)) source='docs/site/'+route;
          else { problems.push({path,reason:'invalid-template-link'});continue; }
          target=relative(join(tree,dirname(path)),join(tree,source));
        }
      }
      target = target.split('#')[0];
      if (!target) continue;
      if (/\.superpowers|docs\/superpowers|experiments\//.test(target)) { problems.push({ path, reason: 'private-link' }); continue; }
      let full; try { full = resolve(tree, dirname(path), decodeURIComponent(target)); }
      catch { problems.push({ path, reason: 'invalid-document-link' }); continue; }
      if (!within(tree, full)) { problems.push({ path, reason: 'escaping-document-link' }); continue; }
      try { await lstat(full); } catch { problems.push({ path, reason: 'missing-document-link', target }); }
    }
  }
  return { clean: problems.length === 0, files, problems };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { tree: { type: 'string' } } }); if (!values.tree) throw new Error('PUBLIC_TREE_REQUIRED');
  const report = await checkPublicSource(values.tree); console.log(JSON.stringify(report, null, 2)); if (!report.clean) process.exitCode = 1;
}
