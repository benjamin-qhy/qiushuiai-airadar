import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { api, post } from '@/lib/api'
import { filterContentItems, type ContentFilters } from '@/lib/content-filters'
import type { FeedItem, UtilizationAction } from '@/types'

const actionLabels: Record<UtilizationAction, string> = {
  favorite: '收藏',
  card: '做卡片',
  video: '做视频',
  article: '写文章',
  project: '建项目',
}
const kindLabels: Record<NonNullable<FeedItem['kind']>, string> = {
  short_post: '短文',
  video: '视频',
  image_post: '图文',
  article: '文章',
}
const statusLabels: Record<FeedItem['processStatus'], string> = {
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
  'waiting-manual-transcription': '待人工转写',
}

function scoreParts(value: unknown): { level: string; reason?: string } {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    return {
      level:
        typeof record.level === 'number'
          ? `${record.level} / 5`
          : String(record.level ?? '-'),
      reason: typeof record.reason === 'string' ? record.reason : undefined,
    }
  }
  return { level: String(value) }
}

function ScoreSummary({ item }: { item: FeedItem }) {
  return (
    <details
      className='group/score relative'
      onClick={(event) => event.stopPropagation()}
    >
      <summary className='cursor-pointer list-none text-xs text-muted-foreground'>
        {item.source?.name ?? '未知信源'} · {item.totalScore} 分
      </summary>
      <div className='absolute left-0 top-6 z-20 hidden w-72 rounded-lg border bg-white p-3 shadow-xl group-open/score:block lg:group-hover/score:block'>
        {Object.entries(item.scores).map(([key, value]) => {
          const score = scoreParts(value)
          return (
            <div key={key} className='mb-2 last:mb-0'>
              <div className='flex justify-between text-xs font-medium'>
                <span>{key}</span>
                <span>{score.level}</span>
              </div>
              {score.reason && (
                <p className='mt-0.5 text-xs text-muted-foreground'>
                  {score.reason}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </details>
  )
}

function useMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const media = matchMedia('(max-width: 1023px)')
    const update = () => setMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return mobile
}

function SelectFilter({
  value,
  onChange,
  children,
  label,
}: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  label: string
}) {
  return (
    <label className='sr-only'>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className='h-9 rounded-md border bg-white px-3 text-sm'
      >
        {children}
      </select>
    </label>
  )
}

export function ContentCard({
  item,
  selected,
  checked,
  onOpen,
  onCheck,
}: {
  item: FeedItem
  selected?: boolean
  checked?: boolean
  onOpen?: () => void
  onCheck?: (value: boolean) => void
}) {
  return (
    <article
      className={`group min-w-0 overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow ${selected ? 'border-slate-900 ring-1 ring-slate-900' : ''}`}
      onClick={onOpen}
    >
      <div className='flex gap-3'>
        {onCheck && (
          <Checkbox
            aria-label={`选择 ${item.title}`}
            checked={checked}
            onCheckedChange={(value) => onCheck(value === true)}
            onClick={(event) => event.stopPropagation()}
          />
        )}
        <div className='min-w-0 flex-1'>
          <div className='mb-2 flex flex-wrap items-center gap-2'>
            <Badge
              variant={item.recommendation === 'core' ? 'default' : 'secondary'}
            >
              {item.recommendation === 'core'
                ? '核心推荐'
                : item.recommendation === 'explore'
                  ? '探索推荐'
                  : '未推荐'}
            </Badge>
            {item.kind && (
              <Badge variant='outline'>{kindLabels[item.kind]}</Badge>
            )}
            <ScoreSummary item={item} />
            {!item.read && <span className='size-2 rounded-full bg-blue-500' />}
          </div>
          <h2 className='line-clamp-2 font-semibold leading-6'>{item.title}</h2>
          <p className='mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground'>
            {item.summary || '暂无摘要'}
          </p>
          <div className='mt-3 flex flex-wrap gap-1'>
            {item.topics.slice(0, 4).map((topic) => (
              <Badge key={topic} variant='outline' className='font-normal'>
                {topic}
              </Badge>
            ))}
            {item.junk.isJunk && (
              <Badge variant='destructive'>
                垃圾内容 · {item.junk.source === 'manual' ? '人工' : 'AI'}
              </Badge>
            )}
            {item.processStatus !== 'completed' && (
              <Badge variant='outline'>
                {statusLabels[item.processStatus]}
              </Badge>
            )}
            {(item.originalStatus === 'deleted' ||
              item.originalStatus === 'private') && (
              <Badge variant='outline'>原文不可用</Badge>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function Detail({
  item,
  index,
  count,
  onClose,
  onMove,
  onChanged,
}: {
  item: FeedItem
  index: number
  count: number
  onClose: () => void
  onMove: (delta: number) => void
  onChanged: (item: FeedItem, removeDaily?: boolean) => void
}) {
  const [junkOpen, setJunkOpen] = useState(false)
  const [reason, setReason] = useState('advertising')
  const [note, setNote] = useState('')
  const [operationMessage, setOperationMessage] = useState('')
  async function toggleAction(action: UtilizationAction) {
    const actions = item.utilizationActions.includes(action)
      ? item.utilizationActions.filter((value) => value !== action)
      : [...item.utilizationActions, action]
    await post(`/api/contents/${encodeURIComponent(item.id)}/actions`, {
      actions,
    })
    onChanged({ ...item, utilizationActions: actions })
  }
  async function markJunk(isJunk: boolean) {
    await post(
      `/api/contents/${encodeURIComponent(item.id)}/junk`,
      isJunk ? { isJunk: true, reason, note } : { isJunk: false }
    )
    onChanged(
      {
        ...item,
        junk: {
          isJunk,
          source: 'manual',
          reason: isJunk ? reason : undefined,
          note: isJunk ? note : undefined,
        },
        utilizationActions: [],
      },
      isJunk
    )
    setJunkOpen(false)
  }
  async function retry() {
    const result = await post<{ taskId: string }>(
      `/api/contents/${encodeURIComponent(item.id)}/retry`,
      {}
    )
    setOperationMessage(`恢复任务已进入队列：${result.taskId.slice(0, 8)}`)
  }
  return (
    <div className='flex h-full flex-col bg-white'>
      <div className='flex items-center justify-between border-b px-4 py-3'>
        <Button variant='ghost' size='sm' onClick={onClose}>
          <ArrowLeft className='size-4' /> 返回
        </Button>
        <div className='flex items-center gap-1'>
          <Button
            aria-label='上一篇'
            variant='ghost'
            size='icon'
            disabled={index <= 0}
            onClick={() => onMove(-1)}
          >
            <ChevronLeft />
          </Button>
          <span className='text-xs text-muted-foreground'>
            {index + 1}/{count}
          </span>
          <Button
            aria-label='下一篇'
            variant='ghost'
            size='icon'
            disabled={index >= count - 1}
            onClick={() => onMove(1)}
          >
            <ChevronRight />
          </Button>
          <Button
            aria-label='关闭详情'
            variant='ghost'
            size='icon'
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8'>
        <div className='mx-auto max-w-3xl'>
          <div className='mb-3 flex flex-wrap gap-2'>
            <Badge>{item.totalScore} 分</Badge>
            <Badge variant='outline'>{item.source?.name ?? '未知信源'}</Badge>
            {item.junk.isJunk && <Badge variant='destructive'>垃圾内容</Badge>}
            {(item.originalStatus === 'deleted' ||
              item.originalStatus === 'private') && (
              <Badge variant='outline'>原文不可用</Badge>
            )}
          </div>
          <h2 className='text-2xl font-semibold leading-tight'>{item.title}</h2>
          <p className='mt-3 text-sm text-muted-foreground'>
            {item.publishedAt
              ? new Date(item.publishedAt).toLocaleString('zh-CN')
              : '发布时间未知'}
          </p>
          {item.url && (
            <Button asChild variant='outline' size='sm' className='mt-4'>
              <a href={item.url} target='_blank' rel='noreferrer'>
                打开原文 <ExternalLink />
              </a>
            </Button>
          )}
          {(item.processStatus !== 'completed' ||
            item.originalStatus === 'deleted' ||
            item.originalStatus === 'private') && (
            <Button
              variant='outline'
              size='sm'
              className='mt-4 ml-2'
              onClick={() => void retry()}
            >
              <RotateCcw />
              单条恢复
            </Button>
          )}
          {operationMessage && (
            <p className='mt-3 text-sm text-emerald-700'>{operationMessage}</p>
          )}
          <Tabs defaultValue='content' className='mt-6'>
            <TabsList>
              <TabsTrigger value='content'>内容</TabsTrigger>
              <TabsTrigger value='ai'>AI 分析</TabsTrigger>
              <TabsTrigger value='collection'>采集信息</TabsTrigger>
            </TabsList>
            <TabsContent
              value='content'
              className='mt-5 whitespace-pre-wrap leading-8'
            >
              {item.body || item.summary}
            </TabsContent>
            <TabsContent value='ai' className='mt-5 space-y-4'>
              <p className='leading-7'>{item.summary}</p>
              <div className='grid gap-3 sm:grid-cols-2'>
                {Object.entries(item.scores).map(([key, value]) => (
                  <div key={key} className='rounded-lg border p-3'>
                    <div className='text-xs text-muted-foreground'>{key}</div>
                    <div className='mt-1 font-semibold'>
                      {scoreParts(value).level}
                    </div>
                    {scoreParts(value).reason && (
                      <p className='mt-1 text-xs leading-5 text-muted-foreground'>
                        {scoreParts(value).reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <pre className='overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100'>
                {JSON.stringify(item.evidence, null, 2)}
              </pre>
            </TabsContent>
            <TabsContent value='collection' className='mt-5'>
              <dl className='grid gap-3 text-sm'>
                <div>
                  <dt className='text-muted-foreground'>处理状态</dt>
                  <dd>{statusLabels[item.processStatus]}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>分析模型</dt>
                  <dd>{item.analysis?.model ?? '尚未分析'}</dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>内容 ID</dt>
                  <dd className='break-all font-mono text-xs'>{item.id}</dd>
                </div>
              </dl>
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <div className='border-t bg-white p-3'>
        <div className='mx-auto grid max-w-3xl grid-cols-6 gap-1 sm:flex sm:gap-2 sm:overflow-x-auto'>
          {(Object.keys(actionLabels) as UtilizationAction[]).map((action) => (
            <Button
              key={action}
              variant={
                item.utilizationActions.includes(action) ? 'default' : 'outline'
              }
              size='sm'
              className='min-w-0 gap-1 px-1 text-[10px] sm:px-3 sm:text-sm'
              disabled={item.junk.isJunk}
              onClick={() => void toggleAction(action)}
            >
              {action === 'favorite' ? (
                <Star className='hidden sm:block' />
              ) : (
                <Check className='hidden sm:block' />
              )}
              {actionLabels[action]}
            </Button>
          ))}
          {item.junk.isJunk ? (
            <Button
              variant='outline'
              size='sm'
              className='min-w-0 gap-1 px-1 text-[10px] sm:px-3 sm:text-sm'
              onClick={() => void markJunk(false)}
            >
              <RotateCcw className='hidden sm:block' />
              撤销垃圾
            </Button>
          ) : (
            <Button
              variant='destructive'
              size='sm'
              className='min-w-0 gap-1 px-1 text-[10px] sm:px-3 sm:text-sm'
              onClick={() => setJunkOpen(true)}
            >
              <Trash2 className='hidden sm:block' />
              标记垃圾
            </Button>
          )}
        </div>
      </div>
      <Dialog open={junkOpen} onOpenChange={setJunkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>标记为垃圾内容</DialogTitle>
            <DialogDescription>
              标记后会立即移出每日精选，并清空已有利用动作。
            </DialogDescription>
          </DialogHeader>
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className='h-10 rounded-md border px-3'
          >
            <option value='advertising'>广告</option>
            <option value='engagement-bait'>互动诱导</option>
            <option value='no-substance'>无实质内容</option>
            <option value='clickbait'>标题党</option>
            <option value='low-quality-copy'>低质搬运</option>
            <option value='incorrect'>信息错误</option>
            <option value='other'>其他</option>
          </select>
          <Textarea
            placeholder='备注（可选）'
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <DialogFooter>
            <Button variant='outline' onClick={() => setJunkOpen(false)}>
              取消
            </Button>
            <Button variant='destructive' onClick={() => void markJunk(true)}>
              确认标记
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function ContentWorkspace({ daily }: { daily: boolean }) {
  const storageKey = `airadar:${daily ? 'daily' : 'all'}:filters`
  const initial = () => {
    try {
      return typeof localStorage === 'undefined'
        ? null
        : (JSON.parse(
            localStorage.getItem(storageKey) ?? 'null'
          ) as ContentFilters | null)
    } catch {
      return null
    }
  }
  const [items, setItems] = useState<FeedItem[]>()
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string>()
  const [checked, setChecked] = useState<string[]>([])
  const [filters, setFilters] = useState<ContentFilters>(() => ({
    query: '',
    processStatus: 'all',
    recommendation: 'all',
    read: 'all',
    junk: 'all',
    date: daily ? new Date().toLocaleDateString('en-CA') : '',
    ...(initial() ?? {}),
  }))
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollPosition = useRef(0)
  const mobile = useMobile()
  const defaultLayout = useMemo(() => {
    try {
      return typeof localStorage === 'undefined'
        ? undefined
        : ((JSON.parse(
            localStorage.getItem('airadar:content-layout') ?? 'null'
          ) as Record<string, number> | null) ?? undefined)
    } catch {
      return undefined
    }
  }, [])
  const load = useCallback(
    () =>
      api<{ items: FeedItem[] }>(daily ? '/api/daily' : '/api/contents')
        .then((data) => setItems(data.items))
        .catch((reason) => setError(String(reason))),
    [daily]
  )
  const visible = useMemo(
    () => filterContentItems(items ?? [], filters),
    [items, filters]
  )
  const index = visible.findIndex((item) => item.id === selected)
  const selectedItem = visible[index]
  function open(item: FeedItem, rememberScroll = true) {
    if (rememberScroll) {
      scrollPosition.current = scrollRef.current?.scrollTop ?? 0
    }
    setSelected(item.id)
    if (!item.read) {
      void post(`/api/contents/${encodeURIComponent(item.id)}/read`, {
        read: true,
      })
      setItems((current) =>
        current?.map((value) =>
          value.id === item.id ? { ...value, read: true } : value
        )
      )
    }
  }
  function close() {
    setSelected(undefined)
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollPosition.current })
    )
  }
  function move(delta: number) {
    const next = visible[index + delta]
    if (next) open(next, false)
  }
  function changed(item: FeedItem, removeDaily = false) {
    setItems((current) =>
      current?.map((value) => (value.id === item.id ? item : value))
    )
    if (daily && removeDaily) {
      setItems((current) => current?.filter((value) => value.id !== item.id))
      setSelected(undefined)
    }
  }
  async function batch(operation: string) {
    await post('/api/contents/batch', { ids: checked, operation })
    setChecked([])
    await load()
  }
  const setFilter = (key: keyof ContentFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }))
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (typeof localStorage !== 'undefined')
      localStorage.setItem(storageKey, JSON.stringify(filters))
  }, [filters, storageKey])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelected(undefined)
        return
      }
      const delta =
        event.key === 'j' || event.key === 'ArrowDown'
          ? 1
          : event.key === 'k' || event.key === 'ArrowUp'
            ? -1
            : 0
      if (selected && delta) {
        const next = visible[index + delta]
        if (next) open(next)
      }
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [index, selected, visible])
  const renderCard = (item: FeedItem) => (
    <ContentCard
      key={item.id}
      item={item}
      selected={selected === item.id}
      checked={checked.includes(item.id)}
      onOpen={() => open(item)}
      onCheck={
        !daily
          ? (value) =>
              setChecked((current) =>
                value
                  ? [...current, item.id]
                  : current.filter((id) => id !== item.id)
              )
          : undefined
      }
    />
  )
  const list = (
    <div className='flex h-[calc(100svh-4rem)] w-full min-w-0 max-w-[100vw] flex-col overflow-x-hidden'>
      <div className='space-y-3 border-b bg-white p-4'>
        <div className='grid min-w-0 gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between'>
          <div>
            <h2 className='text-xl font-semibold'>
              {daily ? '今日值得关注' : '内容资料库'}
            </h2>
            <p className='text-sm text-muted-foreground'>
              {visible.length} 条真实内容
            </p>
          </div>
          {daily && (
            <input
              aria-label='精选日期'
              type='date'
              value={filters.date}
              onChange={(event) => setFilter('date', event.target.value)}
              className='h-9 w-full max-w-full rounded-md border px-3 text-sm sm:w-auto'
            />
          )}
        </div>
        <div className='flex flex-wrap gap-2'>
          <div className='relative min-w-52 flex-1'>
            <Search className='absolute left-3 top-2.5 size-4 text-muted-foreground' />
            <Input
              value={filters.query}
              onChange={(event) => setFilter('query', event.target.value)}
              placeholder='搜索标题、摘要或信源'
              className='pl-9'
            />
          </div>
          {!daily && (
            <>
              <SelectFilter
                label='处理状态'
                value={filters.processStatus}
                onChange={(value) => setFilter('processStatus', value)}
              >
                <option value='all'>全部状态</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
                <option value='original-unavailable'>原文不可用</option>
              </SelectFilter>
              <SelectFilter
                label='推荐级别'
                value={filters.recommendation}
                onChange={(value) => setFilter('recommendation', value)}
              >
                <option value='all'>全部推荐</option>
                <option value='core'>核心推荐</option>
                <option value='explore'>探索推荐</option>
                <option value='none'>未推荐</option>
              </SelectFilter>
              <SelectFilter
                label='阅读状态'
                value={filters.read}
                onChange={(value) => setFilter('read', value)}
              >
                <option value='all'>全部阅读</option>
                <option value='unread'>未读</option>
                <option value='read'>已读</option>
              </SelectFilter>
              <SelectFilter
                label='垃圾状态'
                value={filters.junk}
                onChange={(value) => setFilter('junk', value)}
              >
                <option value='all'>全部内容</option>
                <option value='clean'>正常</option>
                <option value='junk'>垃圾内容</option>
              </SelectFilter>
            </>
          )}
        </div>
        {!daily && checked.length > 0 && (
          <div className='flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-white'>
            <span className='text-sm'>已选 {checked.length} 条</span>
            <Button
              size='sm'
              variant='secondary'
              onClick={() => void batch('mark-read')}
            >
              标为已读
            </Button>
            <Button
              size='sm'
              variant='secondary'
              onClick={() => void batch('mark-unread')}
            >
              标为未读
            </Button>
            <Button
              size='sm'
              variant='secondary'
              onClick={() => void batch('retry')}
            >
              安全重试
            </Button>
          </div>
        )}
      </div>
      <div ref={scrollRef} className='min-h-0 flex-1 overflow-y-auto p-4'>
        {error ? (
          <p className='text-destructive'>读取失败：{error}</p>
        ) : !items ? (
          <p className='text-muted-foreground'>正在读取真实内容…</p>
        ) : visible.length === 0 ? (
          <div className='grid h-48 place-items-center text-sm text-muted-foreground'>
            没有符合条件的内容
          </div>
        ) : (
          <div className='space-y-5'>
            {daily ? (
              <>
                {(['core', 'explore'] as const).map((level) => {
                  const group = visible.filter(
                    (item) => item.recommendation === level
                  )
                  return group.length ? (
                    <section key={level}>
                      <h3 className='mb-2 text-sm font-semibold text-muted-foreground'>
                        {level === 'core' ? '核心精选' : '探索候选'} ·{' '}
                        {group.length}
                      </h3>
                      <div className='space-y-3'>{group.map(renderCard)}</div>
                    </section>
                  ) : null
                })}
              </>
            ) : (
              <div className='space-y-3'>{visible.map(renderCard)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
  if (mobile && selectedItem)
    return (
      <div className='fixed inset-0 z-50'>
        <Detail
          item={selectedItem}
          index={index}
          count={visible.length}
          onClose={close}
          onMove={move}
          onChanged={changed}
        />
      </div>
    )
  if (!selectedItem) return <div className='pb-16 lg:pb-0'>{list}</div>
  return (
    <ResizablePanelGroup
      orientation='horizontal'
      className='h-[calc(100svh-4rem)]'
      defaultLayout={defaultLayout}
      onLayoutChanged={(layout, meta) => {
        if (meta.isUserInteraction) {
          localStorage.setItem('airadar:content-layout', JSON.stringify(layout))
        }
      }}
    >
      <ResizablePanel id='content-list' defaultSize='38%' minSize='28%'>
        {list}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id='content-detail' defaultSize='62%' minSize='42%'>
        <Detail
          item={selectedItem}
          index={index}
          count={visible.length}
          onClose={close}
          onMove={move}
          onChanged={changed}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
