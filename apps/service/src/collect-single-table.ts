import path from 'node:path'

import {
  createFileSecretReader,
  initializeSingleTableConfig,
  loadSingleTableConfig,
  loadSourceState,
  saveSourceState,
} from '@qiushuiai-airadar/config'
import {
  collectSourcesSerially,
  createFileModelCredentialStore,
  createSingleTableModelGateway,
} from '@qiushuiai-airadar/pipeline'
import { SingleTableRepository } from '@qiushuiai-airadar/runtime'
import { createSingleTableSourceProvider } from './single-table-provider.js'
import { addCollectionRunEvent, beginCollectionRun } from './collection-run.js'

export interface CollectionControl {
  bind(onPausedChange: (paused: boolean) => Promise<void>): void
  pause(): Promise<void>
  resume(): Promise<void>
  waitUntilRunnable(): Promise<void>
}

export function createCollectionControl(): CollectionControl {
  let paused = false
  let onPausedChange: ((paused: boolean) => Promise<void>) | undefined
  let resumeWaiter: (() => void) | undefined
  return {
    bind(callback) {
      onPausedChange = callback
    },
    async pause() {
      if (paused) return
      paused = true
      await onPausedChange?.(true)
    },
    async resume() {
      if (!paused) return
      paused = false
      await onPausedChange?.(false)
      resumeWaiter?.()
      resumeWaiter = undefined
    },
    async waitUntilRunnable() {
      if (!paused) return
      await new Promise<void>((resolve) => {
        resumeWaiter = resolve
      })
    },
  }
}

export async function collectSingleTable(options: {
  dataRoot: string
  templateRoot: string
  promptsRoot: string
  secretFile?: string
  repository?: SingleTableRepository
  gateway?: import('@qiushuiai-airadar/pipeline').SingleTableModelGateway
  provider?: import('@qiushuiai-airadar/pipeline').SingleTableSourceProvider
  onStarted?: () => void
  control?: CollectionControl
}) {
  const tracker = await beginCollectionRun(options.dataRoot)
  try {
    options.control?.bind(async (paused) => {
      tracker.run.status = paused ? 'paused' : 'running'
      tracker.run.message = paused
        ? '采集已暂停，恢复后将从当前位置继续。'
        : '采集已恢复，正在从暂停位置继续。'
      addCollectionRunEvent(tracker.run, {
        action: paused ? 'collection-paused' : 'collection-resumed',
        status: paused ? 'paused' : 'running',
        message: tracker.run.message,
      })
      await tracker.save()
    })
    await tracker.save()
    options.onStarted?.()
    const results = await executeCollection(options, tracker)
    tracker.run.status = 'completed'
    tracker.run.endedAt = new Date().toISOString()
    addCollectionRunEvent(tracker.run, {
      action: 'collection-completed',
      status: 'succeeded',
      message: '本轮采集已完成',
    })
    await tracker.save()
    return results
  } catch (error) {
    tracker.run.status = 'failed'
    tracker.run.endedAt = new Date().toISOString()
    tracker.run.message = '采集任务异常退出，请检查信源和模型配置后重新执行。'
    addCollectionRunEvent(tracker.run, {
      action: 'collection-failed',
      status: 'failed',
      message: tracker.run.message,
    })
    await tracker.save()
    throw error
  } finally {
    await tracker.release()
  }
}

