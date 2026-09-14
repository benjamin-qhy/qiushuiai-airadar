import { describe, expect, it } from 'vitest'
import { runCli } from './index.js'

function outputBuffer() {
  let value = ''
  return {
    write(chunk: string) {
      value += chunk
    },
    value() {
      return value
    },
  }
}

describe('airadar CLI', () => {
  it('reports the source shell status', async () => {
    const stdout = outputBuffer()
    expect(await runCli(['status'], { stdout })).toBe(0)
    expect(JSON.parse(stdout.value())).toEqual({
      name: 'airadar',
      status: 'ready',
      version: '0.1.0',
    })
  })

  it('prints only the safe secret status interface', async () => {
    const stdout = outputBuffer()
    const rawSecret = 'super-secret-value'
    expect(
      await runCli(['secrets', 'status', 'TIKHUB_TOKEN'], {
        stdout,
        secretStatusReader: {
          async getStatus(name: string) {
            return { name, configured: true, maskedValue: 'su••••••••••••••ue' }
          },
        },
      })
    ).toBe(0)
    expect(stdout.value()).not.toContain(rawSecret)
    expect(JSON.parse(stdout.value())).toEqual({
      name: 'TIKHUB_TOKEN',
      configured: true,
      maskedValue: 'su••••••••••••••ue',
    })
  })
})
