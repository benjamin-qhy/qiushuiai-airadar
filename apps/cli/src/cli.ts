#!/usr/bin/env node
import { homedir } from 'node:os'
import { join } from 'node:path'
import { asSecretStatusReader, createFileSecretReader } from '@airadar/config'
import { runCli } from './index.js'

const secretFile =
  process.env.AIRADAR_SECRET_FILE ?? join(homedir(), '.airadar', 'secrets.env')

try {
  process.exitCode = await runCli(process.argv.slice(2), {
    stdout: process.stdout,
    stderr: process.stderr,
    secretStatusReader: asSecretStatusReader(
      createFileSecretReader(secretFile)
    ),
  })
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error'
  process.stderr.write(`airadar: ${message}\n`)
  process.exitCode = 1
}
