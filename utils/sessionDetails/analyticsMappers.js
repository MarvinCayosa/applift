/**
 * Date / number formatting helpers for Session Details.
 */

/**
 * Format a Date object into "Friday · February 20, 2025 · 6:30pm"
 */
export function formatSessionDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';

  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const day = d.getDate();
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  const time = `${hours}:${String(minutes).padStart(2, '0')}${ampm}`;

  return `${weekday} · ${month} ${day}, ${year} · ${time}`;
}

/**
 * Format seconds into "Xsec" or "Xm Xs"
 */
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0sec';
  if (seconds < 60) return `${seconds}sec`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/**
 * Get reps per set string (e.g. "3" when all sets have 3 reps)
 */
export function getRepsPerSet(totalReps, totalSets) {
  if (!totalSets || totalSets === 0) return totalReps || 0;
  return Math.round(totalReps / totalSets);
}
