import type { Application, Request, Response } from 'express'
import { CHART_IMPORTS_PATH } from '../../routes/paths'
import { listImportJobs } from '../../imports/store'
import { onImportEvent } from '../../imports/events'

const writeEvent = (res: Response, event: string, payload: unknown) => {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
  res.flush?.()
}

export const registerImportEvents = (app: Application) => {
  app.get(`${CHART_IMPORTS_PATH}/events`, (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    })
    res.flushHeaders()
    res.write('retry: 3000\n\n')
    res.flush?.()

    writeEvent(res, 'hello', { type: 'hello', at: new Date().toISOString() })

    const snapshot = listImportJobs()
    writeEvent(res, 'snapshot', { type: 'snapshot', data: snapshot })

    const unsubscribe = onImportEvent((event) => {
      if (event.type === 'job') {
        writeEvent(res, 'job', { type: 'job', data: event.job })
        return
      }
      if (event.type === 'item') {
        writeEvent(res, 'item', {
          type: 'item',
          jobId: event.jobId,
          data: event.item
        })
        return
      }
      if (event.type === 'delete') {
        writeEvent(res, 'delete', { type: 'delete', jobId: event.jobId })
      }
    })

    const ping = setInterval(() => {
      writeEvent(res, 'ping', {})
    }, 15000)

    req.on('close', () => {
      clearInterval(ping)
      unsubscribe()
    })
  })
}
