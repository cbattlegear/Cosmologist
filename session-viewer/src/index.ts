import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { CosmosClient } from '@azure/cosmos'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = parseInt(process.env.PORT ?? '3002', 10)

// ── Cosmos DB ──
const endpoint = process.env.COSMOS_DB_ENDPOINT
const key = process.env.COSMOS_DB_KEY

if (!endpoint || !key) {
  console.error('COSMOS_DB_ENDPOINT and COSMOS_DB_KEY are required')
  process.exit(1)
}

const client = new CosmosClient({ endpoint, key })
const container = client.database('cosmologist').container('advisor-sessions')

// ── API routes ──

app.get('/api/sessions', async (_req, res) => {
  try {
    const { resources } = await container.items
      .query({
        query:
          'SELECT c.id, c.sessionId, c.timestamp, c.durationMs, c.error, c.feedback FROM c ORDER BY c.timestamp DESC',
      })
      .fetchAll()
    res.json(resources)
  } catch (err: any) {
    console.error('[Sessions] List error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/sessions/:id', async (req, res) => {
  try {
    const { resource } = await container.item(req.params.id, req.params.id).read()
    if (!resource) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    res.json(resource)
  } catch (err: any) {
    console.error('[Sessions] Get error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// ── Static files ──
app.use(express.static(path.join(__dirname, '..', 'public')))
app.get('{*path}', (_req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html')),
)

app.listen(PORT, () => console.log(`Session Viewer running on http://localhost:${PORT}`))
