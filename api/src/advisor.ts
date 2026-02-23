import { Router } from 'express'
import { AzureOpenAI } from 'openai'
import '@azure/openai/types'

const SYSTEM_PROMPT = `You are a CosmosDB NoSQL data modeling expert. Given a relational database schema and expected query/access patterns, recommend an optimal CosmosDB document model.

Core principles to apply:
- **Embed vs Reference**: Embed data that is read together. Reference data that is updated independently or has unbounded growth.
- **Partition Key Selection**: Choose a partition key that evenly distributes data and aligns with the most frequent query filters. Avoid hot partitions.
- **Denormalization**: Duplicate data across containers when read patterns demand it. Favor read performance over write simplicity.
- **Access Pattern Alignment**: Each container should be optimized for its primary access patterns. A single relational table may split into multiple containers or merge into one.
- **RU Optimization**: Point reads (by id + partition key) cost ~1 RU. Cross-partition queries are expensive. Design to maximize point reads for hot paths.
- **Document Size**: Keep documents under 100KB where possible. Avoid unbounded arrays.
- **Change Feed**: Consider change feed for materializing views or syncing denormalized data.
- **TTL**: Suggest TTL for time-scoped data (logs, sessions, events).

Respond ONLY with valid JSON matching this schema:
{
  "containers": [
    {
      "name": "string — container name",
      "partitionKey": "string — partition key path (e.g. /userId)",
      "properties": [
        { "name": "string", "dataType": "string (optional)", "source": "string — OriginalTable.column (optional)" }
      ],
      "embeddedEntities": [
        {
          "name": "string — embedded array/object name",
          "sourceTable": "string — original table this data comes from",
          "relationship": "one-to-many | one-to-one",
          "properties": [
            { "name": "string", "dataType": "string (optional)", "source": "string (optional)" }
          ]
        }
      ],
      "description": "string — brief description of this container's purpose"
    }
  ],
  "reasoning": "string — detailed explanation of the design decisions",
  "tradeoffs": ["string — trade-off 1", "string — trade-off 2"],
  "warnings": ["string — potential issue or consideration"]
}

Be thorough in your reasoning. Explain WHY each decision was made and how it aligns with the provided access patterns.`

export const advisorRouter = Router()

advisorRouter.post('/advisor', async (req, res) => {
  try {
    const { schema, operations, additionalContext } = req.body

    if (!schema || !operations) {
      res.status(400).json({ error: 'Missing required fields: schema, operations' })
      return
    }

    const endpoint = process.env.AZURE_OPENAI_ENDPOINT
    const apiKey = process.env.AZURE_OPENAI_API_KEY
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o'
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-12-01-preview'

    if (!endpoint || !apiKey) {
      res.status(500).json({ error: 'Azure OpenAI is not configured' })
      return
    }

    const client = new AzureOpenAI({ endpoint, apiKey, apiVersion })

    const userMessage = buildUserMessage(schema, operations, additionalContext)

    const response = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_completion_tokens: 4096,
      response_format: { type: 'json_object' },
    })

    const content = response.choices?.[0]?.message?.content
    console.log('[Advisor] Raw LLM response:', content)
    if (!content) {
      res.status(502).json({ error: 'No response from Azure OpenAI' })
      return
    }

    const parsed = JSON.parse(content)
    console.log('[Advisor] Parsed containers:', parsed.containers?.length ?? 0)
    res.json(parsed)
  } catch (err: any) {
    console.error('Advisor error:', err)
    res.status(500).json({ error: err.message ?? 'Internal server error' })
  }
})

function buildUserMessage(
  schema: any,
  operations: any[],
  additionalContext?: string,
): string {
  const parts: string[] = []

  parts.push('## Relational Schema\n')
  for (const table of schema.tables ?? []) {
    const cols = (table.columns ?? [])
      .map((c: any) => {
        const flags: string[] = []
        if (c.isPrimaryKey) flags.push('PK')
        if (c.dataType) flags.push(c.dataType)
        return flags.length ? `${c.name} (${flags.join(', ')})` : c.name
      })
      .join(', ')
    parts.push(`- **${table.name}**: ${cols}`)
  }

  if (schema.relationships?.length) {
    parts.push('\n## Relationships\n')
    for (const rel of schema.relationships) {
      parts.push(`- ${rel.sourceTable}.${rel.sourceColumn} → ${rel.targetTable}.${rel.targetColumn} (${rel.type})`)
    }
  }

  parts.push('\n## Expected Operations & Query Patterns\n')
  for (const op of operations) {
    const meta = [op.type, op.frequency]
    if (op.resultSize) meta.push(`result: ${op.resultSize}`)
    parts.push(`- **${op.name}** [${meta.join(', ')}]: ${op.description}`)
    if (op.filters?.length) parts.push(`  - Filters: ${op.filters.join(', ')}`)
    if (op.sortFields?.length) parts.push(`  - Sort: ${op.sortFields.join(', ')}`)
  }

  if (additionalContext) {
    parts.push(`\n## Additional Context\n\n${additionalContext}`)
  }

  return parts.join('\n')
}
