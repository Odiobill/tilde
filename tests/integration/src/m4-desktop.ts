// Non-authorizing facts emitted by the native window fixture. The real runner
// additionally verifies logind session identity; these values alone are not a gate.
export type DesktopFacts = {
  backend?: string; qtVersion?: string; activationAck?: boolean; exposed?: boolean;
  focused?: boolean; draftPreserved?: boolean; geometryPreserved?: boolean;
};
export function readDesktopFacts(output: string): DesktopFacts {
  const facts: DesktopFacts = {};
  for (const line of output.split('\n')) {
    const marker = line.indexOf('M4_FACT '); if (marker < 0) continue;
    Object.assign(facts, JSON.parse(line.slice(marker + 8)));
  }
  return facts;
}
