import { describe, expect, it } from 'vitest'
import { compareVersions } from './remote-upgrade.js'

describe('remote release versions', () => {
  it('compares stable semantic versions', () => {
    expect(compareVersions('0.3.0', '0.2.1')).toBeGreaterThan(0)
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
  })

  it('rejects ambiguous versions', () => {
    expect(() => compareVersions('latest', '0.3.0')).toThrow(
      'Unsupported release version'
    )
  })
})
