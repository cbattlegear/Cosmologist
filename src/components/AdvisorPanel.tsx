import { useState, useCallback } from 'react'
import type {
  AdvisorSchemaInput,
  QueryPattern,
  OperationType,
  OperationFrequency,
  ResultSize,
  AdvisorResponse,
} from '../lib/advisorTypes'
import './AdvisorPanel.css'

interface Props {
  schema: AdvisorSchemaInput
  onResult: (response: AdvisorResponse) => void
  onClose: () => void
  apiBaseUrl?: string
}

const DEFAULT_PATTERN: QueryPattern = {
  name: '',
  type: 'query',
  frequency: 'warm',
  description: '',
  filters: [],
  sortFields: [],
  resultSize: 'small',
}

export default function AdvisorPanel({ schema, onResult, onClose, apiBaseUrl = '/api' }: Props) {
  const [operations, setOperations] = useState<QueryPattern[]>([{ ...DEFAULT_PATTERN }])
  const [additionalContext, setAdditionalContext] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const updateOp = useCallback((idx: number, patch: Partial<QueryPattern>) => {
    setOperations((prev) => prev.map((op, i) => (i === idx ? { ...op, ...patch } : op)))
  }, [])

  const addOp = useCallback(() => {
    setOperations((prev) => [...prev, { ...DEFAULT_PATTERN }])
  }, [])

  const removeOp = useCallback((idx: number) => {
    setOperations((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const handleSubmit = useCallback(async () => {
    const valid = operations.filter((op) => op.name.trim() && op.description.trim())
    if (!valid.length) {
      setError('Add at least one operation with a name and description.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${apiBaseUrl}/advisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema,
          operations: valid.map((op) => ({
            ...op,
            filters: op.filters?.filter((f) => f.trim()),
            sortFields: op.sortFields?.filter((f) => f.trim()),
          })),
          additionalContext: additionalContext.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Server error (${res.status})`)
      }
      const data: AdvisorResponse = await res.json()
      onResult(data)
    } catch (err: any) {
      setError(err.message ?? 'Failed to get recommendation')
    } finally {
      setLoading(false)
    }
  }, [schema, operations, additionalContext, apiBaseUrl, onResult])

  const allColumns = schema.tables.flatMap((t) => t.columns.map((c) => `${t.name}.${c.name}`))

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__content advisor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3>CosmosDB Data Model Advisor</h3>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="modal__body advisor-body">
          {/* Schema summary */}
          <section className="advisor-section">
            <h4>Schema (auto-extracted from canvas)</h4>
            <div className="advisor-schema-summary">
              {schema.tables.map((t) => (
                <div key={t.id} className="advisor-table-chip">
                  <strong>{t.name}</strong>
                  <span className="advisor-col-count">{t.columns.length} cols</span>
                </div>
              ))}
            </div>
            {schema.relationships.length > 0 && (
              <div className="advisor-rels">
                {schema.relationships.map((r, i) => (
                  <span key={i} className="advisor-rel-chip">
                    {r.sourceTable}.{r.sourceColumn} → {r.targetTable}.{r.targetColumn}
                    <small>({r.type})</small>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Operations */}
          <section className="advisor-section">
            <h4>Expected Operations & Query Patterns</h4>
            {operations.map((op, idx) => (
              <div key={idx} className="advisor-op">
                <div className="advisor-op__header">
                  <span className="advisor-op__num">#{idx + 1}</span>
                  {operations.length > 1 && (
                    <button className="advisor-op__remove" onClick={() => removeOp(idx)} aria-label="Remove operation">×</button>
                  )}
                </div>
                <div className="advisor-op__grid">
                  <label>
                    Name
                    <input
                      type="text"
                      value={op.name}
                      onChange={(e) => updateOp(idx, { name: e.target.value })}
                      placeholder="e.g. Get user orders"
                    />
                  </label>
                  <label>
                    Type
                    <select value={op.type} onChange={(e) => updateOp(idx, { type: e.target.value as OperationType })}>
                      <option value="point-read">Point Read</option>
                      <option value="query">Query</option>
                      <option value="write">Write</option>
                      <option value="delete">Delete</option>
                    </select>
                  </label>
                  <label>
                    Frequency
                    <select value={op.frequency} onChange={(e) => updateOp(idx, { frequency: e.target.value as OperationFrequency })}>
                      <option value="hot">Hot (very frequent)</option>
                      <option value="warm">Warm (moderate)</option>
                      <option value="cold">Cold (rare)</option>
                    </select>
                  </label>
                  <label>
                    Result Size
                    <select value={op.resultSize ?? 'small'} onChange={(e) => updateOp(idx, { resultSize: e.target.value as ResultSize })}>
                      <option value="single">Single document</option>
                      <option value="small">Small set</option>
                      <option value="large">Large set</option>
                    </select>
                  </label>
                </div>
                <label className="advisor-op__desc">
                  Description
                  <textarea
                    value={op.description}
                    onChange={(e) => updateOp(idx, { description: e.target.value })}
                    placeholder="Describe the operation: what data is read/written, any conditions..."
                    rows={2}
                  />
                </label>
                <div className="advisor-op__filters">
                  <label>
                    Filter columns
                    <input
                      type="text"
                      value={op.filters?.join(', ') ?? ''}
                      onChange={(e) => updateOp(idx, { filters: e.target.value.split(',').map((s) => s.trim()) })}
                      placeholder="e.g. Users.id, Orders.status"
                      list={`advisor-cols-${idx}`}
                    />
                    <datalist id={`advisor-cols-${idx}`}>
                      {allColumns.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </label>
                  <label>
                    Sort fields
                    <input
                      type="text"
                      value={op.sortFields?.join(', ') ?? ''}
                      onChange={(e) => updateOp(idx, { sortFields: e.target.value.split(',').map((s) => s.trim()) })}
                      placeholder="e.g. Orders.createdAt"
                    />
                  </label>
                </div>
              </div>
            ))}
            <button className="advisor-add-op" onClick={addOp}>+ Add Operation</button>
          </section>

          {/* Additional context */}
          <section className="advisor-section">
            <h4>Additional Context (optional)</h4>
            <textarea
              className="advisor-context"
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              placeholder="Business rules, expected data volumes, consistency requirements, geographic distribution..."
              rows={3}
            />
          </section>

          {error && <div className="advisor-error">{error}</div>}
        </div>
        <div className="modal__footer">
          <button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Analyzing…' : 'Get Recommendation'}
          </button>
        </div>
      </div>
    </div>
  )
}
