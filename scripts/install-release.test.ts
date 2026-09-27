import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { describe, it } from 'vitest'

const execute = promisify(execFile)
const installer = join(process.cwd(), 'scripts/install-release.sh')

describe.skipIf(process.platform === 'win32' || !existsSync('/bin/zsh'))(
  'release installer shell setup',
  () => {
    it('makes the installed command available in a new zsh and stays idempotent', async () => {
      const home = await mkdtemp(join(tmpdir(), 'airadar-installer-home-'))
      const programBin = join(home, '.qiushuiai-airadar/program/bin')
      const command = join(programBin, 'qiushuiai-airadar')
      await mkdir(programBin, { recursive: true })
      await writeFile(command, '#!/bin/sh\necho test-command\n')
      await chmod(command, 0o755)
      await writeFile(join(home, '.zshrc'), '# customer settings\n')

      const nodeBin = dirname(process.execPath)
      const env = {
        ...process.env,
        HOME: home,
        SHELL: '/bin/zsh',
        PATH: `${nodeBin}:/usr/bin:/bin`,
      }

      try {
        await execute('/bin/sh', [installer, '--configure-path-only'], { env })
        const first = await readFile(join(home, '.zshrc'), 'utf8')
        await execute('/bin/sh', [installer, '--configure-path-only'], { env })
        const second = await readFile(join(home, '.zshrc'), 'utf8')

        assert.equal(second, first)
        assert.match(first, /^# customer settings$/mu)
        assert.match(first, /qiushuiai-airadar installer/u)
        assert.equal(
          first.match(/>>> qiushuiai-airadar installer >>>/gu)?.length,
          1
        )
        assert.ok(first.includes('$HOME/.qiushuiai-airadar/program/bin'))

        const result = await execute(
          '/bin/zsh',
          [
            '-dfc',
            'source "$HOME/.zshrc"; qiushuiai-airadar; node -p process.versions.node',
          ],
          { env }
        )
        assert.equal(
          result.stdout.trim(),
          `test-command\n${process.versions.node}`
        )
      } finally {
        await rm(home, { recursive: true, force: true })
      }
    })
  }
)