async function executeCollection(
  options: Parameters<typeof collectSingleTable>[0],
  tracker: Awaited<ReturnType<typeof beginCollectionRun>>
) {
  const dataRoot = options.dataRoot
  const configRoot = await initializeSingleTableConfig(
    options.templateRoot,
    dataRoot
  )
  const config = await loadSingleTableConfig(configRoot)
  const sourceState = await loadSourceState(configRoot)
  const secretReader = createFileSecretReader(
    options.secretFile ?? path.join(dataRoot, '.env')
  )
  async function secret(name: string): Promise<string | undefined> {
    return secretReader.get(name).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    })
  }
  const [tikHubToken, twitterApiKey, youtubeApiKey] = await Promise.all([
    secret('TIKHUB_API_KEY'),
    secret('TWITTERAPI_IO_KEY'),
    secret('YOUTUBE_API_KEY'),
  ])
  const credentialFile = path.join(dataRoot, 'model-auth.json')
  const credentialStore = createFileModelCredentialStore(credentialFile)
  const gateway =
    options.gateway ??
    createSingleTableModelGateway(
      credentialStore,
      config.analysis.model.provider,
      config.analysis.model
    )
  const provider =
    options.provider ??
    createSingleTableSourceProvider({
      tikHubToken,
      twitterApiKey,
      youtubeApiKey,
      providerRoutes: config.providers.routes,
    })
  const sources = config.sources.sources.map((source) => ({
    ...source,
    enabled: sourceState.sources[source.id]?.enabled_override ?? source.enabled,
  }))
  tracker.run.sources = sources
    .filter((source) => source.enabled)
    .map((source) => ({
      sourceId: source.id,
      name: source.account_name,
      status: 'pending',
      discovered: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    }))
  await tracker.save()
  const repository =
    options.repository ?? (await SingleTableRepository.open(dataRoot))
  try {
    const results = await collectSourcesSerially({
      repository,
      provider,
      gateway,
      sources,
      waitUntilRunnable: options.control
        ? () => options.control!.waitUntilRunnable()
        : undefined,
      async onProgress(source, result, finished) {
        const entry = tracker.run.sources.find(
          (row) => row.sourceId === source.id
        )!
        const wasPending = entry.status === 'pending'
        Object.assign(entry, result, {
          status: finished ? 'completed' : 'running',
        })
        if (wasPending)
          addCollectionRunEvent(tracker.run, {
            action: 'source-started',
            status: 'running',
            sourceId: source.id,
            sourceName: source.account_name,
            message: `开始处理信源「${source.account_name}」`,
          })
        if (finished)
          addCollectionRunEvent(tracker.run, {
            action: 'source-completed',
            status: result.failed ? 'failed' : 'succeeded',
            sourceId: source.id,
            sourceName: source.account_name,
            message: result.failed
              ? `信源「${source.account_name}」处理结束，有 ${result.failed} 条异常`
              : `信源「${source.account_name}」处理完成`,
          })
        await tracker.save()
      },
      promptsRoot: options.promptsRoot,
      profile: config.profile,
      profileVersion: String(config.profile.version),
      scoring: {
        weights: config.analysis.scoring.weights,
        coreThreshold: config.analysis.scoring.core_threshold,
        exploreThreshold: config.analysis.scoring.explore_threshold,
        coreMinLevels: config.analysis.scoring.core_min_levels,
        exploreMinLevels: config.analysis.scoring.explore_min_levels,
      },
      longContentMinChars: config.analysis.summarization.long_content_min_chars,
      translationMinimumTotalScore:
        config.analysis.translation.minimum_total_score,
      automaticTranslationLimits: {
        maximumVideoDurationSeconds:
          config.analysis.translation.automatic_video_max_duration_seconds,
        maximumSourceCharacters:
          config.analysis.translation.automatic_max_source_characters,
      },
      onError(source, item) {
        process.stderr.write(
          `Source ${source.id}, item ${item?.externalId ?? 'list'} failed; see content log if created.\n`
        )
      },
      async afterSource(source, result, page) {
        if (result.failed) return
        const latestState = await loadSourceState(configRoot)
        latestState.sources[source.id] = {
          ...latestState.sources[source.id],
          last_seen_content_id:
            page.items[0]?.externalId ??
            sourceState.sources[source.id]?.last_seen_content_id,
          last_collected_at: new Date().toISOString(),
        }
        await saveSourceState(configRoot, latestState)
      },
    })
    return results
  } finally {
    if (!options.repository) repository.close()
  }
}
