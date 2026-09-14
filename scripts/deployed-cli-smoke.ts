import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const packageManagerCli = process.env.npm_execpath
if (!packageManagerCli) throw new Error('pnpm executable path is unavailable')

const tempRoot = join(process.cwd(), '.tmp')
await mkdir(tempRoot, { recursive: true })
const target = await mkdtemp(join(tempRoot, 'airadar-cli-deploy-'))
const deployTarget = relative(process.cwd(), target)
try {
  await execute(process.execPath, [
    packageManagerCli,
    '--filter',
    '@airadar/cli',
    'deploy',
    '--legacy',
    '--prod',
    deployTarget,
  ])
  const { stdout } = await execute(process.execPath, [
    join(target, 'dist', 'cli.js'),
    'status',
  ])
  const status = JSON.parse(stdout) as { name?: string; status?: string }
  if (status.name !== 'airadar' || status.status !== 'ready') {
    throw new Error('Deployed CLI returned an unexpected status')
  }
  process.stdout.write('Deployed CLI smoke passed\n')
} finally {
  await rm(target, { recursive: true, force: true })
}
