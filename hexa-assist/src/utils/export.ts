// Export utilities – swap backend calls here for Azure integration

export function exportCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const rows = [keys.join(','), ...data.map(row =>
    keys.map(k => {
      const val = String(row[k] ?? '').replace(/"/g, '""');
      return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val}"` : val;
    }).join(',')
  )];
  download(rows.join('\n'), `${filename}.csv`, 'text/csv');
}

export function exportJSON(data: unknown, filename: string) {
  download(JSON.stringify(data, null, 2), `${filename}.json`, 'application/json');
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export function copyToClipboard(data: Record<string, unknown>[]) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const rows = [keys.join('\t'), ...data.map(row => keys.map(k => String(row[k] ?? '')).join('\t'))];
  navigator.clipboard.writeText(rows.join('\n'));
}
