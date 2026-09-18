import { randomUUID } from 'node:crypto'
import { readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.argv[2]
if (!root || !path.isAbsolute(root))
  throw new Error('Pass an absolute path to the new single-table data root')
const contentsRoot = path.join(path.resolve(root), 'contents')

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub)
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  if (record.type === 'thinking' || record.type === 'reasoning')
    return undefined
  return Object.fromEntries(
    Object.entries(record)
      .filter(
        ([key]) =>
          ![
            'thinking',
            'thinkingSignature',
            'encrypted_content',
            'textSignature',
          ].includes(key)
      )
      .map(([key, entry]) => [key, scrub(entry)])
      .filter(([, entry]) => entry !== undefined)
  )
}

async function visit(directory: string): Promise<number> {
  let changed = 0
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      changed += await visit(target)
      continue
    }
    if (!entry.isFile() || entry.name !== '执行日志.md') continue
    const before = await readFile(target, 'utf8')
    if (
      !before.includes('thinkingSignature') &&
      !before.includes('encrypted_content') &&
      !before.includes('textSignature')
    )
      continue
    const after = before.replace(
      /```json\n([\s\S]*?)\n```/gu,
      (block, json: string) => {
        try {
          return `\`\`\`json\n${JSON.stringify(scrub(JSON.parse(json)), null, 2)}\n\`\`\``
        } catch {
          return block
        }
      }
    )
    if (
      after.includes('thinkingSignature') ||
      after.includes('encrypted_content') ||
      after.includes('textSignature')
    )
      throw new Error(`Could not scrub ${target}`)
    const temporary = `${target}.${randomUUID()}.tmp`
    await writeFile(temporary, after, { flag: 'wx' })
    await rename(temporary, target)
    changed++
  }
  return changed
}

process.stdout.write(`Scrubbed ${await visit(contentsRoot)} execution logs.\n`)
