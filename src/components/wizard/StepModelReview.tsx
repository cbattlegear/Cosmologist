import { useState } from 'react'
import type { TableSchema, RelationshipSchema } from '../../lib/advisorTypes'

interface Props {
  tables: TableSchema[]
  relationships: RelationshipSchema[]
  selectedTableIds: Set<string>
  onToggleTable: (id: string) => void
}

export default function StepModelReview({ tables, relationships, selectedTableIds, onToggleTable }: Props) {
  const [expandedTable, setExpandedTable] = useState<string | null>(null)

  return (
    <div className="wizard-step">
      <h4>Review Your Data Model</h4>
      <p className="wizard-step__desc">
        Select the tables to include in the analysis. All tables are selected by default.
      </p>

      <div className="wizard-table-list">
        {tables.map((t) => {
          const rels = relationships.filter(
            (r) => r.sourceTableId === t.id || r.targetTableId === t.id
          )
          const isExpanded = expandedTable === t.id
          return (
            <div key={t.id} className="wizard-table-item">
              <div className="wizard-table-item__header">
                <label className="wizard-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedTableIds.has(t.id)}
                    onChange={() => onToggleTable(t.id)}
                  />
                  <strong>{t.name}</strong>
                </label>
                <span className="wizard-table-item__meta">
                  {t.columns.length} cols · {t.rowCount} rows · {rels.length} rel{rels.length !== 1 ? 's' : ''}
                </span>
                <button
                  className="wizard-expand-btn"
                  onClick={() => setExpandedTable(isExpanded ? null : t.id)}
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
              </div>
              {isExpanded && (
                <div className="wizard-table-item__details">
                  <div className="wizard-column-list">
                    {t.columns.map((c) => (
                      <span key={c.name} className="wizard-column-chip">
                        {c.name} <small>({c.type})</small>
                      </span>
                    ))}
                  </div>
                  {rels.length > 0 && (
                    <div className="wizard-rel-list">
                      {rels.map((r) => {
                        const src = tables.find((x) => x.id === r.sourceTableId)?.name ?? r.sourceTableId
                        const tgt = tables.find((x) => x.id === r.targetTableId)?.name ?? r.targetTableId
                        return (
                          <div key={r.id} className="wizard-rel-item">
                            {src}.{r.sourceColumn} → {tgt}.{r.targetColumn} ({r.type})
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
