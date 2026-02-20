import { describe, it, expect } from 'vitest'
import { parseAdvisorResponse } from './parseResponse.js'

describe('parseAdvisorResponse', () => {
  const validResponse = JSON.stringify({
    containers: [
      {
        name: 'Users',
        partitionKeyPath: '/userId',
        partitionKeyReasoning: 'High cardinality, even distribution',
        documentTypes: [
          {
            typeName: 'user',
            sourceTable: 'Users',
            properties: [
              { name: 'id', sourceColumn: 'UserId', type: 'string' },
              { name: 'name', sourceColumn: 'Name', type: 'string' },
            ],
            embeddedDocuments: [
              {
                propertyName: 'address',
                sourceTable: 'Addresses',
                relationship: 'one-to-one',
                properties: [
                  { name: 'street', sourceColumn: 'Street', type: 'string' },
                ],
                reasoning: 'Address is always queried with user',
              },
            ],
            references: [
              {
                propertyName: 'orderIds',
                targetContainer: 'Orders',
                targetPartitionKey: '/orderId',
                reasoning: 'Orders are unbounded and queried independently',
              },
            ],
          },
        ],
      },
    ],
    recommendations: [
      {
        category: 'embedding',
        title: 'Embed addresses in users',
        reasoning: 'Addresses are always read with users and are 1:1',
        impact: 'Eliminates cross-partition reads, saves 1 RU per user lookup',
        relatedTables: ['Users', 'Addresses'],
      },
      {
        category: 'partition-key',
        title: 'Use userId as partition key',
        reasoning: 'High cardinality and enables point reads',
        impact: 'Point reads at 1 RU instead of cross-partition queries at 5+ RU',
        relatedTables: ['Users'],
      },
    ],
    summary: 'Recommended 1 container with embedded addresses',
    tradeoffs: 'Embedding addresses means updating both when address changes',
  })

  it('parses valid JSON response', () => {
    const result = parseAdvisorResponse(validResponse)
    expect(result.containers).toHaveLength(1)
    expect(result.containers[0].name).toBe('Users')
    expect(result.containers[0].partitionKeyPath).toBe('/userId')
    expect(result.containers[0].documentTypes).toHaveLength(1)
    expect(result.containers[0].documentTypes[0].embeddedDocuments).toHaveLength(1)
    expect(result.containers[0].documentTypes[0].references).toHaveLength(1)
    expect(result.recommendations).toHaveLength(2)
    expect(result.summary).toContain('1 container')
  })

  it('extracts JSON from markdown code fences', () => {
    const wrapped = '```json\n' + validResponse + '\n```'
    const result = parseAdvisorResponse(wrapped)
    expect(result.containers).toHaveLength(1)
  })

  it('throws on empty containers', () => {
    const noContainers = JSON.stringify({
      containers: [],
      recommendations: [],
      summary: '',
      tradeoffs: '',
    })
    expect(() => parseAdvisorResponse(noContainers)).toThrow('no containers')
  })

  it('throws on invalid JSON', () => {
    expect(() => parseAdvisorResponse('not json at all')).toThrow()
  })

  it('provides defaults for missing fields', () => {
    const minimal = JSON.stringify({
      containers: [{ name: 'Test', documentTypes: [] }],
    })
    const result = parseAdvisorResponse(minimal)
    expect(result.containers[0].partitionKeyPath).toBe('/id')
    expect(result.summary).toBe('No summary provided.')
    expect(result.recommendations).toEqual([])
  })

  it('validates recommendation categories', () => {
    const badCategory = JSON.stringify({
      containers: [{ name: 'Test', documentTypes: [] }],
      recommendations: [
        {
          category: 'invalid-category',
          title: 'Test',
          reasoning: 'Test',
          impact: 'None',
          relatedTables: [],
        },
      ],
    })
    const result = parseAdvisorResponse(badCategory)
    expect(result.recommendations[0].category).toBe('warning')
  })
})
