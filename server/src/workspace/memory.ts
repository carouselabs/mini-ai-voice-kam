import { randomUUID } from 'node:crypto'
import type { SellerMemoryItem } from '../../../shared/tracker.ts'
import { JsonFile } from './json-file.ts'
import { HttpError } from '../http/respond.ts'

const KINDS: SellerMemoryItem['kind'][] = ['seller_statement', 'preference', 'decision', 'open_question']
const MAX_ITEMS = 60

/**
 * What the seller has told Mini AI, kept across conversations. Always labelled as seller-provided
 * and never treated as verified by the data. The seller can view and delete it in Settings.
 */
export class SellerMemory {
  private file = new JsonFile<{ items: SellerMemoryItem[] }>('seller-memory.json', () => ({ items: [] }))

  list(): SellerMemoryItem[] {
    return this.file.read().items
  }

  add(input: { kind: string; topic: string; text: string; productIds?: string[] }): SellerMemoryItem {
    if (!KINDS.includes(input.kind as SellerMemoryItem['kind'])) throw new HttpError(400, 'bad_request', `kind must be one of ${KINDS.join(', ')}`)
    const topic = input.topic.trim().slice(0, 60)
    const text = input.text.trim().slice(0, 300)
    if (!topic || !text) throw new HttpError(400, 'bad_request', 'topic and text are required')
    const data = this.file.read()
    // The same statement on the same topic replaces the older one rather than piling up.
    data.items = data.items.filter((i) => !(i.topic.toLowerCase() === topic.toLowerCase() && i.kind === input.kind))
    const item: SellerMemoryItem = {
      id: `MEM-${randomUUID().slice(0, 8).toUpperCase()}`,
      kind: input.kind as SellerMemoryItem['kind'],
      topic,
      text,
      productIds: (input.productIds ?? []).slice(0, 10),
      source: 'seller',
      verifiedBySystem: false,
      createdAt: new Date().toISOString(),
    }
    data.items.unshift(item)
    data.items = data.items.slice(0, MAX_ITEMS)
    this.file.write(data)
    return item
  }

  /** The seller corrects what Mini AI saved. */
  update(id: string, text: string): SellerMemoryItem {
    const value = text.trim().slice(0, 300)
    if (!value) throw new HttpError(400, 'bad_request', 'text is required')
    const data = this.file.read()
    const item = data.items.find((i) => i.id === id)
    if (!item) throw new HttpError(404, 'not_found', 'Memory item not found.')
    item.text = value
    this.file.write(data)
    return item
  }

  remove(id: string): boolean {
    const data = this.file.read()
    const before = data.items.length
    data.items = data.items.filter((i) => i.id !== id)
    this.file.write(data)
    return data.items.length < before
  }

  clear() {
    this.file.write({ items: [] })
  }
}
