import type { AccessPattern, WorkloadProfile, TableSchema, RelationshipSchema } from '../../lib/advisorTypes'

interface Props {
  tables: TableSchema[]
  relationships: RelationshipSchema[]
  selectedTableIds: Set<string>
  patterns: AccessPattern[]
  workload: WorkloadProfile
  onGoToStep: (step: number) => void
}

export default function StepReview({ tables, relationships, selectedTableIds, patterns, workload, onGoToStep }: Props) {
  const selectedTables = tables.filter((t) => selectedTableIds.has(t.id))
  const selectedRels = relationships.filter(
    (r) => selectedTableIds.has(r.sourceTableId) && selectedTableIds.has(r.targetTableId)
  )

  return (
    <div className="wizard-step">
      <h4>Review & Submit</h4>
      <p className="wizard-step__desc">
        Review your inputs before submitting to the CosmosDB advisor.
      </p>

      <div className="wizard-review-section">
        <div className="wizard-review-section__header">
          <h5>Data Model</h5>
          <button className="wizard-edit-link" onClick={() => onGoToStep(0)}>Edit</button>
        </div>
        <p>{selectedTables.length} table{selectedTables.length !== 1 ? 's' : ''} selected, {selectedRels.length} relationship{selectedRels.length !== 1 ? 's' : ''}</p>
        <div className="wizard-review-list">
          {selectedTables.map((t) => (
            <span key={t.id} className="wizard-review-chip">{t.name}</span>
          ))}
        </div>
      </div>

      <div className="wizard-review-section">
        <div className="wizard-review-section__header">
          <h5>Access Patterns ({patterns.length})</h5>
          <button className="wizard-edit-link" onClick={() => onGoToStep(1)}>Edit</button>
        </div>
        {patterns.length === 0 ? (
          <p className="wizard-hint">⚠ No access patterns defined. Go back to add at least one.</p>
        ) : (
          <div className="wizard-review-patterns">
            {patterns.map((p) => (
              <div key={p.id} className="wizard-review-pattern">
                <strong>{p.name || '(unnamed)'}</strong>
                <span>{p.operationType} · {p.frequency} frequency</span>
                <span>
                  Tables: {p.targetTables
                    .map((id) => tables.find((t) => t.id === id)?.name ?? id)
                    .join(', ') || 'none'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="wizard-review-section">
        <div className="wizard-review-section__header">
          <h5>Workload</h5>
          <button className="wizard-edit-link" onClick={() => onGoToStep(2)}>Edit</button>
        </div>
        <div className="wizard-review-workload">
          <div>Read/Write: <strong>{workload.readWriteRatio}</strong></div>
          <div>Multi-region: <strong>{workload.multiRegion ? 'Yes' : 'No'}</strong></div>
          {workload.maxRUBudget && (
            <div>Max RU budget: <strong>{workload.maxRUBudget.toLocaleString()} RU/s</strong></div>
          )}
        </div>
      </div>
    </div>
  )
}
