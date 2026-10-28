import { join } from 'node:path';
import { resolvePaths, loadConfig } from '@tilde/config';
import { openCredentialStore } from '@tilde/credentials';

// This fixture targets a crash in the provider stream, not a crash inside auth IO.
// Hold the existing store lease in the surviving test process, so killing the
// daemon cannot orphan a concurrent metadata-read lease. No credential is changed.
export async function withCredentialCrashBarrier(home: string, cut: () => Promise<void>): Promise<void> {
  const paths = resolvePaths({ XDG_RUNTIME_DIR: join(home, 'run') }, home, process.geteuid!());
  const config = await loadConfig(paths);
  const store = openCredentialStore(config.authFile, { timeoutMs: 5000 });
  let entered!: () => void, release!: () => void;
  const acquired = new Promise<void>(resolve => { entered = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  const lease = store.modify(config.providerId, async () => { entered(); await hold; return undefined; });
  try { await Promise.race([acquired, lease]); await cut(); }
  finally { release(); await lease; }
}
