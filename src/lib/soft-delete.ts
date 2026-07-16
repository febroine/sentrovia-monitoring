export function parseSoftDeleteUndoDeadline(value: string | null, now = Date.now()) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : now;
}
