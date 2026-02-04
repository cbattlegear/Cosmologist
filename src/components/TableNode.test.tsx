import { render, screen } from '@testing-library/react'
import { ReactFlowProvider } from 'reactflow'
import TableNode, { TableNodeData } from './TableNode'

const table = {
  id: 't1',
  name: 'Users',
  fileName: 'users.csv',
  columns: ['id', 'name'],
  rows: [],
}

describe('TableNode', () => {
  const renderNode = (data: TableNodeData) =>
    render(
      <ReactFlowProvider>
        <TableNode id="n1" data={data} />
      </ReactFlowProvider>,
    )

  it('renders root badge when isRoot', () => {
    renderNode({ table, isRoot: true })
    expect(screen.getByText('Root')).toBeInTheDocument()
    expect(screen.getByText('Users')).toBeInTheDocument()
  })

  it('does not render root badge when not root', () => {
    renderNode({ table, isRoot: false })
    expect(screen.queryByText('Root')).toBeNull()
  })
})
