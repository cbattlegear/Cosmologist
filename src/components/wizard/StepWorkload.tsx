import type { WorkloadProfile, TableSchema, RelationshipSchema } from '../../lib/advisorTypes'

interface Props {
  tables: TableSchema[]
  relationships: RelationshipSchema[]
  selectedTableIds: Set<string>
  workload: WorkloadProfile
  onUpdate: (workload: WorkloadProfile) => void
}

export default function StepWorkload({ tables, relationships, selectedTableIds, workload, onUpdate }: Props) {
  const selectedTables = tables.filter((t) => selectedTableIds.has(t.id))

  const selectedRels = relationships.filter(
    (r) => selectedTableIds.has(r.sourceTableId) && selectedTableIds.has(r.targetTableId)
  )

  return (
    <div className="wizard-step">
      <h4>Workload Characteristics</h4>
      <p className="wizard-step__desc">
        Describe your expected workload to help optimize partition keys and data distribution.
      </p>

      <div className="wizard-field-row">
        <label>Read/Write ratio:</label>
        <div className="wizard-radio-group">
          {(['read-heavy', 'balanced', 'write-heavy'] as const).map((r) => (
            <label key={r} className="wizard-radio">
              <input
                type="radio"
                name="rw-ratio"
                checked={workload.readWriteRatio === r}
                onChange={() => onUpdate({ ...workload, readWriteRatio: r })}
              />
              {r}
            </label>
          ))}
        </div>
      </div>

      <div className="wizard-field-row">
        <label>Multi-region deployment?</label>
        <div className="wizard-radio-group">
          <label className="wizard-radio">
            <input
              type="radio"
              name="multi-region"
              checked={workload.multiRegion}
              onChange={() => onUpdate({ ...workload, multiRegion: true })}
            />
            Yes
          </label>
          <label className="wizard-radio">
            <input
              type="radio"
              name="multi-region"
              checked={!workload.multiRegion}
              onChange={() => onUpdate({ ...workload, multiRegion: false })}
            />
            No
          </label>
        </div>
      </div>

      <div className="wizard-field-row">
        <label>Max RU budget (optional):</label>
        <input
          className="wizard-input wizard-input--narrow"
          type="number"
          placeholder="e.g., 10000"
          value={workload.maxRUBudget ?? ''}
          onChange={(e) =>
            onUpdate({
              ...workload,
              maxRUBudget: e.target.value ? parseInt(e.target.value, 10) : undefined,
            })
          }
        />
        <small>RU/s</small>
      </div>

      <h5 className="wizard-subsection">Estimated Item Counts</h5>
      <div className="wizard-item-counts">
        {selectedTables.map((t) => (
          <div key={t.id} className="wizard-field-row wizard-field-row--compact">
            <label>{t.name}:</label>
            <select
              className="wizard-select"
              value={workload.estimatedItemsPerTable[t.id] ?? 'thousands'}
              onChange={(e) =>
                onUpdate({
                  ...workload,
                  estimatedItemsPerTable: {
                    ...workload.estimatedItemsPerTable,
                    [t.id]: e.target.value as 'hundreds' | 'thousands' | 'millions' | 'billions',
                  },
                })
              }
            >
              <option value="hundreds">Hundreds</option>
              <option value="thousands">Thousands</option>
              <option value="millions">Millions</option>
              <option value="billions">Billions</option>
            </select>
          </div>
        ))}
      </div>

      {selectedRels.length > 0 && (
        <>
          <h5 className="wizard-subsection">Data Growth Patterns</h5>
          <div className="wizard-growth-patterns">
            {selectedRels.map((r) => {
              const src = tables.find((t) => t.id === r.sourceTableId)?.name ?? r.sourceTableId
              const tgt = tables.find((t) => t.id === r.targetTableId)?.name ?? r.targetTableId
              return (
                <div key={r.id} className="wizard-field-row wizard-field-row--compact">
                  <label>{src} → {tgt}:</label>
                  <select
                    className="wizard-select"
                    value={workload.growthPatterns[r.id] ?? 'slow'}
                    onChange={(e) =>
                      onUpdate({
                        ...workload,
                        growthPatterns: {
                          ...workload.growthPatterns,
                          [r.id]: e.target.value as 'static' | 'slow' | 'fast',
                        },
                      })
                    }
                  >
                    <option value="static">Static (rarely changes)</option>
                    <option value="slow">Slow growth</option>
                    <option value="fast">Fast growth</option>
                  </select>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div className="wizard-field-row">
        <label>Additional context (optional):</label>
        <textarea
          className="wizard-textarea"
          placeholder="Any other workload details, constraints, or requirements..."
          value={workload.additionalContext ?? ''}
          onChange={(e) => onUpdate({ ...workload, additionalContext: e.target.value })}
          rows={3}
        />
      </div>
    </div>
  )
}
