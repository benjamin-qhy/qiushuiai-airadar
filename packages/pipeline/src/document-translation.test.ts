import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  automaticTranslationSkipReason,
  sourceCharacterCount,
  splitTranslationDocument,
  translateDocument,
  type ModelCapacity,
} from './document-translation.js'

const roots: string[] = []
const capacity: ModelCapacity = {
  contextWindow: 12_000,
  maxOutputTokens: 4_000,
  provider: 'mock',
  model: 'mock',
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe('document translation', () => {
  it('skips automatic video translation when duration or equivalent character count reaches the limit', () => {
    const base = {
      contentId: 'video',
      body: 'a'.repeat(26_999),
      format: 'subtitle' as const,
      kind: 'video' as const,
    }
    const limits = {
      maximumVideoDurationSeconds: 1_800,
      maximumSourceCharacters: 27_000,
    }
    expect(
      automaticTranslationSkipReason(
        { ...base, videoDurationSeconds: 1_799 },
        limits
      )
    ).toBeUndefined()
    expect(
      automaticTranslationSkipReason(
        { ...base, videoDurationSeconds: 1_800 },
        limits
      )
    ).toBe('video_duration_limit')
    expect(
      automaticTranslationSkipReason(
        { ...base, body: `${base.body}a`, videoDurationSeconds: 1_799 },
        limits
      )
    ).toBe('source_character_limit')
    expect(automaticTranslationSkipReason(base, limits)).toBe(
      'video_duration_unknown'
    )
    expect(sourceCharacterCount('中A🙂')).toBe(3)
  })

  it('splits on paragraph boundaries using the selected model capacity', () => {
    const text = Array.from(
      { length: 12 },
      (_, index) => `Paragraph ${index}. ${'word '.repeat(180)}`
    ).join('\n\n')
    const chunks = splitTranslationDocument(text, capacity)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('\n\n')).toBe(text.trim())
  })

  it('resumes from completed chunk checkpoints and merges in order', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'airadar-translation-'))
    roots.push(root)
    const body = `${'first '.repeat(700)}\n\n${'second '.repeat(700)}`
    const calls: number[] = []
    let failOnce = true
    const run = () =>
      translateDocument({
        document: {
          contentId: 'resume',
          body,
          format: 'plain_text',
          kind: 'article',
        },
        capacity,
        checkpointRoot: root,
        promptVersion: '4',
        async translateChunk(chunk, index) {
          calls.push(index)
          if (index === 1 && failOnce) {
            failOnce = false
            throw new Error('temporary failure')
          }
          return {
            chineseTitle: index === 0 ? '标题' : null,
            chineseBody: `译文-${index + 1}-${'中'.repeat(
              Math.ceil(sourceCharacterCount(chunk) * 0.2)
            )}`,
          }
        },
      })
    await expect(run()).rejects.toThrow('temporary failure')
    const result = await run()
    expect(calls.filter((index) => index === 0)).toHaveLength(1)
    expect(calls.filter((index) => index === 1)).toHaveLength(2)
    expect(result.chineseTitle).toBe('标题')
    expect(result.chunkCount).toBeGreaterThan(2)
    expect(result.chineseBody.split('\n\n')[0]).toMatch(/^译文-1-/u)
    expect(result.chineseBody.split('\n\n')[1]).toMatch(/^译文-2-/u)
  })

  it('rejects a suspiciously short chunk before saving its checkpoint', async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), 'airadar-translation-short-')
    )
    roots.push(root)
    let calls = 0
    const run = () =>
      translateDocument({
        document: {
          contentId: 'incomplete',
          body: 'source '.repeat(300),
          format: 'plain_text',
          kind: 'article',
        },
        capacity,
        checkpointRoot: root,
        promptVersion: '5',
        async translateChunk() {
          calls += 1
          return { chineseTitle: '标题', chineseBody: '过短' }
        },
      })
    await expect(run()).rejects.toThrow('suspiciously short')
    await expect(run()).rejects.toThrow('suspiciously short')
    expect(calls).toBe(2)
  })
})
