import { Router } from 'express'
import { AzureOpenAI } from 'openai'
import '@azure/openai/types'
import crypto from 'crypto'
import { saveAdvisorSession, updateAdvisorFeedback, type AdvisorSession } from './cosmosdb.js'
import { buildSystemPrompt, estimateTokens } from './skills.js'

const includeCodeExamples = process.env.SKILL_INCLUDE_CODE_EXAMPLES === 'true'
const systemPrompt = buildSystemPrompt({ includeCodeExamples })
console.log(`[Skills] System prompt loaded (≈${estimateTokens({ includeCodeExamples })} tokens, code examples: ${includeCodeExamples})`)

export const advisorRouter = Router()

function detectPhase(text: string): string {
  if (text.includes('"warnings"')) return 'Checking for warnings…'
  if (text.includes('"tradeoffs"')) return 'Evaluating trade-offs…'
  if (text.includes('"globalSettings"')) return 'Recommending global settings…'
  if (text.includes('"changeFeedPatterns"')) return 'Planning change feed patterns…'
  if (text.includes('"reasoning"')) return 'Generating reasoning…'
  if (text.includes('"indexingPolicy"')) return 'Configuring indexes…'
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_completion_tokens: 16384,
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
          saveAdvisorSession({ id: sessionId, sessionId, timestamp: new Date().toISOString(), deployment, input: { schema, operations, additionalContext }, output: null, error: 'No response from Azure OpenAI', durationMs: Date.now() - startTime })
        } else {
          try {
            const parsed = JSON.parse(accumulated)
            console.log('[Advisor] → Result: ', parsed.containers?.length ?? 0, 'containers')
            send('result', { ...parsed, sessionId })
            saveAdvisorSession({ id: sessionId, sessionId, timestamp: new Date().toISOString(), deployment, input: { schema, operations, additionalContext }, output: parsed, error: null, durationMs: Date.now() - startTime })
          } catch (parseErr: any) {
            console.error('[Advisor] JSON parse error:', parseErr.message)
            console.error('[Advisor] Raw content (first 500 chars):', accumulated.slice(0, 500))
            send('error', { error: 'Failed to parse model response' })
            saveAdvisorSession({ id: sessionId, sessionId, timestamp: new Date().toISOString(), deployment, input: { schema, operations, additionalContext }, output: null, error: `JSON parse error: ${parseErr.message}`, durationMs: Date.now() - startTime })
          }
        }
      }
    } catch (streamErr: any) {
      console.error('[Advisor] Stream error:', streamErr.message ?? streamErr)
      send('error', { error: streamErr.message ?? 'Failed to get model response' })
      saveAdvisorSession({ id: sessionId, sessionId, timestamp: new Date().toISOString(), deployment, input: { schema, operations, additionalContext }, output: null, error: streamErr.message ?? 'Stream error', durationMs: Date.now() - startTime })
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

advisorRouter.post('/advisor/feedback', async (req, res) => {
  console.log('[Advisor] ← POST /advisor/feedback received')
  const { sessionId, rating, comment } = req.body

  if (!sessionId || typeof rating !== 'string' || !['up', 'down'].includes(rating)) {
    res.status(400).json({ error: 'Missing or invalid fields: sessionId, rating (up|down)' })
    return
  }

  try {
    await updateAdvisorFeedback(sessionId, { rating: rating as 'up' | 'down', comment: comment ?? '' })
    res.json({ ok: true })
  } catch (err: any) {
    console.error('[Advisor] Failed to save feedback:', err.message)
    res.status(500).json({ error: 'Failed to save feedback' })
  }
})
