import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const source = path.join(repositoryRoot, 'apps', 'web', 'dist')
const target = path.join(repositoryRoot, 'apps', 'cli', 'web')

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(source, target, { recursive: true })

for (const [sourceName, targetName] of [
  ['config', 'config'],
  ['docs/prompts/single-table-content', 'prompts'],
]) {
  const destination = path.join(repositoryRoot, 'apps/cli', targetName)
  await rm(destination, { recursive: true, force: true })
  await cp(path.join(repositoryRoot, sourceName), destination, {
    recursive: true,
    filter: (file) => !file.split(path.sep).includes('local'),
  })
}
