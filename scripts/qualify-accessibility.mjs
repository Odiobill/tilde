import { mkdir, mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
import { childEnvironment } from './release/runtime.mjs';
import { runCommand } from './release/commands.mjs';
import { writeQualificationReport } from './release/report.mjs';
export async function qualifyAccessibility({ evidence, root = resolve('.') }) {
  evidence = resolve(evidence); await mkdir(evidence, { mode: 0o700 });
  const results = [];
  for (const scale of [1, 1.5, 2]) {
    const home = await mkdtemp(join(tmpdir(), 'tilde-a11y-')), capture = join(evidence, `scale-${scale}`); await mkdir(capture, { mode: 0o700 }); await mkdir(join(home, 'run'), { mode: 0o700 });
    try {
      const env = childEnvironment(process.execPath, { HOME: home, TMPDIR: home, XDG_RUNTIME_DIR: join(home, 'run'), XDG_CONFIG_HOME: join(home, 'config'), XDG_STATE_HOME: join(home, 'state'), XDG_CACHE_HOME: join(home, 'cache'), XDG_DATA_HOME: join(home, 'data'), QT_QPA_PLATFORM: 'offscreen', QT_QPA_PLATFORMTHEME: 'generic', QT_QUICK_BACKEND: 'software', QT_SCALE_FACTOR: String(scale), QT_LINUX_ACCESSIBILITY_ALWAYS_ON: '1', QT_NO_XDG_DESKTOP_PORTAL: '1', QML_DISABLE_DISK_CACHE: '1', TILDE_A11Y_CAPTURE_DIR: capture });
      const result = await runCommand({ executable: 'dbus-run-session', args: ['--', join(root, '.build/cmake/apps/gui/tst_accessibility')], cwd: root, env, evidence, name: `scale-${scale}`, timeout: 60000 });
      const log = await readFile(join(evidence, `scale-${scale}.log`), 'utf8'), line = log.split('\n').find(line => line.includes('M4_A11Y_FACT '));
      const facts = line ? JSON.parse(line.slice(line.indexOf('M4_A11Y_FACT ') + 13)) : null;
      const captures = (await readdir(capture)).filter(name => name.endsWith('.png'));
      results.push({ scale, exitCode: result.exitCode, cleanup: !result.timedOut && result.exitCode !== null, facts, captures: captures.length, passed: result.exitCode === 0 && !result.timedOut && facts?.backend === 'offscreen' && Math.abs(facts.devicePixelRatio - scale) < .01 && captures.length >= 8 });
    } finally { await rm(home, { recursive: true, force: true }); }
  }
  await writeFile(join(evidence, 'matrix.json'), JSON.stringify({ kind: 'synthetic-offscreen-source-fixtures', results, realScreenReader: false, installedKeyboard: false }, null, 2) + '\n');
  const passed = results.every(row => row.passed), environment = 'offscreen Qt; synthetic peers;100/150/200%; both themes;520x400;15/30px application font';
  const cases = [
    { id: 'accessibility.automated', required: false, status: passed ? 'pass' : 'fail', environment, evidence: ['matrix.json', 'scale-1.log', 'scale-1.5.log', 'scale-2.log'], exitCode: passed ? 0 : 1, cleanup: results.every(row => row.cleanup), details: { semanticAndKeyboardFixtures: true, actualScreenReader: false, finalInstalledArtifact: false } },
    { id: 'accessibility.real', required: true, status: 'not_run', environment: 'actual installed artifact, AT-SPI screen reader and operator walkthrough required', evidence: ['operator-boundary.json'], exitCode: null, cleanup: null, details: { screenReader: 'not_run', installedKeyboard: 'not_run', requiredFlows: ['history', 'send', 'cancel', 'settings', 'auth', 'completeApproval', 'source'] } },
  ];
  await writeFile(join(evidence, 'operator-boundary.json'), JSON.stringify({ actualATSetupGrant: null, screenReaderStarted: false, hostPackagesInstalled: false, desktopReconfigured: false, reason: 'Offscreen introspection/synthetic keyboard fixtures do not satisfy actual AT-SPI or final installed keyboard acceptance.' }, null, 2) + '\n');
  await writeQualificationReport({ path: join(evidence, 'report.json'), runId: evidence.split('/').at(-1), environment, cases });
  return { cases, automatedPassed: passed, ready: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { evidence: { type: 'string' } } }); if (!values.evidence) throw new Error('ACCESSIBILITY_EVIDENCE_REQUIRED');
  console.log(JSON.stringify(await qualifyAccessibility({ evidence: values.evidence }), null, 2)); process.exitCode = 1;
}
