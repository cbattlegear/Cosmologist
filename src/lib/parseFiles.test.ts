import { describe, it, expect } from 'vitest'
import { gzipSync } from 'fflate'
import JSZip from 'jszip'
import { parseFiles, parseDelimitedText } from './parseFiles'

const fileFromString = (name: string, content: string, type = 'text/plain') => new File([content], name, { type })
const fileFromUint8Array = (name: string, content: Uint8Array, type = 'application/octet-stream') => {
  const buf = content.buffer instanceof ArrayBuffer
    ? content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)
    : Uint8Array.from(content).buffer
  return new File([buf], name, { type })
}

const padTo512 = (n: number) => (512 - (n % 512)) % 512
const concatUint8 = (arrays: Uint8Array[]) => {
  const total = arrays.reduce((t, a) => t + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  arrays.forEach((a) => { out.set(a, offset); offset += a.length })
  return out
}
const encodeString = (str: string, len: number) => {
  const bytes = new Uint8Array(len)
  for (let i = 0; i < Math.min(str.length, len); i++) bytes[i] = str.charCodeAt(i)
  return bytes
}
const encodeOctal = (value: number, len: number) => {
  const str = value.toString(8).padStart(len - 1, '0')
  const bytes = new Uint8Array(len)
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i)
  bytes[str.length] = 0
  return bytes
}
const tarHeader = (name: string, size: number) => {
  const buf = new Uint8Array(512)
  buf.set(encodeString(name, 100), 0)
  buf.set(encodeOctal(0o644, 8), 100)
  buf.set(encodeOctal(0, 8), 108)
  buf.set(encodeOctal(0, 8), 116)
  buf.set(encodeOctal(size, 12), 124)
  buf.set(encodeOctal(Math.floor(Date.now() / 1000), 12), 136)
  for (let i = 148; i < 156; i++) buf[i] = 0x20 // checksum placeholder
  buf[156] = '0'.charCodeAt(0)
  buf.set(encodeString('ustar\0', 6), 257)
  buf.set(encodeString('00', 2), 263)
  let sum = 0
  for (let i = 0; i < 512; i++) sum += buf[i]
  buf.set(encodeOctal(sum, 8), 148)
  return buf
}
const makeTar = (entries: { name: string; content: string | Uint8Array }[]) => {
  const chunks: Uint8Array[] = []
  const encoder = new TextEncoder()
  for (const entry of entries) {
    const data = typeof entry.content === 'string' ? encoder.encode(entry.content) : entry.content
    const header = tarHeader(entry.name, data.length)
    chunks.push(header, data)
    const pad = padTo512(data.length)
    if (pad) chunks.push(new Uint8Array(pad))
  }
  chunks.push(new Uint8Array(1024))
  return concatUint8(chunks)
}

