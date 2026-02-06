import { describe, it, expect } from 'vitest'
import { estimateRu, estimateQueryRU, estimateReadPointRU } from './ru'

const mkDoc = (sizeKB: number) => JSON.parse('{' + '"a":"' + 'x'.repeat(sizeKB * 1024 - 7) + '"}')

describe('ru estimator', () => {
  it('estimates point read as 1 RU', () => {
    expect(estimateReadPointRU()).toBeCloseTo(1, 2)
  })

  it('read tiers follow table', () => {
    const tinyBytes = estimateReadPointRU(512)
    expect(tinyBytes).toBeCloseTo(1.0, 2)

    const doc1 = mkDoc(1)
    const ru1 = estimateRu(doc1)
    expect(ru1.readPointRU).toBeCloseTo(1.05, 2)

    const doc3 = mkDoc(3)
    const ru3 = estimateRu(doc3)
    expect(ru3.readPointRU).toBeCloseTo(1.14, 2)
    expect(ru3.readPointRU).toBeGreaterThan(ru1.readPointRU)
  })

  it('estimates query RU ~2.8 for 1KB doc', () => {
    const doc = mkDoc(1)
    const ru = estimateRu(doc)
    expect(ru.readQueryRU).toBeGreaterThan(2.5)
    expect(ru.readQueryRU).toBeLessThan(3.5)
  })

  it('estimates query RU ~3.0 for 10KB doc', () => {
    const doc = mkDoc(10)
    const ru = estimateRu(doc)
    expect(ru.readQueryRU).toBeGreaterThan(2.7)
    expect(ru.readQueryRU).toBeLessThan(3.5)
  })

  it('write RU increases with size', () => {
    const small = estimateRu(mkDoc(1))
    const large = estimateRu(mkDoc(512))
    expect(small.writeRU).toBeGreaterThan(0)
    expect(large.writeRU).toBeGreaterThan(small.writeRU)
  })

  it('query formula increases with size', () => {
    const ru10 = estimateQueryRU(10240)
    const ru20 = estimateQueryRU(20480)
    expect(ru20).toBeGreaterThan(ru10)
  })
})
