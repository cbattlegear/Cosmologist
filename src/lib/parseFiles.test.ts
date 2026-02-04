import { describe, it, expect } from 'vitest'
import { parseFiles, parseDelimitedText } from './parseFiles'

const fileFromString = (name: string, content: string, type = 'text/plain') => new File([content], name, { type })

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
})
