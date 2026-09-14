#!/usr/bin/env node
import { homedir } from 'node:os'
import { join } from 'node:path'
import { asSecretStatusReader, createFileSecretReader } from '@airadar/config'
import { runCli } from './index.js'

const secretFile =
  process.env.AIRADAR_SECRET_FILE ?? join(homedir(), '.airadar', 'secrets.env')
const secretReader = createFileSecretReader(secretFile)

try {
  if (process.argv[2] === 'service') {
    for (const name of [
      'TIKHUB_API_KEY',
      'TWITTERAPI_IO_KEY',
      'YOUTUBE_API_KEY',
      'GETBIJI_API_KEY',
      'GETBIJI_CLIENT_ID',
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
  })
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error'
  process.stderr.write(`airadar: ${message}\n`)
  process.exitCode = 1
}
