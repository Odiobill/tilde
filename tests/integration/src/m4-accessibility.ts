export type AccessibilityObservation = {
  screenReader: { name: string; version: string }; session: string;
  installedPackageSha256: string; sourceSha256: string; operatorStatement: string;
  flows: Record<'history' | 'send' | 'cancel' | 'settings' | 'auth' | 'completeApproval' | 'source', 'pass' | 'fail' | 'not_run'>;
  secretValueSpoken: boolean; automaticWork: number; cleanup: boolean;
};
// A metadata/tree dump is intentionally insufficient for real acceptance. This
// predicate validates an operator's record; it never fabricates that record.
export function completeAccessibilityObservation(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const value = input as Partial<AccessibilityObservation>, nonempty = (text: unknown): text is string => typeof text === 'string' && text.trim().length > 0;
  return !!value.screenReader && nonempty(value.screenReader.name) && nonempty(value.screenReader.version) && nonempty(value.session)
    && nonempty(value.installedPackageSha256) && /^[a-f0-9]{64}$/.test(value.installedPackageSha256) && nonempty(value.sourceSha256) && /^[a-f0-9]{64}$/.test(value.sourceSha256)
    && nonempty(value.operatorStatement) && !!value.flows && ['history', 'send', 'cancel', 'settings', 'auth', 'completeApproval', 'source'].every(flow => value.flows![flow as keyof AccessibilityObservation['flows']] === 'pass')
    && value.secretValueSpoken === false && value.automaticWork === 0 && value.cleanup === true;
}
