#!/usr/bin/env node
import { join } from 'node:path'
import { asSecretStatusReader, createFileSecretReader } from '@airadar/config'
import { createSingleTableServiceApp, type ServiceApp } from '@airadar/service'
import { runCli } from './index.js'
import { installedDataRoot } from './paths.js'

const secretFile =
  process.env.AIRADAR_SECRET_FILE ??
  join(process.env.AIRADAR_DATA_ROOT ?? installedDataRoot(), '.env')
const secretReader = createFileSecretReader(secretFile)
let activeService: ServiceApp | undefined

try {
  if (process.argv[2] === 'service') {
    for (const name of [
      'TIKHUB_API_KEY',
      'TWITTERAPI_IO_KEY',
      'YOUTUBE_API_KEY',
      'GETBIJI_API_KEY',
      'GETBIJI_CLIENT_ID',
      'AIRADAR_TRANSCRIBER_URL',
      'AIRADAR_WEB_ORIGINS',
      'CODEX_AUTH_PATH',
    ]) {
      const value = await secretReader.get(name).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw error
      })
      if (value && !process.env[name]) process.env[name] = value
    }
  }
  process.exitCode = await runCli(process.argv.slice(2), {
    stdout: process.stdout,
    stderr: process.stderr,
    secretStatusReader: asSecretStatusReader(secretReader),
    serviceFactory(options) {
      activeService = createSingleTableServiceApp(options)
      return activeService
    },
  })
  if (activeService) {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => {
        void activeService?.stop().then(() => process.exit(0))
      })
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error'
  process.stderr.write(`airadar: ${message}\n`)
  process.exitCode = 1
}