describe('parseFiles', () => {
  it('parses csv with headers', async () => {
    const csv = 'id,name\n1,Alice\n2,Bob'
    const { tables, errors } = await parseFiles([fileFromString('people.csv', csv)])
    expect(errors).toHaveLength(0)
    expect(tables[0].name).toBe('people')
    expect(tables[0].columns).toEqual(['id', 'name'])
    expect(tables[0].rows).toHaveLength(2)
  })

  it('parses json array', async () => {
    const json = JSON.stringify([{ id: 1, v: 'x' }])
    const { tables, errors } = await parseFiles([fileFromString('items.json', json, 'application/json')])
    expect(errors).toHaveLength(0)
    expect(tables[0].columns).toEqual(['id', 'v'])
  })

  it('parses jsonl', async () => {
    const jsonl = '{"id":1}\n{"id":2}'
    const { tables, errors } = await parseFiles([fileFromString('events.jsonl', jsonl)])
    expect(errors).toHaveLength(0)
    expect(tables[0].rows).toHaveLength(2)
  })

  it('parses txt as csv', async () => {
    const txt = 'id,name\n1,Alice\n2,Bob'
    const { tables, errors } = await parseFiles([fileFromString('people.txt', txt)])
    expect(errors).toHaveLength(0)
    expect(tables[0].columns).toEqual(['id', 'name'])
  })

  it('parses txt as tsv', async () => {
    const txt = 'id\tname\n1\tAlice\n2\tBob'
    const { tables, errors } = await parseFiles([fileFromString('people.txt', txt)])
    expect(errors).toHaveLength(0)
    expect(tables[0].columns).toEqual(['id', 'name'])
  })

  it('parseDelimitedText supports skipRows (header on second line)', async () => {
    const txt = 'Version\t3.6\t01-29-2026\nItemID\tRecID1\n1\tA\n2\tB'
    const rows = await parseDelimitedText(txt, '\t', 1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ ItemID: 1, RecID1: 'A' })
  })

  it('parseDelimitedText skips leading comments automatically', async () => {
    const txt = '#comment\n// another\nid,name\n1,Alice\n2,Bob'
    const rows = await parseDelimitedText(txt, ',', 0)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ id: 1, name: 'Alice' })
  })

  it('reports unsupported extension', async () => {
    const { errors } = await parseFiles([fileFromString('bad.xyz', 'hello')])
    expect(errors[0]).toMatch(/Unsupported/)
  })

  it('respects usedIds for uniqueness', async () => {
    const usedIds = new Set<string>(['people'])
    const { tables } = await parseFiles([fileFromString('people.csv', 'id\n1')], { usedIds })
    expect(tables[0].id).toMatch(/people-1/)
  })

  it('parses zip archive with csv', async () => {
    const csv = 'id,name\n1,Alice'
    const zip = new JSZip()
    zip.file('people.csv', csv)
    const zipBytes = await zip.generateAsync({ type: 'uint8array' })
    const zipFile = fileFromUint8Array('archive.zip', zipBytes, 'application/zip')
    const { tables, errors } = await parseFiles([zipFile])
    expect(errors).toHaveLength(0)
    expect(tables).toHaveLength(1)
    expect(tables[0].columns).toEqual(['id', 'name'])
    expect(tables[0].rows).toHaveLength(1)
  })

  it('parses tar archive with json', async () => {
    const tarBytes = makeTar([{ name: 'items.json', content: JSON.stringify([{ id: 1, v: 'x' }]) }])
    const tarFile = fileFromUint8Array('archive.tar', tarBytes, 'application/x-tar')
    const { tables, errors } = await parseFiles([tarFile])
    expect(errors).toHaveLength(0)
    expect(tables[0].columns).toEqual(['id', 'v'])
    expect(tables[0].rows).toHaveLength(1)
  })

  it('parses tar.gz archive', async () => {
    const tarBytes = makeTar([{ name: 'items.json', content: JSON.stringify([{ id: 2, v: 'y' }]) }])
    const gz = gzipSync(tarBytes)
    const gzFile = fileFromUint8Array('archive.tgz', gz, 'application/gzip')
    const { tables, errors } = await parseFiles([gzFile])
    expect(errors).toHaveLength(0)
    expect(tables[0].rows).toHaveLength(1)
    expect(tables[0].columns).toEqual(['id', 'v'])
  })

  it('parses nested archives (zip within zip)', async () => {
    const innerZip = new JSZip()
    innerZip.file('items.json', JSON.stringify([{ id: 3 }]))
    const innerBytes = await innerZip.generateAsync({ type: 'uint8array' })
    const outerZip = new JSZip()
    outerZip.file('inner.zip', innerBytes)
    const outerBytes = await outerZip.generateAsync({ type: 'uint8array' })
    const outerFile = fileFromUint8Array('outer.zip', outerBytes, 'application/zip')
    const { tables, errors } = await parseFiles([outerFile])
    expect(errors).toHaveLength(0)
    expect(tables).toHaveLength(1)
    expect(tables[0].rows[0]).toEqual({ id: 3 })
  })
})
