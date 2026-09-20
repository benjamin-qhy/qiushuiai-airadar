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
import { beginCollectionRun } from './collection-run.js'

export async function collectSingleTable(options: {
  dataRoot: string
  templateRoot: string
  promptsRoot: string
  secretFile?: string
  repository?: SingleTableRepository
  gateway?: import('@qiushuiai-airadar/pipeline').SingleTableModelGateway
  provider?: import('@qiushuiai-airadar/pipeline').SingleTableSourceProvider
  onStarted?: () => void
}) {
  const tracker = await beginCollectionRun(options.dataRoot)
  try {
    await tracker.save()
    options.onStarted?.()
    const results = await executeCollection(options, tracker)
    tracker.run.status = 'completed'
    tracker.run.endedAt = new Date().toISOString()
    await tracker.save()
    return results
  } catch (error) {
    tracker.run.status = 'failed'
    tracker.run.endedAt = new Date().toISOString()
    tracker.run.message = '采集任务异常退出，请检查信源和模型配置后重新执行。'
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
      providerOrder: {
        x: [
          config.providers.platforms.x.preferred,
          config.providers.platforms.x.preferred === 'twitterapi.io'
            ? 'tikhub-x'
            : 'twitterapi.io',
        ],
        youtube: [
          config.providers.platforms.youtube.preferred,
          config.providers.platforms.youtube.preferred === 'youtube-data-api'
            ? 'tikhub-youtube'
            : 'youtube-data-api',
        ],
      },
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
      async onProgress(source, result, finished) {
        const entry = tracker.run.sources.find(
          (row) => row.sourceId === source.id
        )!
        Object.assign(entry, result, {
          status: finished ? 'completed' : 'running',
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
