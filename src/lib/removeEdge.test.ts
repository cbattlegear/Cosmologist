import { describe, it, expect } from 'vitest'
import type { Edge } from 'reactflow'
import { removeEdge } from './removeEdge'

describe('removeEdge', () => {
  it('removes edge by id', () => {
    const edges: Edge[] = [
      { id: '1', source: 'a', target: 'b' },
      { id: '2', source: 'b', target: 'c' },
    ]
    const res = removeEdge('1', edges)
    expect(res).toHaveLength(1)
    expect(res[0].id).toBe('2')
  })
})
