import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { RuntimeRepository } from '../packages/runtime/src/index.js'
import { mapXTweets } from '../packages/source-adapters/src/index.js'

const dataRoot = process.argv[2]
if (!dataRoot) throw new Error('Usage: backfill-x-embeds <data-root>')

const repository = await RuntimeRepository.open(dataRoot)
try {
  const existing = new Map(repository.listContents().map((item) => [item.id, item]))
  const selected = new Map<string, ReturnType<typeof mapXTweets>[number]>()
  const rawDirectory = path.join(dataRoot, '.raw-responses')
  for (const filename of await readdir(rawDirectory)) {
    if (!filename.endsWith('.json')) continue
    let capture: unknown
    try {
      capture = JSON.parse(await readFile(path.join(rawDirectory, filename), 'utf8'))
    } catch { continue }
    const envelope = capture && typeof capture === 'object' ? capture as Record<string, unknown> : {}
    const payload = envelope.payload && typeof envelope.payload === 'object' ? envelope.payload as Record<string, unknown> : {}
    const response = payload.response && typeof payload.response === 'object' ? payload.response as Record<string, unknown> : {}
    const data = response.data && typeof response.data === 'object' ? response.data as Record<string, unknown> : {}
    if (!Array.isArray(data.tweets)) continue
    for (const item of mapXTweets(data.tweets, new Date().toISOString())) {
      if (!item.platformIdentity || !existing.has(item.platformIdentity)) continue
      if (!item.images?.length && !item.quotedPost && !item.repostedBy) continue
      const old = selected.get(item.platformIdentity)
      const quality = (candidate: typeof item) =>
        (candidate.images?.length ?? 0) +
        (candidate.quotedPost ? 10 + candidate.quotedPost.text.length : 0) +
        (candidate.repostedBy ? 1 : 0)
      if (!old || quality(item) > quality(old)) selected.set(item.platformIdentity, item)
    }
  }
  let updated = 0
  for (const [id, item] of selected) {
    const content = existing.get(id)
    if (!content?.sourceId) continue
    await repository.commitDiscoveryBatch({
      sourceId: content.sourceId,
      contents: [{
        id,
        title: content.title,
        body: '',
        kind: content.kind,
        enrichmentStatus: content.enrichmentStatus,
        images: item.images,
        quotedPost: item.quotedPost,
        repostedBy: item.repostedBy,
        mergePlatformMetadata: true,
      }],
      discoveries: [],
    })
    updated += 1
  }
  process.stdout.write(`Updated media and embeds for ${updated} existing X contents.\n`)
} finally {
  await repository.close()
}
