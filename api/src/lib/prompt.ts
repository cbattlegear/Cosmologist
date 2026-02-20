import type { AdvisorRequest } from '../types.js'

const SYSTEM_PROMPT = `You are an expert Azure CosmosDB NoSQL data modeling advisor. Your job is to analyze a relational data model along with access patterns and workload characteristics, then recommend an optimized CosmosDB NoSQL data model.

## CosmosDB Modeling Best Practices

### When to EMBED (denormalize):
- Contained or compositional relationships (parent-child ownership)
- One-to-one relationships
- One-to-few relationships (bounded, small arrays)
- Data that is read together and changes infrequently
- Data that doesn't grow unboundedly

### When to REFERENCE (normalize):
- One-to-many with unbounded or large cardinality
- Many-to-many relationships
- Data that changes frequently and independently
- Data queried independently from its parent
- Very large child documents that would push parent over 2MB limit

### Partition Key Guidelines:
- Choose a property with high cardinality and even distribution
- Optimize for point reads (partition key + id = single partition lookup = 1 RU)
- Avoid cross-partition queries for frequent operations
- Common patterns: use tenantId, userId, or category depending on workload
- Synthetic partition keys (combining fields) can help with distribution

### Container Design:
- Fewer containers is generally better (shared throughput, simpler ops)
- Use a "type" discriminator property to store multiple entity types in one container
- Only separate containers when entities have fundamentally different partition key needs
- Shared throughput containers reduce cost for low-traffic entity types

### Denormalization Strategies:
- Duplicate frequently-read reference data to avoid cross-partition lookups
- Accept data staleness for read optimization (eventual consistency)
- Use Change Feed to propagate updates to denormalized copies
- Store pre-computed aggregates when read frequency >> write frequency

### Change Feed Patterns:
- Materialized views: replicate data across containers with different partition keys
- Event sourcing: track changes for audit or downstream processing
- Cross-container consistency: keep denormalized data in sync

## Output Format

You MUST respond with valid JSON matching this exact structure:
{
  "containers": [
    {
      "name": "string - descriptive container name",
      "partitionKeyPath": "string - e.g. /userId or /tenantId",
      "partitionKeyReasoning": "string - why this partition key was chosen",
      "documentTypes": [
        {
          "typeName": "string - the type discriminator value",
          "sourceTable": "string - original table name this came from",
          "properties": [
            { "name": "string", "sourceColumn": "string", "type": "string" }
          ],
          "embeddedDocuments": [
            {
              "propertyName": "string - property name in parent doc",
              "sourceTable": "string - original table name",
              "relationship": "one-to-one | one-to-few | one-to-many",
              "properties": [
                { "name": "string", "sourceColumn": "string", "type": "string" }
              ],
              "reasoning": "string - why embedding is recommended here"
            }
          ],
          "references": [
            {
              "propertyName": "string - property name holding the reference",
              "targetContainer": "string - referenced container name",
              "targetPartitionKey": "string - partition key of referenced container",
              "reasoning": "string - why referencing instead of embedding"
            }
          ]
        }
      ]
    }
  ],
  "recommendations": [
    {
      "category": "embedding | referencing | partition-key | container-design | denormalization | change-feed | warning",
      "title": "string - short title",
      "reasoning": "string - detailed explanation",
      "impact": "string - expected performance/cost impact",
      "relatedTables": ["string - original table names involved"]
    }
  ],
  "summary": "string - high-level summary of the recommended model",
  "tradeoffs": "string - key trade-offs and considerations"
}

Respond ONLY with the JSON object. No markdown, no code fences, no explanation outside the JSON.`

export function buildPrompt(request: AdvisorRequest): {
  systemPrompt: string
  userPrompt: string
} {
  const { tables, relationships, accessPatterns, workload } = request

  const tableDescriptions = tables
    .map((t) => {
      const cols = t.columns.map((c) => `    ${c.name} (${c.type})`).join('\n')
      return `  Table: ${t.name} (${t.rowCount} rows)\n    Columns:\n${cols}`
    })
    .join('\n\n')

  const relDescriptions = relationships
    .map((r) => {
      const src = tables.find((t) => t.id === r.sourceTableId)?.name ?? r.sourceTableId
      const tgt = tables.find((t) => t.id === r.targetTableId)?.name ?? r.targetTableId
      return `  ${src}.${r.sourceColumn} -> ${tgt}.${r.targetColumn} (${r.type})`
    })
    .join('\n')

  const patternDescriptions = accessPatterns
    .map((p) => {
      const tableNames = p.targetTables
        .map((id) => tables.find((t) => t.id === id)?.name ?? id)
        .join(', ')
      return `  "${p.name}" — ${p.operationType} on [${tableNames}], filter by [${p.filterFields.join(', ')}], frequency: ${p.frequency}${p.description ? `, notes: ${p.description}` : ''}`
    })
    .join('\n')

  const itemCounts = Object.entries(workload.estimatedItemsPerTable)
    .map(([id, count]) => {
      const name = tables.find((t) => t.id === id)?.name ?? id
      return `  ${name}: ${count}`
    })
    .join('\n')

  const growth = Object.entries(workload.growthPatterns)
    .map(([id, rate]) => {
      const name = tables.find((t) => t.id === id)?.name ?? id
      return `  ${name}: ${rate} growth`
    })
    .join('\n')

  const userPrompt = `Analyze this relational data model and recommend an optimized Azure CosmosDB NoSQL data model.

## Tables and Columns
${tableDescriptions}

## Relationships
${relDescriptions}

## Access Patterns (operations the application performs)
${patternDescriptions}

## Workload Characteristics
- Read/Write ratio: ${workload.readWriteRatio}
- Multi-region: ${workload.multiRegion ? 'Yes' : 'No'}
${workload.maxRUBudget ? `- Max RU budget: ${workload.maxRUBudget} RU/s` : ''}

## Estimated Item Counts
${itemCounts}

## Data Growth
${growth}
${workload.additionalContext ? `\n## Additional Context\n${workload.additionalContext}` : ''}

Based on the access patterns and workload, recommend:
1. How many containers to use and what partition keys
2. Which relationships should be embedded vs referenced
3. Any denormalization or Change Feed patterns needed
4. Specific warnings or trade-offs to consider`

  return { systemPrompt: SYSTEM_PROMPT, userPrompt }
}
