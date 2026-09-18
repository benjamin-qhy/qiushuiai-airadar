import path from 'node:path'
import { homedir } from 'node:os'

import { createSingleTableServiceApp } from '../apps/service/src/single-table-service.js'

const dataRootValue = process.env.AIRADAR_V2_DATA_ROOT
if (!dataRootValue || !path.isAbsolute(dataRootValue))
  throw new Error(
    'AIRADAR_V2_DATA_ROOT must be an absolute path to the new data directory'
  )
const dataRoot = path.resolve(dataRootValue)
const legacyRoot = path.resolve(
  process.env.AIRADAR_DATA_ROOT ?? path.join(homedir(), '.airadar', 'data')
)
if (
  dataRoot === legacyRoot ||
  dataRoot.startsWith(`${legacyRoot}${path.sep}`) ||
  legacyRoot.startsWith(`${dataRoot}${path.sep}`)
)
  throw new Error('New data root must not overlap the legacy data directory')

const service = createSingleTableServiceApp({
  dataRoot,
  configRoot: path.join(dataRoot, 'config'),
  secretFile: process.env.AIRADAR_V2_SECRET_FILE,
})
const address = await service.start({ host: '127.0.0.1', port: 43111 })
process.stdout.write(
  `Single-table API ready at http://${address.host}:${address.port}\n`
)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void service.stop().then(() => process.exit(0))
  })
}
