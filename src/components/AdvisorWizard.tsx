import { useState, useMemo, useCallback } from 'react'
import type {
  AccessPattern,
  WorkloadProfile,
  TableSchema,
  RelationshipSchema,
  AdvisorRequest,
  AdvisorResponse,
} from '../lib/advisorTypes'
import StepModelReview from './wizard/StepModelReview'
import StepAccessPatterns from './wizard/StepAccessPatterns'
import StepWorkload from './wizard/StepWorkload'
import StepReview from './wizard/StepReview'
import './AdvisorWizard.css'

interface Props {
  tables: TableSchema[]
  relationships: RelationshipSchema[]
  onClose: () => void
  onResult: (result: AdvisorResponse) => void
  apiBaseUrl?: string
}

const STEP_LABELS = ['Model', 'Access Patterns', 'Workload', 'Review']

export default function AdvisorWizard({ tables, relationships, onClose, onResult, apiBaseUrl = '/api' }: Props) {
  const [step, setStep] = useState(0)
  const [selectedTableIds, setSelectedTableIds] = useState<Set<string>>(
    () => new Set(tables.map((t) => t.id))
  )
  const [patterns, setPatterns] = useState<AccessPattern[]>([])
  const [workload, setWorkload] = useState<WorkloadProfile>({
    readWriteRatio: 'read-heavy',
    estimatedItemsPerTable: Object.fromEntries(tables.map((t) => [t.id, 'thousands' as const])),
    growthPatterns: {},
    multiRegion: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleTable = useCallback((id: string) => {
    setSelectedTableIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const canProceed = useMemo(() => {
    switch (step) {
      case 0:
        return selectedTableIds.size > 0
      case 1:
        return patterns.length > 0 && patterns.every((p) => p.name.trim() && p.targetTables.length > 0)
      case 2:
        return true
      case 3:
        return patterns.length > 0
      default:
        return false
    }
  }, [step, selectedTableIds, patterns])

  const handleSubmit = useCallback(async () => {
    setLoading(true)
    setError(null)

    const filteredTables = tables.filter((t) => selectedTableIds.has(t.id))
    const filteredRels = relationships.filter(
      (r) => selectedTableIds.has(r.sourceTableId) && selectedTableIds.has(r.targetTableId)
    )

    const request: AdvisorRequest = {
      tables: filteredTables,
      relationships: filteredRels,
      accessPatterns: patterns,
      workload,
    }

    try {
      const res = await fetch(`${apiBaseUrl}/advisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const result: AdvisorResponse = await res.json()
      onResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get advisor response')
    } finally {
      setLoading(false)
    }
  }, [tables, relationships, selectedTableIds, patterns, workload, apiBaseUrl, onResult])

  const goToStep = useCallback((s: number) => setStep(s), [])

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__content modal__content--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3>🧠 CosmosDB Advisor</h3>
          <button onClick={onClose}>Close</button>
        </div>

        <div className="wizard-progress">
          {STEP_LABELS.map((label, i) => (
            <button
              key={label}
              className={`wizard-progress__step ${i === step ? 'wizard-progress__step--active' : ''} ${i < step ? 'wizard-progress__step--done' : ''}`}
              onClick={() => i <= step && setStep(i)}
              disabled={i > step}
            >
              <span className="wizard-progress__num">{i + 1}</span>
              <span className="wizard-progress__label">{label}</span>
            </button>
          ))}
        </div>

        <div className="modal__body wizard-body">
          {step === 0 && (
            <StepModelReview
              tables={tables}
              relationships={relationships}
              selectedTableIds={selectedTableIds}
              onToggleTable={toggleTable}
            />
          )}
          {step === 1 && (
            <StepAccessPatterns
              tables={tables}
              selectedTableIds={selectedTableIds}
              patterns={patterns}
              onUpdate={setPatterns}
            />
          )}
          {step === 2 && (
            <StepWorkload
              tables={tables}
              relationships={relationships}
              selectedTableIds={selectedTableIds}
              workload={workload}
              onUpdate={setWorkload}
            />
          )}
          {step === 3 && (
            <StepReview
              tables={tables}
              relationships={relationships}
              selectedTableIds={selectedTableIds}
              patterns={patterns}
              workload={workload}
              onGoToStep={goToStep}
            />
          )}

          {error && <div className="wizard-error">{error}</div>}
        </div>

        <div className="wizard-footer">
          <button
            className="wizard-btn wizard-btn--secondary"
            onClick={() => step > 0 ? setStep(step - 1) : onClose()}
          >
            {step > 0 ? '← Back' : 'Cancel'}
          </button>
          <div className="wizard-footer__spacer" />
          {step < 3 ? (
            <button
              className="wizard-btn wizard-btn--primary"
              onClick={() => setStep(step + 1)}
              disabled={!canProceed}
            >
              Next →
            </button>
          ) : (
            <button
              className="wizard-btn wizard-btn--primary"
              onClick={handleSubmit}
              disabled={!canProceed || loading}
            >
              {loading ? 'Analyzing…' : '🚀 Analyze Model'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
