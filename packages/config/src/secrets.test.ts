import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { asSecretStatusReader, createFileSecretReader } from './index.js'

describe('local secret boundary', () => {
  it('keeps raw values behind the backend reader and exposes only masked status', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'qiushuiai-airadar-secrets-')
    )
    const file = join(directory, '.env')
    await writeFile(file, 'TIKHUB_TOKEN=super-secret-value\nEMPTY=\n', {
      mode: 0o600,
    })
    await chmod(file, 0o600)

    const backend = createFileSecretReader(file)
    const safe = asSecretStatusReader(backend)

    expect(await backend.get('TIKHUB_TOKEN')).toBe('super-secret-value')
    expect(await safe.getStatus('TIKHUB_TOKEN')).toEqual({
      name: 'TIKHUB_TOKEN',
      configured: true,
      maskedValue: 'su••••••••••••••ue',
    })
    expect(JSON.stringify(await safe.getStatus('TIKHUB_TOKEN'))).not.toContain(
      'super-secret-value'
    )
    expect(await safe.getStatus('MISSING')).toEqual({
      name: 'MISSING',
      configured: false,
    })
  })

  it.runIf(process.platform !== 'win32')(
    'rejects secret files readable by other users on macOS',
    async () => {
      const directory = await mkdtemp(
        join(tmpdir(), 'qiushuiai-airadar-secrets-')
      )
      const file = join(directory, '.env')
      await writeFile(file, 'TOKEN=value\n', { mode: 0o644 })

      await expect(createFileSecretReader(file).get('TOKEN')).rejects.toThrow(
        'permissions'
      )
    }
  )
})
