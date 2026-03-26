/** Heuristic titles / structured hints from free-text admin rejection (STEP 5 State D). */

export function rejectionScreenTitle(reason: string | null): string {
  if (!reason?.trim()) return 'Document Issue';
  const lower = reason.toLowerCase();
  if (lower.includes('insurance')) return 'Vehicle Insurance';
  if (lower.includes('license') || lower.includes('licence')) return "Driver's License";
  if (lower.includes('vehicle')) return 'Vehicle Document';
  if (lower.includes('national') || lower.includes('identity') || lower.includes('government')) return 'National ID';
  return 'Document Issue';
}

export function parseExpiryFromReason(reason: string | null): string | null {
  if (!reason) return null;
  const m = reason.match(/\d{4}[./-]\d{2}[./-]\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/);
  return m ? m[0] : null;
}

export function parseRequirementFromReason(reason: string | null): string | null {
  if (!reason) return null;
  const lines = reason
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length >= 2) return lines[0].length > 160 ? `${lines[0].slice(0, 157)}…` : lines[0];
  return null;
}
