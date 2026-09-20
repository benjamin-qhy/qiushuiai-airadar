import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  CircleDot,
  Info,
  LoaderCircle,
  PauseCircle,
  SkipForward,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'

interface RuntimeLogEntry {
  id: string
  index: number
  timestamp: string
  action: string
  status: string
  stage?: string
  trigger?: string
  duration?: string
  retryCount?: string
  processor?: string
  prompt?: string
  error?: string
  kind: 'collection' | 'content'
  message: string
  contentId?: string
  contentTitle?: string
  sourceId?: string
  sourceName?: string
  request?: string
  response?: string
}

interface RuntimeLogsData {
  items: RuntimeLogEntry[]
  total: number
  running: boolean
  updatedAt?: string
}

const statusLabels: Record<string, string> = {
  running: '执行中',
  paused: '已暂停',
  succeeded: '成功',
  failed: '失败',
  skipped: '跳过',
}

const stageLabels: Record<string, string> = {
  discovered: '发现内容',
  enriching: '补充详情',
  classifying: '内容判断',
  scoring: '分析评分',
  translating: '翻译内容',
  completed: '处理完成',
  failed: '处理失败',
  'collection-started': '开始采集',
  'collection-paused': '暂停采集',
  'collection-resumed': '恢复采集',
  'source-started': '开始处理信源',
  'source-completed': '信源处理结束',
  'collection-completed': '采集完成',
  'collection-failed': '采集失败',
}

const triggerLabels: Record<string, string> = {
  scheduled: '自动执行',
  'manual-retry': '人工重试',
  'manual-action': '人工操作',
}

