import { describe, it, expect } from 'vitest'
import type { Edge } from 'reactflow'
import { toRelationshipEdges, buildJoinedDocument } from './join'
import type { TableData } from './types'

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

describe('toRelationshipEdges edgeTypes override', () => {
  it('uses edgeTypes map to set one-to-one and build object in preview', () => {
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b', sourceHandle: 'b_id', targetHandle: 'id', type: 'default', data: {} },
    ]
    const relationships = toRelationshipEdges(edges, { e1: 'one-to-one' })
    expect(relationships).toHaveLength(1)
    expect(relationships[0].type).toBe('one-to-one')

    const doc = buildJoinedDocument('a', 0, tables, relationships)
    expect(doc).toEqual({ A: { id: 1, b_id: 10, B: { id: 10, val: 'x' } } })
  })
})
