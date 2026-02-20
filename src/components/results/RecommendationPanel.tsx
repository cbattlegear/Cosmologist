import { useMemo, useState } from 'react'
import type { Recommendation } from '../../lib/advisorTypes'
import './RecommendationPanel.css'

interface Props {
  recommendations: Recommendation[]
  summary: string
  tradeoffs: string
}

const CATEGORY_LABELS: Record<Recommendation['category'], string> = {
  'embedding': '📦 Embedding',
  'referencing': '🔗 Referencing',
  'partition-key': '🔑 Partition Key',
  'container-design': '📐 Container Design',
  'denormalization': '📋 Denormalization',
  'change-feed': '🔄 Change Feed',
  'warning': '⚠️ Warning',
}

export default function RecommendationPanel({ recommendations, summary, tradeoffs }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const grouped = useMemo(() => {
    const groups = new Map<Recommendation['category'], Recommendation[]>()
    for (const r of recommendations) {
      const list = groups.get(r.category) ?? []
      list.push(r)
      groups.set(r.category, list)
    }
    return groups
  }, [recommendations])

  const toggleCategory = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  return (
    <div className="rec-panel">
      <div className="rec-panel__summary">
        <h4>Summary</h4>
        <p>{summary}</p>
      </div>

      <div className="rec-panel__categories">
        {Array.from(grouped.entries()).map(([cat, recs]) => (
          <div key={cat} className="rec-category">
            <button
              className="rec-category__header"
              onClick={() => toggleCategory(cat)}
            >
              <span>{CATEGORY_LABELS[cat]} ({recs.length})</span>
              <span>{collapsed.has(cat) ? '▸' : '▾'}</span>
            </button>
            {!collapsed.has(cat) && (
              <div className="rec-category__items">
                {recs.map((r, i) => (
                  <div key={i} className="rec-item">
                    <div className="rec-item__title">{r.title}</div>
                    <div className="rec-item__reasoning">{r.reasoning}</div>
                    {r.impact && (
                      <div className="rec-item__impact">
                        <strong>Impact:</strong> {r.impact}
                      </div>
                    )}
                    {r.relatedTables.length > 0 && (
                      <div className="rec-item__tables">
                        Tables: {r.relatedTables.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {tradeoffs && (
        <div className="rec-panel__tradeoffs">
          <h4>Trade-offs</h4>
          <p>{tradeoffs}</p>
        </div>
      )}
    </div>
  )
}
