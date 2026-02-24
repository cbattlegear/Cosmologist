import { CosmosClient, Container } from '@azure/cosmos'

const DATABASE_ID = 'cosmologist'
const CONTAINER_ID = 'advisor-sessions'

let _container: Container | null = null

function getContainer(): Container | null {
  if (_container) return _container

  const endpoint = process.env.COSMOS_DB_ENDPOINT
  const key = process.env.COSMOS_DB_KEY

  if (!endpoint || !key) {
    console.warn('[CosmosDB] COSMOS_DB_ENDPOINT / COSMOS_DB_KEY not configured — session logging disabled')
    return null
  }

  const client = new CosmosClient({ endpoint, key })
  _container = client.database(DATABASE_ID).container(CONTAINER_ID)
  return _container
}

export interface AdvisorSession {
  id: string
  sessionId: string
  timestamp: string
  input: {
    schema: unknown
    operations: unknown[]
    additionalContext?: string
  }
  output: {
    containers: unknown[]
    reasoning: string
    tradeoffs?: string[]
    warnings?: string[]
  } | null
  error: string | null
  durationMs: number
}

export async function saveAdvisorSession(session: AdvisorSession): Promise<void> {
  const container = getContainer()
  if (!container) return

  try {
    await container.items.create(session)
    console.log(`[CosmosDB] Saved advisor session ${session.id}`)
  } catch (err: any) {
    console.error(`[CosmosDB] Failed to save session ${session.id}:`, err.message)
  }
}
