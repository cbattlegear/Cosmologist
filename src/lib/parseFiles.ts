import Papa from 'papaparse'
import { unzipSync, gunzipSync } from 'fflate'
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

export async function readArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.readAsArrayBuffer(file)
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

function looksLikeTar(data: Uint8Array): boolean {
  if (data.length < 512) return false
  const ustar = String.fromCharCode(...data.slice(257, 257 + 5))
  return ustar === 'ustar'
}

function untar(data: Uint8Array): { name: string; data: Uint8Array }[] {
  const entries: { name: string; data: Uint8Array }[] = []
  let offset = 0
  while (offset + 512 <= data.length) {
    const header = data.slice(offset, offset + 512)
    if (header.every((b) => b === 0)) break
    const name = String.fromCharCode(...header.slice(0, 100)).replace(/\0.*$/, '')
    const sizeOctal = String.fromCharCode(...header.slice(124, 136)).replace(/\0.*$/, '').trim()
    const size = parseInt(sizeOctal || '0', 8)
    const contentStart = offset + 512
    const contentEnd = contentStart + size
    const fileData = data.slice(contentStart, contentEnd)
    if (name && !name.endsWith('/')) entries.push({ name, data: fileData })
    const padding = (512 - (size % 512)) % 512
    offset = contentEnd + padding
  }
  return entries
}

function toFile(name: string, data: Uint8Array): File {
  const buf = data.buffer instanceof ArrayBuffer
    ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    : Uint8Array.from(data).buffer
  return new File([buf], name)
}

async function expandArchive(fileName: string, bytes: Uint8Array): Promise<File[]> {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.zip')) {
    const unzipped = unzipSync(bytes)
    return Object.entries(unzipped)
      .filter(([entryName, data]) => entryName && data.length)
      .map(([entryName, data]) => toFile(`${fileName}::${entryName}`, data))
  }
  if (lower.endsWith('.tar') || looksLikeTar(bytes)) {
    return untar(bytes).map((e) => toFile(`${fileName}::${e.name}`, e.data))
  }
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.gz')) {
    const gunzipped = gunzipSync(bytes)
    if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || looksLikeTar(gunzipped)) {
      return untar(gunzipped).map((e) => toFile(`${fileName}::${e.name}`, e.data))
    }
    const base = fileName.replace(/\.gz$/i, '').replace(/\.tgz$/i, '.tar')
    return [toFile(base, gunzipped)]
  }
  return []
}

function isArchiveName(lower: string): boolean {
  return lower.endsWith('.zip') || lower.endsWith('.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar') || lower.endsWith('.tar.gz')
}

export async function parseFiles(
  files: FileList | File[],
  options?: { usedIds?: Set<string> },
): Promise<{ tables: TableData[]; errors: string[] }> {
  const queue: File[] = Array.from(files as any)
  const tables: TableData[] = []
  const errors: string[] = []
  const usedIds = options?.usedIds ?? new Set<string>()

  while (queue.length) {
    const file = queue.shift()!
    const name = file.name
    const lower = name.toLowerCase()
    try {
      if (isArchiveName(lower)) {
        const bytes = new Uint8Array(await readArrayBuffer(file))
        try {
          const extracted = await expandArchive(name, bytes)
          if (!extracted.length) errors.push(`No files extracted from archive: ${name}`)
          queue.push(...extracted)
        } catch (err: any) {
          errors.push(`Failed extracting ${name}: ${err?.message ?? err}`)
        }
        continue
      }
      let rows: Row[] = []
      let sourceText: string | undefined
      let sourceType: string | undefined
      if (lower.endsWith('.csv')) {
        sourceText = await readText(file)
        rows = await parseDelimitedText(sourceText, ',')
        sourceType = 'csv'
      }
      else if (lower.endsWith('.tsv')) {
        sourceText = await readText(file)
        rows = await parseDelimitedText(sourceText, '\t')
        sourceType = 'tsv'
      }
      else if (lower.endsWith('.txt')) {
        sourceText = await readText(file)
        const delimiter = detectDelimiter(sourceText)
        rows = await parseDelimitedText(sourceText, delimiter)
        sourceType = 'txt'
      }
      else if (lower.endsWith('.jsonl')) {
        sourceText = await readText(file)
        rows = await parseJsonl(file)
        sourceType = 'jsonl'
      }
      else if (lower.endsWith('.json')) {
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
