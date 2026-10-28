import { open, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
export function validateCase(row) {
  if (!row || typeof row !== 'object' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(row.id ?? '') || typeof row.required !== 'boolean' || !['pass', 'fail', 'unavailable', 'not_run'].includes(row.status)
    || typeof row.environment !== 'string' || !row.environment || !Array.isArray(row.evidence) || row.evidence.some(p => typeof p !== 'string' || !p || isAbsolute(p) || p.split(/[\\/]/).includes('..'))
    || !(row.exitCode === null || Number.isInteger(row.exitCode)) || !(row.cleanup === null || typeof row.cleanup === 'boolean') || !row.details || typeof row.details !== 'object' || Array.isArray(row.details)) throw new Error('QUALIFICATION_CASE_INVALID');
  if (row.status === 'pass' && (row.exitCode !== 0 || row.cleanup !== true || row.evidence.length === 0)) throw new Error('QUALIFICATION_PASS_WITHOUT_EVIDENCE');
  return row;
}
export function validateCases(cases) {
  if (!Array.isArray(cases)) throw new Error('QUALIFICATION_CASES_MISSING');
  const ids = new Set();
  for (const row of cases) { validateCase(row); if (ids.has(row.id)) throw new Error('QUALIFICATION_DUPLICATE_ID'); ids.add(row.id); }
}
export async function writeQualificationReport({ path, runId, environment, cases }) {
  validateCases(cases);
  if (!/^[\w.-]+$/.test(runId ?? '') || !environment || typeof environment !== 'string') throw new Error('QUALIFICATION_REPORT_INVALID');
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify({ version: 1, runId, environment, cases }, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
  try { await rename(temporary, path); const directory = await open(dirname(path), 'r'); try { await directory.sync(); } finally { await directory.close(); } } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}
// Source/environment-bound exceptions are implemented by the strict Task 11 aggregate.
export function evaluateReleaseGate(cases, exceptions = [], requiredIds = cases.filter(r => r.required).map(r => r.id)) {
  try { validateCases(cases); } catch { return { ready: false, blockingIds: [...new Set([...requiredIds, 'malformed-report'])] }; }
  const blockingIds = requiredIds.filter(id => { const row = cases.find(r => r.id === id); return !row || row.status !== 'pass' || row.cleanup !== true || row.exitCode !== 0; });
  return { ready: blockingIds.length === 0, blockingIds };
}
