import { describe, it, expect } from 'vitest'
import { applySplits, applyPivots, applyTransforms, type ColumnSplit, type TablePivot } from './transforms'

describe('transforms', () => {
  // ── Split ────────────────────────────────────────────────────────

  describe('applySplits', () => {
    it('splits a delimited string into an array', () => {
      const row = { Tags: 'red, green, blue', Name: 'Widget' }
      const splits: ColumnSplit[] = [{ tableId: 't1', column: 'Tags', delimiter: ',' }]
      const out = applySplits(row, splits, 't1')
      expect(out.Tags).toEqual(['red', 'green', 'blue'])
      expect(out.Name).toBe('Widget')
    })

    it('does not split columns from other tables', () => {
      const row = { Tags: 'a|b' }
      const splits: ColumnSplit[] = [{ tableId: 'other', column: 'Tags', delimiter: '|' }]
      const out = applySplits(row, splits, 't1')
      expect(out.Tags).toBe('a|b')
    })

    it('leaves non-string values untouched', () => {
      const row = { Val: 42 }
      const splits: ColumnSplit[] = [{ tableId: 't1', column: 'Val', delimiter: ',' }]
      const out = applySplits(row, splits, 't1')
      expect(out.Val).toBe(42)
    })

    it('splits on pipe delimiter', () => {
      const row = { Codes: 'A|B|C' }
      const splits: ColumnSplit[] = [{ tableId: 't1', column: 'Codes', delimiter: '|' }]
      const out = applySplits(row, splits, 't1')
      expect(out.Codes).toEqual(['A', 'B', 'C'])
    })
  })

  // ── Pivot ────────────────────────────────────────────────────────

  describe('applyPivots', () => {
    it('pivots numbered columns into an array of objects', () => {
      const row = { Id: 1, Item1: 10, Fact1: 'Yes', Item2: 12, Fact2: 'No', Item3: 15, Fact3: 'Yes' }
      const allColumns = ['Id', 'Item1', 'Fact1', 'Item2', 'Fact2', 'Item3', 'Fact3']
      const pivots: TablePivot[] = [{
        tableId: 't1',
        arrayName: 'Items',
        groups: [
          { pattern: 'Item', propertyName: 'Item' },
          { pattern: 'Fact', propertyName: 'Fact' },
        ],
      }]
      const out = applyPivots(row, pivots, 't1', allColumns)
      expect(out.Id).toBe(1)
      expect(out.Items).toEqual([
        { Item: 10, Fact: 'Yes' },
        { Item: 12, Fact: 'No' },
        { Item: 15, Fact: 'Yes' },
      ])
      // Pivoted columns should be removed
      expect(out).not.toHaveProperty('Item1')
      expect(out).not.toHaveProperty('Fact3')
    })

    it('does not pivot columns from other tables', () => {
      const row = { Item1: 10 }
      const pivots: TablePivot[] = [{
        tableId: 'other',
        arrayName: 'Items',
        groups: [{ pattern: 'Item', propertyName: 'Item' }],
      }]
      const out = applyPivots(row, pivots, 't1', ['Item1'])
      expect(out.Item1).toBe(10)
      expect(out).not.toHaveProperty('Items')
    })

    it('handles single group pivot', () => {
      const row = { Id: 1, Score1: 90, Score2: 85, Score3: 92 }
      const allColumns = ['Id', 'Score1', 'Score2', 'Score3']
      const pivots: TablePivot[] = [{
        tableId: 't1',
        arrayName: 'Scores',
        groups: [{ pattern: 'Score', propertyName: 'Score' }],
      }]
      const out = applyPivots(row, pivots, 't1', allColumns)
      expect(out.Id).toBe(1)
      expect(out.Scores).toEqual([
        { Score: 90 },
        { Score: 85 },
        { Score: 92 },
      ])
    })

    it('skips indices where no columns have values', () => {
      const row = { Id: 1, Item1: 10, Fact1: 'Yes' }
      const allColumns = ['Id', 'Item1', 'Fact1']
      const pivots: TablePivot[] = [{
        tableId: 't1',
        arrayName: 'Items',
        groups: [
          { pattern: 'Item', propertyName: 'Item' },
          { pattern: 'Fact', propertyName: 'Fact' },
        ],
      }]
      const out = applyPivots(row, pivots, 't1', allColumns)
      expect(out.Items).toEqual([{ Item: 10, Fact: 'Yes' }])
    })
  })

  // ── Combined ─────────────────────────────────────────────────────

  describe('applyTransforms', () => {
    it('applies splits and pivots together', () => {
      const row = { Id: 1, Tags: 'a,b,c', Item1: 10, Item2: 20 }
      const allColumns = ['Id', 'Tags', 'Item1', 'Item2']
      const splits: ColumnSplit[] = [{ tableId: 't1', column: 'Tags', delimiter: ',' }]
      const pivots: TablePivot[] = [{
        tableId: 't1',
        arrayName: 'Items',
        groups: [{ pattern: 'Item', propertyName: 'Item' }],
      }]
      const out = applyTransforms(row, 't1', allColumns, splits, pivots)
      expect(out.Tags).toEqual(['a', 'b', 'c'])
      expect(out.Items).toEqual([{ Item: 10 }, { Item: 20 }])
      expect(out.Id).toBe(1)
    })
  })
})
