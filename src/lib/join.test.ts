import { describe, it, expect } from 'vitest'
import { buildJoinedDocument } from './join'
import type { TableData, RelationshipEdge } from './types'

const tables: TableData[] = [
  {
    id: 'a',
    name: 'A',
    fileName: 'a.csv',
    columns: ['id', 'b_id'],
    rows: [
      { id: 1, b_id: 10 },
      { id: 2, b_id: 11 },
    ],
  },
  {
    id: 'b',
    name: 'B',
    fileName: 'b.csv',
    columns: ['id', 'val'],
    rows: [
      { id: 10, val: 'x' },
      { id: 11, val: 'y' },
    ],
  },
]

const relationships: RelationshipEdge[] = [
  { sourceTableId: 'a', targetTableId: 'b', sourceColumn: 'b_id', targetColumn: 'id' },
]

describe('buildJoinedDocument', () => {
  it('joins rows across tables hierarchically', () => {
    const doc = buildJoinedDocument('a', 0, tables, relationships)
    expect(doc).toEqual({
      A: {
        id: 1,
        b_id: 10,
        B: [{ id: 10, val: 'x' }],
      },
    })
  })

  it('handles reverse traversal', () => {
    const reversed: RelationshipEdge[] = [
      { sourceTableId: 'b', targetTableId: 'a', sourceColumn: 'id', targetColumn: 'b_id' },
    ]
    const doc = buildJoinedDocument('a', 1, tables, reversed)
    expect(doc).toEqual({ A: { id: 2, b_id: 11, B: [{ id: 11, val: 'y' }] } })
  })

  it('includes multiple matches as array', () => {
    const multi: TableData[] = [
      tables[0],
      {
        ...tables[1],
        rows: [
          { id: 10, val: 'x' },
          { id: 10, val: 'x2' },
        ],
      },
    ]
    const doc = buildJoinedDocument('a', 0, multi, relationships)
    expect(doc.A.B).toEqual([
      { id: 10, val: 'x' },
      { id: 10, val: 'x2' },
    ])
  })

  it('deduplicates rows in result', () => {
    const rels: RelationshipEdge[] = [
      { sourceTableId: 'a', targetTableId: 'b', sourceColumn: 'b_id', targetColumn: 'id' },
      { sourceTableId: 'b', targetTableId: 'a', sourceColumn: 'id', targetColumn: 'b_id' },
    ]
    const doc = buildJoinedDocument('a', 0, tables, rels)
    expect(doc.A.B).toEqual([{ id: 10, val: 'x' }])
  })

  it('projects selected columns per table', () => {
    const doc = buildJoinedDocument('a', 0, tables, relationships, {
      columnsFilter: {
        a: ['id'],
        b: ['val'],
      },
    })
    expect(doc).toEqual({ A: { id: 1, B: [{ val: 'x' }] } })
  })

  it('nests deeper hierarchies', () => {
    const cTable: TableData = {
      id: 'c',
      name: 'C',
      fileName: 'c.csv',
      columns: ['id', 'b_id'],
      rows: [{ id: 100, b_id: 10 }],
    }
    const rels: RelationshipEdge[] = [
      { sourceTableId: 'a', targetTableId: 'b', sourceColumn: 'b_id', targetColumn: 'id' },
      { sourceTableId: 'b', targetTableId: 'c', sourceColumn: 'id', targetColumn: 'b_id' },
    ]
    const doc = buildJoinedDocument('a', 0, [tables[0], tables[1], cTable], rels)
    expect(doc).toEqual({
      A: {
        id: 1,
        b_id: 10,
        B: [
          {
            id: 10,
            val: 'x',
            C: [{ id: 100, b_id: 10 }],
          },
        ],
      },
    })
  })
})
