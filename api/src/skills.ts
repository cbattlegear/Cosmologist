import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SKILLS_DIR = path.resolve(__dirname, '..', 'skills', 'cosmosdb-best-practices')

let cachedRules: string | null = null
let cachedMetadata: { version: string; organization: string } | null = null

function loadAgentsMd(): string {
  if (cachedRules) return cachedRules
  const filePath = path.join(SKILLS_DIR, 'AGENTS.md')
  cachedRules = fs.readFileSync(filePath, 'utf-8')
  return cachedRules
}

function loadMetadata(): { version: string; organization: string } {
  if (cachedMetadata) return cachedMetadata
  const filePath = path.join(SKILLS_DIR, 'metadata.json')
  cachedMetadata = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  return cachedMetadata!
}

/**
 * Strip fenced code blocks from markdown to reduce token count.
 * Preserves rule titles, impact levels, descriptions, and guidance text.
 */
function condense(md: string): string {
  return md.replace(/```[\s\S]*?```/g, '_(code example omitted for brevity)_')
}

const INSTRUCTION_PREAMBLE = `You are a Cosmos DB NoSQL data modeling expert. Given a relational database schema and expected query/access patterns, recommend an optimal Cosmos DB NoSQL document model.

Apply the best practices from the reference guide below. Use the rules to inform your decisions about:
- Embedding vs referencing data (access correlation, bounded vs unbounded growth, update frequency)
- Partition key selection (high cardinality, even distribution, query pattern alignment)
- Hierarchical partition keys when a single-level key hits 20GB limits or when multi-level queries are needed
- Indexing policies (composite indexes for ORDER BY, excluding unused paths)
- TTL for time-scoped data (logs, sessions, events)
- Change feed patterns for materialized views or denormalization sync
- Document size management (stay well under 2MB, target <100KB)
- Type discriminators when co-locating multiple entity types in one container
- Schema versioning for safe evolution

Be thorough in your reasoning. Explain WHY each decision was made, citing specific best practice rules where relevant (e.g. "per rule 1.3 — Embed Related Data Retrieved Together").`

const OUTPUT_SCHEMA = `
Respond ONLY with valid JSON matching this schema:
{
  "containers": [
    {
      "name": "string — container name",
      "partitionKey": "string — partition key path (e.g. /userId)",
      "hierarchicalPartitionKeys": ["string — optional array of partition key paths when hierarchical partitioning is recommended (e.g. ['/tenantId', '/year', '/month']). Omit if a single-level partition key suffices."],
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
      "indexingPolicy": {
        "compositeIndexes": [["string — ordered property paths for multi-field ORDER BY"]],
        "excludedPaths": ["string — paths to exclude from indexing to save RU on writes"],
        "spatialIndexes": ["string — paths needing spatial indexes for geo queries"]
      },
      "ttl": "number | null — default TTL in seconds for time-scoped data, null if not applicable",
      "estimatedDocumentSizeKB": "number — estimated average document size in KB",
      "description": "string — brief description of this container's purpose and primary access patterns"
    }
  ],
  "changeFeedPatterns": [
    {
      "sourceContainer": "string — container emitting changes",
      "targetContainer": "string — container being updated",
      "purpose": "string — e.g. 'materialized view for cross-partition queries', 'denormalization sync', 'event-driven processing'"
    }
  ],
  "globalSettings": {
    "consistencyLevel": "string — recommended consistency level (Strong | BoundedStaleness | Session | ConsistentPrefix | Eventual) with brief justification",
    "multiRegion": "boolean — whether multi-region writes are recommended for this workload",
    "schemaVersioning": "boolean — whether documents should include a schemaVersion field for safe evolution"
  },
  "reasoning": "string — detailed explanation of the design decisions, citing specific best practice rules",
  "tradeoffs": ["string — trade-off 1", "string — trade-off 2"],
  "warnings": ["string — potential issue or consideration"]
}`

export interface SkillPromptOptions {
  /** Include full code examples from the rules. Increases token count significantly. Default: false */
  includeCodeExamples?: boolean
}

export function buildSystemPrompt(options?: SkillPromptOptions): string {
  const meta = loadMetadata()
  const raw = loadAgentsMd()
  const rules = options?.includeCodeExamples ? raw : condense(raw)

  return `${INSTRUCTION_PREAMBLE}

---

## Reference: Azure Cosmos DB Best Practices (v${meta.version}, ${meta.organization})

${rules}

---

${OUTPUT_SCHEMA}`
}

/** Return approximate token count for the system prompt (rough estimate: 1 token ≈ 4 chars). */
export function estimateTokens(options?: SkillPromptOptions): number {
  const prompt = buildSystemPrompt(options)
  return Math.ceil(prompt.length / 4)
}
