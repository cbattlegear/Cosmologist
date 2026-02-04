import Papa from 'papaparse'
import type { TableData, Row } from './types'

export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function uniqueId(base: string, used: Set<string>) {
  let candidate = base || 'table'
  let i = 1
  while (used.has(candidate)) {
    candidate = `${base || 'table'}-${i++}`
  }
  used.add(candidate)
  return candidate
}

export async function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(file)
  })
}

export async function parseDelimitedText(content: string, delimiter: string, skipRows = 0): Promise<Row[]> {
  const lines = content.split(/\r?\n/)
  const linesAfterSkip = lines.slice(skipRows)
  const filtered = linesAfterSkip.filter((l) => {
    const t = l.trim()
    if (!t) return false
    if (t.startsWith('#') || t.startsWith('//')) return false
    return true
  })
  const headerLine = filtered[0] ?? ''
  const body = filtered.slice(1)
  const text = [headerLine, ...body].join('\n')
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      delimiter,
      complete: (results) => {
        const rows = (results.data as Row[]).filter((r) => Object.keys(r).length > 0)
        resolve(rows)
      },
      error: (err: any) => reject(err),
    })
  })
}

async function parseJson(file: File): Promise<Row[]> {
  const text = await readText(file)
  const parsed = JSON.parse(text)
  if (Array.isArray(parsed)) {
    return parsed as Row[]
  }
  if (Array.isArray(parsed?.data)) {
    return parsed.data as Row[]
  }
  if (typeof parsed === 'object') {
    return [parsed as Row]
  }
  throw new Error('Unsupported JSON structure')
}

async function parseJsonl(file: File): Promise<Row[]> {
  const text = await readText(file)
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return lines.map((line) => JSON.parse(line) as Row)
}

export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  const candidates = [',', '\t', ';', '|']
  const counts = candidates.map((d) => ({ d, count: first.split(d).length - 1 }))
  counts.sort((a, b) => b.count - a.count)
  return counts[0]?.count > 0 ? counts[0].d : ','
}

export async function parseFiles(
  files: FileList | File[],
  options?: { usedIds?: Set<string> },
): Promise<{ tables: TableData[]; errors: string[] }> {
  const arr: File[] = Array.from(files as any)
  const tables: TableData[] = []
  const errors: string[] = []
  const usedIds = options?.usedIds ?? new Set<string>()

  for (const file of arr) {
    const name = file.name
    const ext = name.split('.').pop()?.toLowerCase()
    try {
      let rows: Row[] = []
      let sourceText: string | undefined
      let sourceType: string | undefined
      if (ext === 'csv') {
        sourceText = await readText(file)
        rows = await parseDelimitedText(sourceText, ',')
        sourceType = 'csv'
      }
      else if (ext === 'tsv') {
        sourceText = await readText(file)
        rows = await parseDelimitedText(sourceText, '\t')
        sourceType = 'tsv'
      }
      else if (ext === 'txt') {
        sourceText = await readText(file)
        const delimiter = detectDelimiter(sourceText)
        rows = await parseDelimitedText(sourceText, delimiter)
        sourceType = 'txt'
      }
      else if (ext === 'jsonl') {
        sourceText = await readText(file)
        rows = await parseJsonl(file)
        sourceType = 'jsonl'
      }
      else if (ext === 'json') {
        sourceText = await readText(file)
        rows = await parseJson(file)
        sourceType = 'json'
      }
      else {
        errors.push(`Unsupported file type: ${name}`)
        continue
      }
      if (!rows.length) {
        errors.push(`No rows parsed for ${name}`)
        continue
      }
      const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
      const tableBase = name.replace(/\.[^.]+$/, '')
      const id = uniqueId(slugify(tableBase), usedIds)
      tables.push({ id, name: tableBase, fileName: name, columns, rows, sourceText, sourceType })
    } catch (e: any) {
      errors.push(`Failed parsing ${name}: ${e?.message ?? e}`)
    }
  }

  return { tables, errors }
}
