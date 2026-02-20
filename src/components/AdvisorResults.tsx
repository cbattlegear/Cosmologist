import type { AdvisorResponse } from '../lib/advisorTypes'
import ContainerDiagram from './results/ContainerDiagram'
import RecommendationPanel from './results/RecommendationPanel'
import './AdvisorResults.css'

interface Props {
  result: AdvisorResponse
  onClose: () => void
}

export default function AdvisorResults({ result, onClose }: Props) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__content modal__content--wide advisor-results" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h3>🧠 CosmosDB Model Recommendation</h3>
          <button onClick={onClose}>Close</button>
        </div>
        <div className="advisor-results__body">
          <div className="advisor-results__diagram">
            <ContainerDiagram containers={result.containers} />
          </div>
          <div className="advisor-results__panel">
            <RecommendationPanel
              recommendations={result.recommendations}
              summary={result.summary}
              tradeoffs={result.tradeoffs}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
