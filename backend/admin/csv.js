// minimal RFC-4180 CSV serializer. no third-party dep.
// quotes any field containing ", \n, \r, or , — escapes embedded " as "".

function escapeField(value) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function toCsv({ columns, rows }) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error('toCsv: columns required')
  }
  const header = columns.map((c) => escapeField(c.label || c.key)).join(',')
  const body = rows.map((row) =>
    columns.map((c) => escapeField(row[c.key])).join(',')
  )
  // CRLF line endings per RFC 4180 — friendlier to excel + windows tools.
  return [header, ...body].join('\r\n') + '\r\n'
}
