import { describe, it, expect } from 'vitest'
import { extractSchemaForAdvisor } from './extractSchema'
import type { TableData } from './types'
import type { Edge } from 'reactflow'

describe('extractSchemaForAdvisor', () => {
  const tables: TableData[] = [
    {
      id: 'users',
      name: 'Users',
      fileName: 'users.csv',
      columns: ['id', 'name', 'email'],
      rows: [],
      primaryKeys: ['id'],
      columnTypes: {
        id: { dataType: 'int', isPrimaryKey: true },
        name: { dataType: 'nvarchar' },
        email: { dataType: 'nvarchar' },
      },
    },
    {
      id: 'orders',
      name: 'Orders',
      fileName: 'orders.csv',
      columns: ['orderId', 'userId', 'total'],
      rows: [],
      primaryKeys: ['orderId'],
      columnTypes: {
        orderId: { dataType: 'int', isPrimaryKey: true },
        userId: { dataType: 'int' },
        total: { dataType: 'decimal' },
      },
    },
  ]

  const edges: Edge[] = [
    {
      id: 'e1',
      source: 'users',
      target: 'orders',
      sourceHandle: 'id',
      targetHandle: 'userId',
      data: { type: 'one-to-many' },
    },
  ]

  it('extracts tables with column info', () => {
    const result = extractSchemaForAdvisor(tables, edges)
    expect(result.tables).toHaveLength(2)

    const usersTable = result.tables.find((t) => t.name === 'Users')!
    expect(usersTable.columns).toHaveLength(3)
    expect(usersTable.columns[0]).toEqual({ name: 'id', dataType: 'int', isPrimaryKey: true })
  })

  it('extracts relationships', () => {
    const result = extractSchemaForAdvisor(tables, edges)
    expect(result.relationships).toHaveLength(1)
    expect(result.relationships[0]).toEqual({
      sourceTable: 'Users',
      targetTable: 'Orders',
      sourceColumn: 'id',
      targetColumn: 'userId',
      type: 'one-to-many',
    })
  })

  it('uses edgeTypes override', () => {
    const result = extractSchemaForAdvisor(tables, edges, { e1: 'one-to-one' })
    expect(result.relationships[0].type).toBe('one-to-one')
  })

  it('handles tables without column types', () => {
    const simpleTables: TableData[] = [
      { id: 't1', name: 'Simple', fileName: 'simple.csv', columns: ['a', 'b'], rows: [] },
    ]
    const result = extractSchemaForAdvisor(simpleTables, [])
    expect(result.tables[0].columns).toEqual([
      { name: 'a', dataType: undefined, isPrimaryKey: undefined },
      { name: 'b', dataType: undefined, isPrimaryKey: undefined },
    ])
  })

  it('skips edges without handles', () => {
    const badEdges: Edge[] = [{ id: 'e2', source: 'users', target: 'orders' }]
    const result = extractSchemaForAdvisor(tables, badEdges)
    expect(result.relationships).toHaveLength(0)
  })
})
