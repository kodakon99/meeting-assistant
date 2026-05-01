import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import express from 'express'
import cors from 'cors'
import projectsRouter from './routes/projects.js'
import meetingsRouter from './routes/meetings.js'
import tasksRouter from './routes/tasks.js'

const app = express()
const PORT = Number(process.env.PORT) || 3001

const allowedOrigins = [
  'http://localhost:5173',
  process.env.CLIENT_URL,
].filter((x): x is string => Boolean(x))

app.use(cors({ origin: allowedOrigins, credentials: false }))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    groqKey: Boolean(process.env.GROQ_API_KEY),
    slackKey: Boolean(
      process.env.SLACK_BOT_TOKEN && process.env.SLACK_CHANNEL_ID,
    ),
    notionKey: Boolean(
      process.env.NOTION_API_KEY && process.env.NOTION_DATABASE_ID,
    ),
    gmailKey: Boolean(
      process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD,
    ),
  })
})

app.use('/api/projects', projectsRouter)
app.use('/api', meetingsRouter)
app.use('/api', tasksRouter)

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err)
    res.status(400).json({ error: err.message || 'Server error' })
  },
)

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
})
