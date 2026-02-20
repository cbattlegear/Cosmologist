import { describe, it, expect } from 'vitest'
import { buildPrompt } from './prompt'
import type { AdvisorRequest } from '../types'

describe('buildPrompt', () => {
  const request: AdvisorRequest = {
    tables: [
      {
        id: 't1',
        name: 'Users',
        columns: [
          { name: 'UserId', type: 'string' },
          { name: 'Name', type: 'string' },
          { name: 'Email', type: 'string' },
        ],
        rowCount: 1000,
      },
      {
        id: 't2',
        name: 'Orders',
        columns: [
          { name: 'OrderId', type: 'string' },
          { name: 'UserId', type: 'string' },
          { name: 'Total', type: 'number' },
        ],
        rowCount: 50000,
      },
    ],
    relationships: [
      {
        id: 'r1',
        sourceTableId: 't1',
        targetTableId: 't2',
        sourceColumn: 'UserId',
        targetColumn: 'UserId',
        type: 'one-to-many',
      },
    ],
    accessPatterns: [
      {
        id: 'ap1',
        name: 'Get user with recent orders',
        operationType: 'query',
        targetTables: ['t1', 't2'],
        filterFields: ['Users.UserId'],
        frequency: 'high',
        description: 'Used on the user profile page',
      },
    ],
    workload: {
      readWriteRatio: 'read-heavy',
      estimatedItemsPerTable: { t1: 'thousands', t2: 'millions' },
      growthPatterns: { r1: 'fast' },
      multiRegion: false,
      maxRUBudget: 10000,
    },
  }

  it('generates system and user prompts', () => {
    const { systemPrompt, userPrompt } = buildPrompt(request)

    expect(systemPrompt).toContain('CosmosDB')
    expect(systemPrompt).toContain('embed')
    expect(systemPrompt).toContain('partition')
    expect(systemPrompt).toContain('JSON')
  })

  it('includes table names and columns in user prompt', () => {
    const { userPrompt } = buildPrompt(request)

    expect(userPrompt).toContain('Users')
    expect(userPrompt).toContain('Orders')
    expect(userPrompt).toContain('UserId')
    expect(userPrompt).toContain('1000 rows')
  })

  it('includes relationships in user prompt', () => {
    const { userPrompt } = buildPrompt(request)

    expect(userPrompt).toContain('Users.UserId')
    expect(userPrompt).toContain('Orders.UserId')
    expect(userPrompt).toContain('one-to-many')
  })

  it('includes access patterns in user prompt', () => {
    const { userPrompt } = buildPrompt(request)

    expect(userPrompt).toContain('Get user with recent orders')
    expect(userPrompt).toContain('query')
    expect(userPrompt).toContain('high')
    expect(userPrompt).toContain('user profile page')
  })

  it('includes workload characteristics in user prompt', () => {
    const { userPrompt } = buildPrompt(request)

    expect(userPrompt).toContain('read-heavy')
    expect(userPrompt).toContain('10000')
    expect(userPrompt).toContain('fast growth')
  })
})
