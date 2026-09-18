export interface DoctorCheckResult {
  label: string;
  status: 'pass' | 'fail';
  /** Shown next to a passing check, e.g. "beta.49 installed". */
  detail?: string;
  /** Shown as a wrapped "→ fix" line under a failing check. */
  fix?: string;
}
