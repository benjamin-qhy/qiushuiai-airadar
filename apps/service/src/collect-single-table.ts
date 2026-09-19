import { homedir } from 'node:os'
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
  createSingleTableCodexGateway,
} from '@qiushuiai-airadar/pipeline'
import { SingleTableRepository } from '@qiushuiai-airadar/runtime'
import { createSingleTableSourceProvider } from './single-table-provider.js'

export async function collectSingleTable(options: {
  dataRoot: string
  templateRoot: string
  promptsRoot: string
  secretFile?: string
}) {
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
  const [tikHubToken, twitterApiKey, youtubeApiKey, codexAuthPath] =
    await Promise.all([
      secret('TIKHUB_API_KEY'),
      secret('TWITTERAPI_IO_KEY'),
      secret('YOUTUBE_API_KEY'),
      secret('CODEX_AUTH_PATH'),
    ])
  const gateway = createSingleTableCodexGateway(
    codexAuthPath ?? path.join(homedir(), '.codex', 'auth.json'),
    config.analysis.model.name
  )
  const provider = createSingleTableSourceProvider({
    tikHubToken,
    twitterApiKey,
    youtubeApiKey,
  })
  const repository = await SingleTableRepository.open(dataRoot)
  try {
    const results = await collectSourcesSerially({
      repository,
      provider,
      gateway,
      sources: config.sources.sources.map((source) => ({
        ...source,
        enabled:
          sourceState.sources[source.id]?.enabled_override ?? source.enabled,
      })),
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
      perSourceLimit: config.runtime.collection.per_source_limit,
      onError(source, item) {
        process.stderr.write(
          `Source ${source.id}, item ${item?.externalId ?? 'list'} failed; see content log if created.\n`
        )
      },
      async afterSource(source, result, page) {
        if (result.failed) return
        sourceState.sources[source.id] = {
          ...sourceState.sources[source.id],
          last_seen_content_id:
            page.items[0]?.externalId ??
            sourceState.sources[source.id]?.last_seen_content_id,
          last_collected_at: new Date().toISOString(),
        }
        await saveSourceState(configRoot, sourceState)
      },
    })
    return results
  } finally {
    repository.close()
  }
}
