import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const manifest = JSON.parse(
  await readFile(path.join(root, 'apps/cli/package.json'), 'utf8')
)
const directory = path.join(root, 'release')
await mkdir(directory, { recursive: true })
const file = path.join(directory, `airadar-cli-${manifest.version}.tgz`)
try {
  await access(file)
  throw new Error(
    `Release already exists: ${file}. Increment the version before releasing again.`
  )
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
execFileSync(
  process.execPath,
  [
    process.env.npm_execpath,
    '--filter',
    '@airadar/cli',
    'pack',
    '--pack-destination',
    directory,
  ],
  { cwd: root, stdio: 'inherit' }
)
const hash = createHash('sha256')
  .update(await readFile(file))
  .digest('hex')
await writeFile(`${file}.sha256`, `${hash}  ${path.basename(file)}\n`)
process.stdout.write(`Release ready: ${file}\n`)
