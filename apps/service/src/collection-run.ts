import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { SourceRunResult } from '@qiushuiai-airadar/pipeline'

export interface CollectionRun {
  id: string
  pid: number
  status: 'running' | 'completed' | 'failed' | 'interrupted'
  startedAt: string
  updatedAt: string
  endedAt?: string
  sources: Array<
    SourceRunResult & {
      name: string
      status: 'pending' | 'running' | 'completed'
    }
  >
  message?: string
  events: CollectionRunEvent[]
}

export interface CollectionRunEvent {
  id: string
  timestamp: string
  action:
    | 'collection-started'
    | 'source-started'
    | 'source-completed'
    | 'collection-completed'
    | 'collection-failed'
  status: 'running' | 'succeeded' | 'failed'
  sourceId?: string
  sourceName?: string
  message: string
}

export function addCollectionRunEvent(
  run: CollectionRun,
  event: Omit<CollectionRunEvent, 'id' | 'timestamp'>
) {
  run.events ??= []
  run.events.push({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  })
}

const file = (root: string) => path.join(root, 'collection-run.json')
function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}
export async function readCollectionRun(
  root: string
): Promise<CollectionRun | null> {
  try {
    const run = JSON.parse(await readFile(file(root), 'utf8')) as CollectionRun
    if (run.status === 'running' && !alive(run.pid)) {
      run.status = 'interrupted'
      run.message =
        '采集进程已退出，本轮未完成。可以重新执行；已有内容不会重复分析。'
    }
    return run
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function beginCollectionRun(root: string) {
  await mkdir(root, { recursive: true })
  const lock = path.join(root, 'collection.lock')
  try {
    const pid = Number(await readFile(lock, 'utf8'))
    if (!Number.isInteger(pid) || pid < 1 || alive(pid))
      throw new Error('已有采集任务正在执行，请勿重复启动。')
    await unlink(lock)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const handle = await open(lock, 'wx')
  await handle.writeFile(String(process.pid))
  await handle.close()
  const run: CollectionRun = {
    id: randomUUID(),
    pid: process.pid,
    status: 'running',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sources: [],
    events: [],
  }
  addCollectionRunEvent(run, {
    action: 'collection-started',
    status: 'running',
    message: '开始执行本轮信源采集',
  })
  async function save() {
    run.updatedAt = new Date().toISOString()
    const temporary = `${file(root)}.${run.id}.tmp`
    await writeFile(temporary, JSON.stringify(run), 'utf8')
    await rename(temporary, file(root))
  }
  return { run, save, release: () => unlink(lock) }
}
