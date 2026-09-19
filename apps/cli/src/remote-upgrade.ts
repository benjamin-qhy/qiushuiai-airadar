import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { productionDataRoot, programRoot } from './paths.js'
import type { ServiceManager } from './service-manager.js'

const executeFile = promisify(execFile)
const releaseBase = 'https://github.com/benjamin-qhy/qiushuiai-airadar/releases'

interface ReleaseManifest {
  version: string
  package: string
  checksum: string
}

interface UpgradeOptions {
  currentVersion: string
  force?: boolean
  fetcher?: typeof fetch
  serviceManager: ServiceManager
  stdout: { write(chunk: string): void }
  home?: string
  npmExecutable?: string
}

function versionNumbers(value: string): [number, number, number] {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)$/u.exec(value)
  if (!match) throw new Error(`Unsupported release version: ${value}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function compareVersions(left: string, right: string): number {
  const a = versionNumbers(left)
  const b = versionNumbers(right)
  for (let index = 0; index < a.length; index += 1) {
    if (a[index]! !== b[index]!) return a[index]! - b[index]!
  }
  return 0
}

async function download(fetcher: typeof fetch, url: string): Promise<Buffer> {
  const response = await fetcher(url, {
    headers: { 'user-agent': 'qiushuiai-airadar-updater' },
  })
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export async function upgradeFromGitHub(options: UpgradeOptions): Promise<{
  previousVersion: string
  version: string
  backup?: string
  changed: boolean
}> {
  const fetcher = options.fetcher ?? fetch
  const response = await fetcher(
    `${releaseBase}/latest/download/qiushuiai-airadar-release.json`,
    { headers: { 'user-agent': 'qiushuiai-airadar-updater' } }
  )
  if (!response.ok)
    throw new Error(
      `Unable to read the latest release manifest: HTTP ${response.status}`
    )
  const release = (await response.json()) as ReleaseManifest
  const releaseVersion = release.version
  const comparison = compareVersions(releaseVersion, options.currentVersion)
  if (comparison < 0)
    throw new Error(
      `Latest remote version ${releaseVersion} is older than installed ${options.currentVersion}`
    )
  if (comparison === 0 && !options.force)
    return {
      previousVersion: options.currentVersion,
      version: releaseVersion,
      changed: false,
    }

  const packageName = `qiushuiai-airadar-cli-${releaseVersion}.tgz`
  const checksumName = `${packageName}.sha256`
  if (release.package !== packageName || release.checksum !== checksumName)
    throw new Error('Release manifest names do not match its version')
  const assetBase = `${releaseBase}/download/v${releaseVersion}`

  const temporary = await mkdtemp(
    path.join(tmpdir(), 'qiushuiai-airadar-upgrade-')
  )
  try {
    const [archive, checksumFile] = await Promise.all([
      download(fetcher, `${assetBase}/${packageName}`),
      download(fetcher, `${assetBase}/${checksumName}`),
    ])
    const expected = new RegExp(
      `^([a-f0-9]{64})\\s+\\*?${packageName.replaceAll('.', '\\.')}$`,
      'mu'
    ).exec(checksumFile.toString('utf8'))?.[1]
    if (!expected)
      throw new Error('Release checksum file has an invalid format')
    const actual = createHash('sha256').update(archive).digest('hex')
    if (actual !== expected)
      throw new Error('Release package checksum does not match')
    const archivePath = path.join(temporary, packageName)
    await writeFile(archivePath, archive)

    const dataRoot = productionDataRoot(options.home)
    let backup: string | undefined
    if (await exists(dataRoot)) {
      const timestamp = new Date().toISOString().replaceAll(/[:.]/gu, '-')
      backup = path.join(
        path.dirname(dataRoot),
        'backups',
        `${timestamp}-${options.currentVersion}`
      )
      await mkdir(backup, { recursive: true, mode: 0o700 })
      await cp(dataRoot, path.join(backup, 'production-data'), {
        recursive: true,
      })
    }

    await options.serviceManager
      .execute('stop', { host: '127.0.0.1', port: 43120 })
      .catch(() => undefined)
    const targetProgramRoot = programRoot(options.home)
    await mkdir(targetProgramRoot, { recursive: true })
    await executeFile(options.npmExecutable ?? 'npm', [
      'install',
      '-g',
      '--prefix',
      targetProgramRoot,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      archivePath,
    ])
    const installedCli = path.join(
      targetProgramRoot,
      'bin',
      process.platform === 'win32'
        ? 'qiushuiai-airadar.cmd'
        : 'qiushuiai-airadar'
    )
    await executeFile(installedCli, ['service', 'install', '--port', '43120'])
    const { stdout } = await executeFile(installedCli, ['--version'])
    if (stdout.trim() !== releaseVersion)
      throw new Error(
        `Installed version check failed: expected ${releaseVersion}, received ${stdout.trim()}`
      )
    options.stdout.write(
      `Updated ${options.currentVersion} -> ${releaseVersion}\n`
    )
    return {
      previousVersion: options.currentVersion,
      version: releaseVersion,
      backup,
      changed: true,
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
