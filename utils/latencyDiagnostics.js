/**
 * Latency diagnostics storage for set classification round-trip metrics.
 * Stored in localStorage so metrics survive page reloads during testing.
 */

const STORAGE_KEY = 'latency_diagnostics_set_classification_v1';

function isBrowser() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function nowIso() {
  return new Date().toISOString();
}

export function getLatencyRows() {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearLatencyRows() {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEY);
}

export function appendLatencyRow(row) {
  if (!isBrowser()) return;
  const rows = getLatencyRows();
  rows.push({
    timestamp: nowIso(),
    ...row,
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function latencyRowsToCsv(rows) {
  const header = [
    'timestamp',
    'setNumber',
    'exercise',
    'repsRequested',
    'repsCloudClassified',
    'fallbackReps',
    'setRoundTripMs',
    'clientRoundTripMs',
    'apiTotalMs',
    'featureExtractionMs',
    'warmupMs',
    'totalCloudMs',
    'perRepCloudMs',
    'perRepAttempts'
  ];

  const lines = [header.join(',')];

  for (const row of rows) {
    const values = [
      row.timestamp,
      row.setNumber,
      row.exercise,
      row.repsRequested,
      row.repsCloudClassified,
      row.fallbackReps,
      row.setRoundTripMs,
      row.clientRoundTripMs,
      row.apiTotalMs,
      row.featureExtractionMs,
      row.warmupMs,
      row.totalCloudMs,
      Array.isArray(row.perRepCloudMs) ? row.perRepCloudMs.join('|') : '',
      Array.isArray(row.perRepAttempts) ? row.perRepAttempts.join('|') : ''
    ];
    lines.push(values.map(csvEscape).join(','));
  }

  return `${lines.join('\n')}\n`;
}

export function downloadLatencyCsv(filename = '') {
  if (!isBrowser()) return false;
  const rows = getLatencyRows();
  const csv = latencyRowsToCsv(rows);
  const safeName = filename || `set-latency-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

// Convenience for manual testing in browser console
if (typeof window !== 'undefined') {
  window.__latencyDiagnostics = {
    getRows: getLatencyRows,
    clear: clearLatencyRows,
    toCsv: () => latencyRowsToCsv(getLatencyRows()),
    download: downloadLatencyCsv,
  };
}
