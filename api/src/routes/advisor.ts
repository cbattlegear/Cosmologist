import { Router, type Request, type Response } from 'express'
import type { AdvisorRequest, AdvisorResponse } from '../types.js'
import { callLLM } from '../lib/llm.js'
import { buildPrompt } from '../lib/prompt.js'
import { parseAdvisorResponse } from '../lib/parseResponse.js'

export const advisorRouter = Router()

advisorRouter.post('/advisor', async (req: Request, res: Response) => {
  try {
    const body = req.body as AdvisorRequest

    if (!body.tables?.length) {
      res.status(400).json({ error: 'At least one table is required' })
      return
    }
    if (!body.accessPatterns?.length) {
      res.status(400).json({ error: 'At least one access pattern is required' })
      return
    }
    if (!body.workload) {
      res.status(400).json({ error: 'Workload profile is required' })
      return
    }

    const { systemPrompt, userPrompt } = buildPrompt(body)
    const raw = await callLLM(systemPrompt, userPrompt)
    const result: AdvisorResponse = parseAdvisorResponse(raw)

    res.json(result)
  } catch (err: unknown) {
    console.error('Advisor error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(500).json({ error: message })
  }
})
