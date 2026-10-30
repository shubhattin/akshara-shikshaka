/** Small number/date formatting for the batch pages. */
export function formatUsd(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/** Seconds of a finished run as "45s" or "2m 10s"; null stays null. */
export function formatDuration(totalSeconds: number | null): string | null {
  if (totalSeconds === null) return null;
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/** Rough seconds left as "≈3 min" or "≈50s"; null stays null. */
export function formatEta(etaSeconds: number | null): string | null {
  if (etaSeconds === null) return null;
  if (etaSeconds < 90) return `≈${etaSeconds}s`;
  const minutes = Math.round(etaSeconds / 60);
  return `≈${minutes} min`;
}

/** Milliseconds between two timestamps as seconds; null when either is missing. */
export function runSeconds(
  startedAt: Date | string | null,
  finishedAt: Date | string | null
): number | null {
  if (startedAt === null || finishedAt === null) return null;
  return (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000;
}
