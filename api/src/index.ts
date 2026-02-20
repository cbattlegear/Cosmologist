import express from 'express'
import cors from 'cors'
import { advisorRouter } from './routes/advisor.js'

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)

app.use(cors())
app.use(express.json({ limit: '2mb' }))

app.use('/api', advisorRouter)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`Cosmologist API running on port ${PORT}`)
})
