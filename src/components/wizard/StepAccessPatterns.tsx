import { useCallback } from 'react'
import type { AccessPattern, TableSchema } from '../../lib/advisorTypes'

interface Props {
  tables: TableSchema[]
  selectedTableIds: Set<string>
  patterns: AccessPattern[]
  onUpdate: (patterns: AccessPattern[]) => void
}

let nextId = 1

function makePattern(): AccessPattern {
  return {
    id: `ap-${nextId++}`,
    name: '',
    operationType: 'read',
    targetTables: [],
    filterFields: [],
    frequency: 'medium',
    description: '',
  }
}

export default function StepAccessPatterns({ tables, selectedTableIds, patterns, onUpdate }: Props) {
  const selectedTables = tables.filter((t) => selectedTableIds.has(t.id))

  const addPattern = useCallback(() => {
    onUpdate([...patterns, makePattern()])
  }, [patterns, onUpdate])

  const removePattern = useCallback(
    (id: string) => {
      onUpdate(patterns.filter((p) => p.id !== id))
    },
    [patterns, onUpdate]
  )

  const updatePattern = useCallback(
    (id: string, patch: Partial<AccessPattern>) => {
      onUpdate(patterns.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    },
    [patterns, onUpdate]
  )

  const toggleTargetTable = useCallback(
    (patternId: string, tableId: string) => {
      const pattern = patterns.find((p) => p.id === patternId)
      if (!pattern) return
      const has = pattern.targetTables.includes(tableId)
      updatePattern(patternId, {
        targetTables: has
          ? pattern.targetTables.filter((t) => t !== tableId)
          : [...pattern.targetTables, tableId],
      })
    },
    [patterns, updatePattern]
  )

  const toggleFilterField = useCallback(
    (patternId: string, field: string) => {
      const pattern = patterns.find((p) => p.id === patternId)
      if (!pattern) return
      const has = pattern.filterFields.includes(field)
      updatePattern(patternId, {
        filterFields: has
          ? pattern.filterFields.filter((f) => f !== field)
          : [...pattern.filterFields, field],
      })
    },
    [patterns, updatePattern]
  )

  // Columns available from selected target tables
  const getColumnsForPattern = (pattern: AccessPattern) => {
    return selectedTables
      .filter((t) => pattern.targetTables.includes(t.id))
      .flatMap((t) => t.columns.map((c) => `${t.name}.${c.name}`))
  }

  return (
    <div className="wizard-step">
      <h4>Define Access Patterns</h4>
      <p className="wizard-step__desc">
        Describe the operations your application performs. This helps determine embedding vs referencing strategies.
      </p>

      {patterns.map((p, i) => {
        const availableCols = getColumnsForPattern(p)
        return (
          <div key={p.id} className="wizard-pattern-card">
            <div className="wizard-pattern-card__header">
              <span className="wizard-pattern-num">#{i + 1}</span>
              <input
                className="wizard-input"
                type="text"
                placeholder="Operation name (e.g., Get user with orders)"
                value={p.name}
                onChange={(e) => updatePattern(p.id, { name: e.target.value })}
              />
              <button
                className="wizard-remove-btn"
                onClick={() => removePattern(p.id)}
                title="Remove pattern"
              >
                ✕
              </button>
            </div>

            <div className="wizard-pattern-card__body">
              <div className="wizard-field-row">
                <label>Type:</label>
                <select
                  className="wizard-select"
                  value={p.operationType}
                  onChange={(e) =>
                    updatePattern(p.id, {
                      operationType: e.target.value as AccessPattern['operationType'],
                    })
                  }
                >
                  <option value="read">Read (point lookup)</option>
                  <option value="query">Query (filter/scan)</option>
                  <option value="write">Write (insert/update)</option>
                  <option value="aggregation">Aggregation</option>
                </select>
              </div>

              <div className="wizard-field-row">
                <label>Frequency:</label>
                <div className="wizard-radio-group">
                  {(['low', 'medium', 'high', 'critical'] as const).map((f) => (
                    <label key={f} className="wizard-radio">
                      <input
                        type="radio"
                        name={`freq-${p.id}`}
                        checked={p.frequency === f}
                        onChange={() => updatePattern(p.id, { frequency: f })}
                      />
                      {f}
                    </label>
                  ))}
                </div>
              </div>

              <div className="wizard-field-row">
                <label>Target tables:</label>
                <div className="wizard-chip-group">
                  {selectedTables.map((t) => (
                    <button
                      key={t.id}
                      className={`wizard-chip ${p.targetTables.includes(t.id) ? 'wizard-chip--active' : ''}`}
                      onClick={() => toggleTargetTable(p.id, t.id)}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              {availableCols.length > 0 && (
                <div className="wizard-field-row">
                  <label>Filter fields:</label>
                  <div className="wizard-chip-group">
                    {availableCols.map((col) => (
                      <button
                        key={col}
                        className={`wizard-chip ${p.filterFields.includes(col) ? 'wizard-chip--active' : ''}`}
                        onClick={() => toggleFilterField(p.id, col)}
                      >
                        {col}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="wizard-field-row">
                <label>Notes (optional):</label>
                <input
                  className="wizard-input"
                  type="text"
                  placeholder="Additional context about this operation"
                  value={p.description ?? ''}
                  onChange={(e) => updatePattern(p.id, { description: e.target.value })}
                />
              </div>
            </div>
          </div>
        )
      })}

      <button className="wizard-add-btn" onClick={addPattern}>
        + Add Access Pattern
      </button>

      {patterns.length === 0 && (
        <p className="wizard-hint">Add at least one access pattern to continue.</p>
      )}
    </div>
  )
}
