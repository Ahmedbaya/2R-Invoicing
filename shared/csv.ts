export function decodeText(buf: Uint8Array): string {
  const text = new TextDecoder('utf-8').decode(buf)
  return text.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(buf) : text
}

/** Parses CSV text into rows of cells. Blank rows are kept so row numbers match Excel. */
export function parseCsv(text: string): string[][] {
  const sample = text.slice(0, 20000)
  const count = (d: string) => sample.split(d).length - 1
  const delim = [';', '\t', ','].reduce((best, d) => (count(d) > count(best) ? d : best), ';')

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const endRow = () => {
    row.push(cell)
    cell = ''
    while (row.length && row[row.length - 1].trim() === '') row.pop() // Excel exports thousands of empty columns
    rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      endRow()
    } else cell += ch
  }
  if (cell !== '' || row.length) endRow()
  return rows
}