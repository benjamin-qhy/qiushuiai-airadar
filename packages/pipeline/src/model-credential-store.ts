import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { Credential, CredentialStore } from '@earendil-works/pi-ai'

type CredentialDocument = Record<string, Credential>

const fileQueues = new Map<string, Promise<void>>()

async function readDocument(file: string): Promise<CredentialDocument> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('Model credential file must contain an object')
    return parsed as CredentialDocument
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

async function writeDocument(
  file: string,
  document: CredentialDocument
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, {
    mode: 0o600,
  })
  await rename(temporary, file)
  await chmod(file, 0o600)
}

async function withFileQueue<T>(file: string, work: () => Promise<T>) {
  const previous = fileQueues.get(file) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.then(() => current)
  fileQueues.set(file, queued)
  await previous
  try {
    return await work()
  } finally {
    release()
    if (fileQueues.get(file) === queued) fileQueues.delete(file)
  }
}

export function createFileModelCredentialStore(file: string): CredentialStore {
  return {
    async read(providerId) {
      return (await readDocument(file))[providerId]
    },
    async list() {
      const document = await readDocument(file)
      return Object.entries(document).map(([providerId, credential]) => ({
        providerId,
        type: credential.type,
      }))
    },
    async modify(providerId, update, options) {
      return withFileQueue(file, async () => {
        options?.signal?.throwIfAborted()
        const document = await readDocument(file)
        const next = await update(document[providerId])
        options?.signal?.throwIfAborted()
        if (next === undefined) return document[providerId]
        document[providerId] = next
        await writeDocument(file, document)
        return next
      })
    },
    async delete(providerId) {
      await withFileQueue(file, async () => {
        const document = await readDocument(file)
        if (!(providerId in document)) return
        delete document[providerId]
        await writeDocument(file, document)
      })
    },
  }
}