function duration(value?: string) {
  if (!value) return '—'
  const milliseconds = Number.parseInt(value, 10)
  if (!Number.isFinite(milliseconds)) return value
  if (milliseconds < 1000) return `${milliseconds} 毫秒`
  return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)} 秒`
}

function Status({ status }: { status: string }) {
  const Icon =
    status === 'running'
      ? LoaderCircle
      : status === 'paused'
        ? PauseCircle
        : status === 'failed'
          ? AlertCircle
          : status === 'skipped'
            ? SkipForward
            : CheckCircle2
  return (
    <span
      className={
        status === 'failed'
          ? 'flex items-center gap-1.5 text-destructive'
          : status === 'paused'
            ? 'flex items-center gap-1.5 text-muted-foreground'
            : status === 'running'
              ? 'flex items-center gap-1.5 text-blue-500'
              : 'flex items-center gap-1.5'
      }
    >
      <Icon
        className={status === 'running' ? 'size-4 animate-spin' : 'size-4'}
      />
      {statusLabels[status] ?? status}
    </span>
  )
}

function Detail({ entry }: { entry: RuntimeLogEntry }) {
  const [detail, setDetail] = useState<RuntimeLogEntry>()
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    if (!entry.contentId || detail || loading) return
    setLoading(true)
    try {
      const result = await api<{ item: RuntimeLogEntry }>(
        `/api/contents/${encodeURIComponent(entry.contentId)}/logs?entry=${entry.index}`
      )
      setDetail(result.item)
    } finally {
      setLoading(false)
    }
  }, [detail, entry.contentId, entry.index, loading])
  const shown = detail ?? entry
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          aria-label='查看日志详情'
          onMouseEnter={() => void load()}
          onFocus={() => void load()}
          onClick={() => void load()}
        >
          <Info className='size-4' />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent align='end' className='max-h-[70vh] overflow-auto'>
        <div className='space-y-3 text-sm'>
          <div className='font-medium'>{entry.message}</div>
          <dl className='grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 text-xs'>
            <dt className='text-muted-foreground'>时间</dt>
            <dd>{new Date(entry.timestamp).toLocaleString('zh-CN')}</dd>
            <dt className='text-muted-foreground'>步骤</dt>
            <dd>
              {stageLabels[entry.stage ?? entry.action] ??
                entry.stage ??
                entry.action}
            </dd>
            <dt className='text-muted-foreground'>触发方式</dt>
            <dd>
              {triggerLabels[entry.trigger ?? 'scheduled'] ?? entry.trigger}
            </dd>
            <dt className='text-muted-foreground'>耗时</dt>
            <dd>{duration(entry.duration)}</dd>
            <dt className='text-muted-foreground'>重试次数</dt>
            <dd>{entry.retryCount ?? '—'}</dd>
            {entry.processor && (
              <>
                <dt className='text-muted-foreground'>处理器</dt>
                <dd className='break-all'>{entry.processor}</dd>
              </>
            )}
            {entry.prompt && (
              <>
                <dt className='text-muted-foreground'>提示词</dt>
                <dd className='break-all'>{entry.prompt}</dd>
              </>
            )}
          </dl>
          {entry.error && (
            <p className='text-xs text-destructive'>{entry.error}</p>
          )}
          {loading && (
            <p className='text-xs text-muted-foreground'>正在读取完整详情…</p>
          )}
          {shown.request && (
            <details>
              <summary className='cursor-pointer text-xs'>请求内容</summary>
              <pre className='mt-2 max-h-48 overflow-auto rounded-sm bg-foreground/[0.025] p-3 text-xs whitespace-pre-wrap break-all'>
                {shown.request}
              </pre>
            </details>
          )}
          {shown.response && (
            <details>
              <summary className='cursor-pointer text-xs'>响应内容</summary>
              <pre className='mt-2 max-h-48 overflow-auto rounded-sm bg-foreground/[0.025] p-3 text-xs whitespace-pre-wrap break-all'>
                {shown.response}
              </pre>
            </details>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

export function RuntimeLog() {
  const [data, setData] = useState<RuntimeLogsData>({
    items: [],
    total: 0,
    running: false,
  })
  const [status, setStatus] = useState('all')
  const [source, setSource] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [limit, setLimit] = useState(100)
  const [error, setError] = useState('')
  const loadingRef = useRef(false)
  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    const query = new URLSearchParams({ limit: String(limit) })
    if (status !== 'all') query.set('status', status)
    if (source !== 'all') query.set('source', source)
    if (keyword.trim()) query.set('keyword', keyword.trim())
    try {
      setData(await api<RuntimeLogsData>(`/api/runtime/logs?${query}`))
      setError('')
    } catch {
      setError('日志更新失败，当前显示的是上次结果。')
    } finally {
      loadingRef.current = false
    }
  }, [keyword, limit, source, status])
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0)
    return () => clearTimeout(timer)
  }, [load])
  useEffect(() => {
    if (!data.running) return
    const timer = setInterval(() => void load(), 3000)
    return () => clearInterval(timer)
  }, [data.running, load])
  const sources = useMemo(
    () =>
      Array.from(
        new Map(
          data.items
            .filter((item) => item.sourceId)
            .map((item) => [item.sourceId!, item.sourceName ?? item.sourceId!])
        ).entries()
      ),
    [data.items]
  )
  return (
    <section aria-live='polite'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='font-semibold'>运行日志</h2>
          <p className='mt-1 flex items-center gap-2 text-sm text-muted-foreground'>
            {data.running && <CircleDot className='size-4 text-blue-500' />}
            {data.running ? '实时更新中' : '显示最近的执行记录'}
            {data.updatedAt &&
              ` · 更新于 ${new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour12: false })}`}
          </p>
        </div>
        <span className='text-sm text-muted-foreground'>
          共 {data.total} 条
        </span>
      </div>
      <div className='mt-4 flex flex-wrap gap-2'>
        <Input
          className='w-full sm:w-64'
          placeholder='搜索日志、信源或内容'
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>全部状态</SelectItem>
            <SelectItem value='running'>执行中</SelectItem>
            <SelectItem value='paused'>已暂停</SelectItem>
            <SelectItem value='succeeded'>成功</SelectItem>
            <SelectItem value='failed'>失败</SelectItem>
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger>
            <SelectValue placeholder='全部信源' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>全部信源</SelectItem>
            {sources.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && <p className='mt-3 text-sm text-destructive'>{error}</p>}
      <div className='mt-4 overflow-x-auto'>
        <table className='w-full min-w-[760px] text-left text-sm'>
          <thead className='text-muted-foreground'>
            <tr>
              <th className='p-3'>时间</th>
              <th className='p-3'>状态</th>
              <th className='p-3'>发生了什么</th>
              <th className='p-3'>信源 / 内容</th>
              <th className='p-3'>耗时</th>
              <th className='p-3 text-right'>详情</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((entry) => (
              <tr key={entry.id} className='hover:bg-foreground/[0.025]'>
                <td className='p-3 whitespace-nowrap'>
                  {new Date(entry.timestamp).toLocaleTimeString('zh-CN', {
                    hour12: false,
                  })}
                </td>
                <td className='p-3 whitespace-nowrap'>
                  <Status status={entry.status} />
                </td>
                <td className='p-3'>
                  <div className='font-medium'>{entry.message}</div>
                  {entry.error && (
                    <div className='mt-1 line-clamp-1 text-xs text-destructive'>
                      {entry.error}
                    </div>
                  )}
                </td>
                <td className='max-w-64 p-3'>
                  <div>{entry.sourceName ?? '系统'}</div>
                  {entry.contentTitle && (
                    <div className='truncate text-xs text-muted-foreground'>
                      {entry.contentTitle}
                    </div>
                  )}
                </td>
                <td className='p-3 whitespace-nowrap text-muted-foreground'>
                  {duration(entry.duration)}
                </td>
                <td className='p-3 text-right'>
                  <Detail entry={entry} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && (
          <div className='py-10 text-center text-sm text-muted-foreground'>
            暂无符合条件的日志
          </div>
        )}
      </div>
      {data.items.length < data.total && (
        <div className='mt-3 text-center'>
          <Button
            variant='outline'
            onClick={() => setLimit((value) => Math.min(value + 100, 500))}
          >
            加载更多
          </Button>
        </div>
      )}
    </section>
  )
}
