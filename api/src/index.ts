import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { advisorRouter } from './advisor.js'

dotenv.config()

const app = express()
const PORT = parseInt(process.env.PORT ?? '3001', 10)

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api', advisorRouter)

app.listen(PORT, () => {
  console.log(`Cosmologist API listening on port ${PORT}`)
})
