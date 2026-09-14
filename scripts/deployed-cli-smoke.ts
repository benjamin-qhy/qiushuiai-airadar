import { execFile, spawn, type ChildProcess } from 'node:child_process'
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const packageManagerCli = process.env.npm_execpath
if (!packageManagerCli) throw new Error('pnpm executable path is unavailable')

const previousReleaseCommit = 'ae6d470c04f1b8e509ed40bfe155d6718c4414a9'
const tempRoot = join(process.cwd(), '.tmp')
await mkdir(tempRoot, { recursive: true })
const target = await mkdtemp(join(tempRoot, 'airadar-cli-package-'))
const packRoot = join(target, 'pack')
const installRoot = join(target, 'install')
const dataRoot = join(target, 'preserved-data')
const previousSource = join(target, 'previous-release')
await mkdir(packRoot, { recursive: true })
await mkdir(previousSource, { recursive: true })

function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

async function installPackage(tarball: string): Promise<void> {
  await execute(npmCommand(), [
    'install',
    '--prefix',
    installRoot,
    '--ignore-scripts',
    tarball,
  ])
}

async function startService(
  cliPath: string,
  command: string[]
): Promise<{ child: ChildProcess; host: string; port: number }> {
  const child = spawn(process.execPath, [cliPath, ...command, '--port', '0'], {
    env: { ...process.env, AIRADAR_DATA_ROOT: dataRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const address = await new Promise<{ host: string; port: number }>(
    (resolve, reject) => {
      let output = ''
      const timer = setTimeout(
        () => reject(new Error('Installed service did not become ready')),
        20_000
      )
      child.once('error', reject)
      child.stderr?.on('data', (chunk) => {
        output += String(chunk)
      })
      child.stdout?.on('data', (chunk) => {
        output += String(chunk)
        const line = output.split('\n').find((candidate) => candidate.trim())
        if (!line) return
        try {
          const parsed = JSON.parse(line) as { host?: string; port?: number }
          if (parsed.host && typeof parsed.port === 'number') {
            clearTimeout(timer)
            resolve({ host: parsed.host, port: parsed.port })
          }
        } catch {
          // Wait for a complete JSON line.
        }
      })
    }
  )
  return { child, ...address }
}

async function stopService(child: ChildProcess): Promise<void> {
  child.kill('SIGTERM')
  await new Promise<void>((resolve) => child.once('exit', () => resolve()))
}

try {
  const archive = join(target, 'previous-release.tar')
  await execute('git', [
    'archive',
    '--format=tar',
    `--output=${archive}`,
    previousReleaseCommit,
  ])
  await execute('tar', ['-xf', archive, '-C', previousSource])
  await execute(
    process.execPath,
    [packageManagerCli, 'install', '--offline', '--frozen-lockfile'],
    { cwd: previousSource }
  )
  await execute(process.execPath, [packageManagerCli, 'build'], {
    cwd: previousSource,
  })
  const previousCli = join(previousSource, 'apps', 'cli', 'dist', 'cli.js')
  const previous = await startService(previousCli, [
    'service',
    '--host',
    '127.0.0.1',
  ])
  try {
    const health = await fetch(
      `http://${previous.host}:${previous.port}/health`
    )
    if (!health.ok) throw new Error('Previous release service was not healthy')
  } finally {
    await stopService(previous.child)
  }
  const priorSources = await readdir(join(dataRoot, 'sources'))
  if (priorSources.length < 36) {
    throw new Error('Previous release did not create real authority records')
  }
  const marker = join(dataRoot, 'upgrade-preservation.md')
  await writeFile(marker, '# must survive program upgrade\n')

  await execute(process.execPath, [
    packageManagerCli,
    '--filter',
    '@airadar/cli',
    'pack',
    '--pack-destination',
    packRoot,
  ])
  const tarballName = (await readdir(packRoot)).find((name) =>
    name.endsWith('-0.1.0.tgz')
  )
  if (!tarballName) throw new Error('CLI package tarball was not produced')
  await installPackage(join(packRoot, tarballName))

  const cliPath = join(
    installRoot,
    'node_modules',
    '@airadar',
    'cli',
    'dist',
    'cli.js'
  )
  const { stdout } = await execute(process.execPath, [cliPath, 'status'])
  const status = JSON.parse(stdout) as { name?: string; status?: string }
  if (status.name !== 'airadar' || status.status !== 'ready') {
    throw new Error('Installed CLI returned an unexpected status')
  }

  const current = await startService(cliPath, [
    'service',
    'run',
    '--host',
    '127.0.0.1',
  ])
  try {
    const origin = `http://${current.host}:${current.port}`
    const page = await fetch(`${origin}/`)
    const html = await page.text()
    if (!page.ok || !html.includes('<title>AI Radar</title>')) {
      throw new Error('Installed service did not serve the bundled Web app')
    }
    const sourcesResponse = await fetch(`${origin}/api/sources`)
    const sources = (await sourcesResponse.json()) as { items?: unknown[] }
    if (!sourcesResponse.ok || (sources.items?.length ?? 0) < 36) {
      throw new Error('Current release did not recover previous authority data')
    }
  } finally {
    await stopService(current.child)
  }

  await access(marker)
  if ((await readFile(marker, 'utf8')) !== '# must survive program upgrade\n') {
    throw new Error('Previous-to-current upgrade changed business data')
  }
  process.stdout.write(
    'Installed CLI, bundled Web, and previous-release data upgrade smoke passed\n'
  )
} finally {
  await rm(target, { recursive: true, force: true })
}
