import { Router } from 'express'
import { AzureOpenAI } from 'openai'
import '@azure/openai/types'
import crypto from 'crypto'
import { saveAdvisorSession, type AdvisorSession } from './cosmosdb.js'

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

function detectPhase(text: string): string {
  if (text.includes('"warnings"')) return 'Checking for warnings…'
  if (text.includes('"tradeoffs"')) return 'Evaluating trade-offs…'
  if (text.includes('"reasoning"')) return 'Generating reasoning…'
  if (text.includes('"embeddedEntities"')) return 'Modeling embedded entities…'
  if (text.includes('"containers"')) return 'Designing containers…'
  return 'Analyzing schema…'
}

advisorRouter.post('/advisor', async (req, res) => {
  console.log('[Advisor] ← POST /advisor received')
  const sessionId = crypto.randomUUID()
  const startTime = Date.now()
  try {
    const { schema, operations, additionalContext } = req.body
    console.log('[Advisor] Tables:', schema?.tables?.length ?? 0, '| Ops:', operations?.length ?? 0)

    if (!schema || !operations) {
      console.log('[Advisor] → 400 missing fields')
      res.status(400).json({ error: 'Missing required fields: schema, operations' })
      return
    }

    const endpoint = process.env.AZURE_OPENAI_ENDPOINT
    const apiKey = process.env.AZURE_OPENAI_API_KEY
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o'
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-12-01-preview'

    if (!endpoint || !apiKey) {
      console.log('[Advisor] → 500 Azure OpenAI not configured')
      res.status(500).json({ error: 'Azure OpenAI is not configured' })
      return
    }

    console.log('[Advisor] Azure OpenAI endpoint:', endpoint)
    console.log('[Advisor] Deployment:', deployment, '| API version:', apiVersion)

    // SSE: send headers + first event together so proxies don't treat it as complete
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    })

    const send = (event: string, data: unknown) => {
      console.log(`[Advisor] → SSE event: ${event}`)
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    send('status', { message: 'Warming up…' })
    console.log('[Advisor] Initial SSE event sent')

    // Send SSE keepalive comments to prevent proxy/browser from closing the connection
    const keepalive = setInterval(() => {
      console.log('[Advisor] → keepalive ping')
      res.write(': keepalive\n\n')
    }, 5_000)

    const client = new AzureOpenAI({ endpoint, apiKey, apiVersion })
    const userMessage = buildUserMessage(schema, operations, additionalContext)
    console.log('[Advisor] User message length:', userMessage.length, 'chars')

    let aborted = false
    const t0 = Date.now()
    res.on('close', () => {
      console.log(`[Advisor] Client disconnected after ${Date.now() - t0}ms`)
      aborted = true
    })

    try {
      console.log('[Advisor] Creating OpenAI stream…')
      const stream = await client.chat.completions.create({
        model: deployment,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_completion_tokens: 4096,
        response_format: { type: 'json_object' },
        stream: true,
      })
      console.log('[Advisor] OpenAI stream created, reading chunks…')

      let accumulated = ''
      let lastPhase = ''
      let chunkCount = 0

      for await (const chunk of stream) {
        if (aborted) break
        chunkCount++
        const delta = chunk.choices?.[0]?.delta?.content ?? ''
        if (!delta) continue
        accumulated += delta

        const phase = detectPhase(accumulated)
        if (phase !== lastPhase) {
          console.log(`[Advisor] Phase: ${phase} (after ${chunkCount} chunks, ${accumulated.length} chars)`)
          send('status', { message: phase })
          lastPhase = phase
        }
      }

      console.log(`[Advisor] Stream done: ${chunkCount} chunks, ${accumulated.length} chars, aborted=${aborted}`)

      if (!aborted) {
        if (!accumulated) {
          console.log('[Advisor] → No content from LLM')
          send('error', { error: 'No response from Azure OpenAI' })
          saveAdvisorSession({ id: sessionId, sessionId, timestamp: new Date().toISOString(), input: { schema, operations, additionalContext }, output: null, error: 'No response from Azure OpenAI', durationMs: Date.now() - startTime })
        } else {
          try {
            const parsed = JSON.parse(accumulated)
            console.log('[Advisor] → Result: ', parsed.containers?.length ?? 0, 'containers')
            send('result', parsed)
            saveAdvisorSession({ id: sessionId, sessionId, timestamp: new Date().toISOString(), input: { schema, operations, additionalContext }, output: parsed, error: null, durationMs: Date.now() - startTime })
          } catch (parseErr: any) {
            console.error('[Advisor] JSON parse error:', parseErr.message)
            console.error('[Advisor] Raw content (first 500 chars):', accumulated.slice(0, 500))
            send('error', { error: 'Failed to parse model response' })
            saveAdvisorSession({ id: sessionId, sessionId, timestamp: new Date().toISOString(), input: { schema, operations, additionalContext }, output: null, error: `JSON parse error: ${parseErr.message}`, durationMs: Date.now() - startTime })
          }
        }
      }
    } catch (streamErr: any) {
      console.error('[Advisor] Stream error:', streamErr.message ?? streamErr)
      send('error', { error: streamErr.message ?? 'Failed to get model response' })
      saveAdvisorSession({ id: sessionId, sessionId, timestamp: new Date().toISOString(), input: { schema, operations, additionalContext }, output: null, error: streamErr.message ?? 'Stream error', durationMs: Date.now() - startTime })
    } finally {
      clearInterval(keepalive)
    }

    console.log('[Advisor] → Response complete')
    res.end()
  } catch (err: any) {
    console.error('[Advisor] Unhandled error:', err)
    // If headers already sent (SSE mode), send error event
    if (res.headersSent) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message ?? 'Internal server error' })}\n\n`)
      res.end()
    } else {
      res.status(500).json({ error: err.message ?? 'Internal server error' })
    }
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
