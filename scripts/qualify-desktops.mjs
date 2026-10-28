import { readFile, mkdir, lstat, open, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { tmpdir } from 'node:os';
import { childEnvironment } from './release/runtime.mjs';
import { runCommand } from './release/commands.mjs';
import { noSymlinkParents } from './release/files.mjs';
import { writeQualificationReport } from './release/report.mjs';
const sessions = ['hyprland-wayland', 'plasma-wayland', 'plasma-x11'];
export function sessionMatches(session, observed, backend) {
  if (!sessions.includes(session) || !observed || observed.uid !== process.geteuid() || observed.remote !== false || !observed.id) return false;
  const wayland = session !== 'plasma-x11', desktop = session.startsWith('hyprland') ? /(?:^|:)hyprland(?:$|:)/i : /(?:^|:)(?:kde|plasma)(?:$|:)/i;
  return observed.type === (wayland ? 'wayland' : 'x11') && desktop.test(observed.desktop) && backend === (wayland ? 'wayland' : 'xcb');
}
export function parseDesktopFacts(output) {
  const result = {};
  for (const line of output.split('\n')) { const marker = line.indexOf('M4_FACT '); if (marker >= 0) Object.assign(result, JSON.parse(line.slice(marker + 8))); }
  return result;
}
export function desktopCase(session, observed, facts, outcomes = {}) {
  if (!sessions.includes(session)) throw new Error('DESKTOP_SESSION_INVALID');
  const matches = sessionMatches(session, observed, facts?.backend ?? (session === 'plasma-x11' ? 'xcb' : 'wayland'));
  const ran = facts !== null && facts !== undefined;
  const pass = matches && ran && ['activationAck', 'exposed', 'focused', 'draftPreserved', 'geometryPreserved'].every(key => facts[key] === true) && ['window', 'tray', 'trayHost', 'notifications'].every(key => outcomes[key] === 0) && outcomes.cleanup === true;
  return { id: 'desktop.' + session, required: true, status: !matches ? 'unavailable' : !ran ? 'not_run' : pass ? 'pass' : 'fail', environment: `${session}; logind=${observed?.id ?? 'absent'}; Qt=${facts?.qtVersion ?? 'unrun'}; backend=${facts?.backend ?? 'unrun'}`, evidence: ['observation.json', 'historical-focus.json', ...(ran ? ['window.log', 'tray.log', 'tray-host.log', 'notifications.log'] : ['approval-boundary.json'])], exitCode: ran ? pass ? 0 : 1 : null, cleanup: ran ? outcomes.cleanup === true : null, details: { ...facts, observed, outcomes, historicalQt682Focus: 'unresolved; new Qt/session result does not rewrite original' } };
}
export function observeDesktop(env = process.env) {
  const result = spawnSync('loginctl', ['show-session', env.XDG_SESSION_ID ?? 'auto', '-p', 'Id', '-p', 'Type', '-p', 'Desktop', '-p', 'User', '-p', 'Remote'], { encoding: 'utf8', timeout: 5000 });
  if (result.status !== 0) return null;
  const fields = Object.fromEntries(result.stdout.trim().split('\n').map(line => line.split('=')));
  return { id: fields.Id, type: fields.Type, desktop: fields.Desktop, uid: Number(fields.User), remote: fields.Remote !== 'no' };
}
async function claimApproval(file, session, observed, evidence) {
  if (!file) return false;
  file = resolve(file); await noSymlinkParents('/', file);
  const parent = await lstat(dirname(file));
  if (parent.uid !== process.geteuid() || (parent.mode & 0o777) !== 0o700) throw new Error('DESKTOP_APPROVAL_UNSAFE');
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW); let value;
  try { const stat = await fd.stat(); if (!stat.isFile() || stat.uid !== process.geteuid() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.size > 8192) throw new Error('DESKTOP_APPROVAL_UNSAFE'); value = JSON.parse(await fd.readFile('utf8')); } finally { await fd.close(); }
  if (value.version !== 1 || value.ownerApproved !== true || value.session !== session || value.sessionId !== observed.id || value.evidence !== evidence || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now() || (!Number.isInteger(value.maxDurationMs) || value.maxDurationMs < 1 || value.maxDurationMs > 180000) || value.allowCompositorChanges !== false) throw new Error('DESKTOP_APPROVAL_INVALID');
  const claim = await open(file + '.consumed', 'wx', 0o600); try { await claim.writeFile(JSON.stringify({ session, sessionId: observed.id, evidence }) + '\n'); await claim.sync(); } finally { await claim.close(); }
  return value;
}
export async function qualifyDesktop({ session, evidence, approvalFile, root = resolve('.'), commandRunner = runCommand, observation = observeDesktop, monotonicNow = () => performance.now(), wallNow = () => Date.now() }) {
  if (!sessions.includes(session)) throw new Error('DESKTOP_SESSION_INVALID');
  evidence = resolve(evidence); await mkdir(evidence, { mode: 0o700 });
  const observed = observation(); await writeFile(join(evidence, 'observation.json'), JSON.stringify(observed, null, 2) + '\n');
  await writeFile(join(evidence, 'historical-focus.json'), JSON.stringify({ status: 'unresolved', qt: '6.8.2', session: 'Plasma Wayland', case: 'activationPreservesMaximizedState', disposition: 'Transferred from M0 to M4; never converted to pass by a different Qt/backend/session.', original: 'Retained private M0 evidence referenced by approved handoff.' }, null, 2) + '\n');
  let facts = null, outcomes = {};
  const expectedBackend = session === 'plasma-x11' ? 'xcb' : 'wayland';
  const approval = sessionMatches(session, observed, expectedBackend) ? await claimApproval(approvalFile, session, observed, evidence) : null;
  if (approval) {
    const started = monotonicNow();
    const remaining = () => Math.min(approval.maxDurationMs - (monotonicNow() - started), Date.parse(approval.expiresAt) - wallNow());
    const home = await mkdtemp(join(tmpdir(), 'tilde-desktop-')); await mkdir(join(home, 'run'), { mode: 0o700 });
    try {
    const env = childEnvironment(process.execPath, { HOME: home, XDG_RUNTIME_DIR: join(home, 'run'), XDG_CONFIG_HOME: join(home, 'config'), XDG_STATE_HOME: join(home, 'state'), XDG_CACHE_HOME: join(home, 'cache'), XDG_DATA_HOME: join(home, 'data'), TMPDIR: home, QT_QPA_PLATFORM: expectedBackend, QT_QUICK_BACKEND: 'software', QT_NO_XDG_DESKTOP_PORTAL: '1' });
    if (expectedBackend === 'wayland') {
      const display = process.env.WAYLAND_DISPLAY; if (!display) throw new Error('DESKTOP_WAYLAND_SOCKET_MISSING');
      const path = isAbsolute(display) ? display : join(process.env.XDG_RUNTIME_DIR, display), stat = await lstat(path);
      if (!stat.isSocket() || stat.uid !== process.geteuid()) throw new Error('DESKTOP_WAYLAND_SOCKET_UNSAFE'); env.WAYLAND_DISPLAY = path;
    } else { if (!/^:\d+(?:\.\d+)?$/.test(process.env.DISPLAY ?? '')) throw new Error('DESKTOP_LOCAL_X11_REQUIRED'); env.DISPLAY = process.env.DISPLAY; if (process.env.XAUTHORITY) env.XAUTHORITY = process.env.XAUTHORITY; }
    const run = async (name, executable, args, extra = {}) => {
      const timeout = Math.floor(Math.min(60000, remaining()));
      if (timeout < 1) throw new Error('DESKTOP_APPROVAL_EXHAUSTED');
      const result = await commandRunner({ name, executable, args, env: { ...env, ...extra }, cwd: root, evidence, timeout });
      if (result.timedOut || remaining() < 1) throw new Error('DESKTOP_APPROVAL_EXHAUSTED');
      return result;
    };
    const window = await run('window', join(root, '.build/cmake/apps/gui/tst_window'), ['activationPreservesPresentation', 'busyDisconnectedAndSetupKeepDraft', 'setupCloseNeverSubmitsPassword', '-v1']);
    const tray = await run('tray', 'dbus-run-session', ['--', join(root, '.build/cmake/apps/gui/tst_tray'), 'trayMenuIsNonAuthorizing', 'absentTrayCannotHideOnClose', 'hiddenHostLossRestoresWindow', 'closeDefaultQuitsFrontendOnly', 'quitFailureRestoresHiddenWindow', 'launcherAlwaysShows', '-v1']);
    const trayHost = await run('tray-host', join(root, '.build/cmake/apps/gui/tst_tray'), ['nativeReferenceTray', '-v1'], { DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS ?? '', TILDE_TRAY_CAPTURE_DIR: join(evidence, 'tray-host') });
    const notifications = await run('notifications', 'dbus-run-session', ['--', join(root, '.build/cmake/apps/desktop-bridge/tst_notifications')]);
    facts = parseDesktopFacts(await readFile(join(evidence, 'window.log'), 'utf8'));
    outcomes = { window: window.exitCode, tray: tray.exitCode, trayHost: trayHost.exitCode, notifications: notifications.exitCode, cleanup: [window, tray, trayHost, notifications].every(r => !r.timedOut && Number.isInteger(r.exitCode)) };
    } finally { await rm(home, { recursive: true, force: true }); }
  }
  await writeFile(join(evidence, 'approval-boundary.json'), JSON.stringify({ explicitApprovalFile: approvalFile ? 'provided' : null, actualTestsRun: facts !== null, compositorChanges: false, existingSessionsStopped: false, providerRequests: 0 }, null, 2) + '\n');
  const row = desktopCase(session, observed, facts, outcomes);
  await writeQualificationReport({ path: join(evidence, 'report.json'), runId: evidence.split('/').at(-1), environment: row.environment, cases: [row] }); return row;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { session: { type: 'string' }, evidence: { type: 'string' }, 'approval-file': { type: 'string' } } });
  if (!values.evidence) throw new Error('DESKTOP_EVIDENCE_REQUIRED');
  const result = await qualifyDesktop({ session: values.session, evidence: values.evidence, approvalFile: values['approval-file'] }); console.log(JSON.stringify(result, null, 2)); if (result.status !== 'pass') process.exitCode = 1;
}
