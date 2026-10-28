import { spawnSync } from 'node:child_process';
import { access, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export class RuntimeError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function supportedVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return false;
  const [major, minor] = version.split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 19);
}
export function childEnvironment(nodeExecutable, extra = {}) {
  const keys = ['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS', 'DISPLAY', 'WAYLAND_DISPLAY', 'QT_PLUGIN_PATH', 'QML_IMPORT_PATH', 'QT_QPA_PLATFORMTHEME', 'QT_STYLE_OVERRIDE', 'XDG_CURRENT_DESKTOP', 'XDG_SESSION_DESKTOP', 'XDG_SESSION_TYPE', 'TILDE_CMAKE'];
  const env = Object.fromEntries(keys.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]]));
  return { ...env, PATH: `${dirname(nodeExecutable)}:${env.PATH ?? '/usr/bin:/bin'}`, TILDE_NODE: nodeExecutable, ...extra };
}
const probeSource = `
const out={version:process.versions.node,napiVersion:Number(process.versions.napi),uvVersion:process.versions.uv,capabilities:{sqlite:false,chordLoader:false,nativeTransport:false,nativeFilesystem:false}};
try { const {DatabaseSync}=await import('node:sqlite'); const db=new DatabaseSync(':memory:'); db.exec('CREATE TABLE probe (v INTEGER); INSERT INTO probe VALUES(7)'); out.capabilities.sqlite=db.prepare('SELECT v FROM probe').get().v===7; db.close(); } catch {}
try { const {nodeLoader}=await import('@earendil-works/chord/node'); await nodeLoader([]); out.capabilities.chordLoader=true; } catch {}
console.log(JSON.stringify(out));`;
function runProbe(executable, root, source = probeSource) {
  const child = spawnSync(executable, ['--input-type=module', '-e', source], { cwd: root, env: childEnvironment(executable), encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
  if (child.error || child.status !== 0) throw new RuntimeError('NODE_PROBE_FAILED');
  try { return JSON.parse(child.stdout); } catch { throw new RuntimeError('NODE_PROBE_INVALID'); }
}
async function headerVersion(path, prefix) {
  const text = await readFile(path, 'utf8');
  return ['MAJOR', 'MINOR', 'PATCH'].map(k => {
    const value = text.match(new RegExp(`^#define\\s+${prefix}_${k}${prefix === 'NODE' ? '_VERSION' : ''}\\s+(\\d+)\\s*$`, 'm'))?.[1];
    if (value === undefined) throw new RuntimeError('NODE_HEADERS_INVALID');
    return value;
  }).join('.');
}
async function discover(candidates, names, expected, prefix) {
  for (const directory of [...new Set(candidates.filter(Boolean))]) {
    try {
      const canonical = await realpath(directory);
      for (const name of names) await access(join(canonical, name));
      const version = await headerVersion(join(canonical, names.at(-1)), prefix);
      if (version === expected) return { directory: canonical, version };
    } catch {}
  }
  throw new RuntimeError(prefix === 'NODE' ? 'NODE_HEADERS_MISMATCH' : 'UV_HEADERS_MISMATCH');
}
export async function inspectRuntime(nodeExecutable = process.env.TILDE_NODE ?? process.execPath, includeDirectory = process.env.TILDE_NODE_INCLUDE_DIR, uvDirectory = process.env.TILDE_UV_INCLUDE_DIR, root = process.cwd()) {
  if (!isAbsolute(nodeExecutable) || [includeDirectory, uvDirectory].some(p => p !== undefined && !isAbsolute(p))) throw new RuntimeError('NODE_PATH_NOT_ABSOLUTE');
  let executable;
  try { executable = await realpath(nodeExecutable); } catch { throw new RuntimeError('NODE_EXECUTABLE_MISSING'); }
  const probe = runProbe(executable, root);
  if (!supportedVersion(probe.version)) throw new RuntimeError('NODE_UNSUPPORTED');
  if (probe.napiVersion < 8 || !probe.capabilities?.sqlite || !probe.capabilities?.chordLoader) throw new RuntimeError('NODE_CAPABILITY_MISSING');
  const adjacent = resolve(dirname(executable), '../include/node');
  const node = await discover(includeDirectory ? [includeDirectory] : [adjacent, '/usr/local/include/node', '/usr/include/node'], ['node_api.h', 'node_version.h'], probe.version, 'NODE');
  let uv;
  for (const name of ['uv/version.h', 'uv_version.h']) {
    try { uv = await discover(uvDirectory ? [uvDirectory] : [node.directory, '/usr/local/include', '/usr/include'], ['uv.h', name], probe.uvVersion, 'UV_VERSION'); break; } catch {}
  }
  if (!uv) throw new RuntimeError('UV_HEADERS_MISMATCH');
  return { executable, version: probe.version, napiVersion: probe.napiVersion, uvVersion: probe.uvVersion,
    headers: { nodeIncludeDir: node.directory, uvIncludeDir: uv.directory, nodeVersion: node.version, uvVersion: uv.version },
    capabilities: { sqlite: true, chordLoader: true, nativeTransport: false, nativeFilesystem: false } };
}
export async function probeCapabilities(executable, root, { native = false } = {}) {
  return runProbe(executable, root, probeSource.replace('console.log(JSON.stringify(out));', native ? `
try { const {createRequire}=await import('node:module'); const require=createRequire(process.cwd()+'/package.json'); const transport=require('./packages/transport/.build/tilde_peer.node'); out.capabilities.nativeTransport=typeof transport.listen==='function'; const fs=require('./packages/tools/.build/tilde_scoped_fs.node'); out.capabilities.nativeFilesystem=Number.isFinite(fs.monotonicNowMs()); } catch {}
console.log(JSON.stringify(out));` : 'console.log(JSON.stringify(out));')).capabilities;
}
export const nativeConfigureArgs = info => ['-S', '.', '-B', '.build/cmake', '-DTILDE_BUILD_GUI=ON', '-DBUILD_TESTING=ON', `-DTILDE_NODE_EXECUTABLE=${info.executable}`, `-DNODE_INCLUDE_DIR=${info.headers.nodeIncludeDir}`, `-DUV_INCLUDE_DIR=${info.headers.uvIncludeDir}`];
