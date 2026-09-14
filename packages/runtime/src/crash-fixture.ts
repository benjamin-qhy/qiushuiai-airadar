import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  atomicWriteFile,
  runPendingTasks,
  RuntimeRepository,
  type RuntimeTask,
} from './index.js'

const [root, type] = process.argv.slice(2)
if (!root || !['write', 'discover', 'enrich', 'analyze'].includes(type ?? '')) {
  throw new Error('Expected a data root and task type')
}

if (type === 'write') {
  const target = path.join(root, 'interrupted.md')
  await writeFile(target, 'old complete value')
  await atomicWriteFile(target, 'new incomplete value', {
    async beforeRename() {
      process.stdout.write('active\n')
      await new Promise(() => undefined)
    },
  })
  process.exit(2)
}

const taskType = type as RuntimeTask['type']
const repository = await RuntimeRepository.open(root)
await repository.enqueueTask({
  id: `${taskType}-killed`,
  type: taskType,
  sourceId: taskType === 'discover' ? 'source-killed' : undefined,
  idempotencyKey: `${taskType}-killed`,
})
await runPendingTasks(repository, {
  concurrency: 1,
  workerIdPrefix: 'worker-to-kill',
  async handler() {
    process.stdout.write('active\n')
    await new Promise(() => undefined)
  },
})
