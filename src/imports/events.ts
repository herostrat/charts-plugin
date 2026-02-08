import { EventEmitter } from 'events'
import type { ImportItem, ImportJob } from './types'

export type ImportEvent =
  | { type: 'job'; job: ImportJob }
  | { type: 'item'; jobId: number; item: ImportItem }
  | { type: 'delete'; jobId: number }

const emitter = new EventEmitter()

export const emitImportEvent = (event: ImportEvent) => {
  emitter.emit('event', event)
}

export const onImportEvent = (handler: (event: ImportEvent) => void) => {
  emitter.on('event', handler)
  return () => emitter.off('event', handler)
}
