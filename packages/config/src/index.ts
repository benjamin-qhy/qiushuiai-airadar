import { readFile, stat } from 'node:fs/promises'

export interface SecretReader {
  get(name: string): Promise<string | undefined>
}

export interface SecretStatus {
  name: string
  configured: boolean
  maskedValue?: string
}

export interface SecretStatusReader {
  getStatus(name: string): Promise<SecretStatus>
}

const secretNamePattern = /^[A-Z][A-Z0-9_]*$/

function parseSecretFile(contents: string): Map<string, string> {
  const entries = new Map<string, string>()
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const name = line.slice(0, separator).trim()
    const rawValue = line.slice(separator + 1).trim()
    const value = rawValue.replace(/^(?:"(.*)"|'(.*)')$/u, '$1$2')
    entries.set(name, value)
  }
  return entries
}

export function maskSecret(value: string): string {
  if (value.length <= 4) return '•'.repeat(value.length)
  return `${value.slice(0, 2)}${'•'.repeat(value.length - 4)}${value.slice(-2)}`
}

export function createFileSecretReader(filePath: string): SecretReader {
  return {
    async get(name) {
      if (!secretNamePattern.test(name))
        throw new Error(`Invalid secret name: ${name}`)
      const metadata = await stat(filePath)
      if (process.platform !== 'win32' && (metadata.mode & 0o077) !== 0) {
        throw new Error(`Secret file permissions must be 600: ${filePath}`)
      }
      const value = parseSecretFile(await readFile(filePath, 'utf8')).get(name)
      return value || undefined
    },
  }
}

export function asSecretStatusReader(reader: SecretReader): SecretStatusReader {
  return {
    async getStatus(name) {
      const value = await reader.get(name)
      if (!value) return { name, configured: false }
      return { name, configured: true, maskedValue: maskSecret(value) }
    },
  }
}
