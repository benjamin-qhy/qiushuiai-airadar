import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  Bookmark,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Eye,
  ExternalLink,
  FileText,
  Heart,
  Image as ImageIcon,
  LayoutGrid,
  MessageCircle,
  PlayCircle,
  RotateCcw,
  Search,
  Share2,
  SlidersHorizontal,
  Star,
  TableProperties,
  Trash2,
  X,
} from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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

function languageLabel(item: FeedItem): string {
  if (item.originalLanguage === 'zh') return '原文中文'
  if (item.originalLanguage === 'en') {
    return item.translatedToChinese ? '原文英文 · 已意译' : '原文英文 · 未意译'
  }
  return '原文语言待识别'
}

function listTitle(item: FeedItem): string {
  return item.kind === 'short_post' && item.source?.type === 'x' && item.chineseTranslation
    ? item.chineseTranslation
    : item.title
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
const sourceTypeLabels: Record<string, string> = {
  x: 'X',
  youtube: 'YouTube',
  rss: 'RSS',
  douyin: '抖音',
  wechat_channels: '视频号',
  xiaohongshu: '小红书',
}

type ContentViewMode = 'masonry' | 'table'
type ContentCardWidth = 'small' | 'medium' | 'large'

function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return new Intl.NumberFormat('zh-CN', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatDuration(seconds: number | undefined): string | undefined {
  if (seconds === undefined) return undefined
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function contentCover(item: FeedItem): string | undefined {
  return item.images?.[0]?.url ?? item.video?.thumbnailUrl
}

function KindIcon({ kind }: { kind: FeedItem['kind'] }) {
  return kind === 'video' ? (
    <PlayCircle aria-hidden='true' />
  ) : kind === 'image_post' ? (
    <ImageIcon aria-hidden='true' />
  ) : (
    <FileText aria-hidden='true' />
  )
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number | null | undefined
  icon: typeof Eye
}) {
  if (value === null || value === undefined || value <= 0) return null
  return (
    <span className='inline-flex items-center gap-1' title={label}>
      <Icon className='size-3.5' aria-hidden='true' />
      <span>{formatCount(value)}</span>
      <span className='sr-only'>{label}</span>
    </span>
  )
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

function FilterDropdown({
  value,
  onChange,
  options,
  label,
  icon: Icon,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  label: string
  icon?: typeof CalendarDays
}) {
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? label
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          className='h-8 max-w-28 gap-1.5 px-2.5 text-xs font-normal shadow-none'
          aria-label={label}
        >
          {Icon && <Icon className='size-3.5 shrink-0' />}
          <span className='truncate'>{selectedLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='min-w-36'>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className='text-xs'
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function parseLocalDate(value: string): Date | undefined {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day)
}

function formatLocalDate(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

export function ContentCard({
  item,
  selected,
  checked,
  onOpen,
  onCheck,
  onFavorite,
  compact = false,
}: {
  item: FeedItem
  selected?: boolean
  checked?: boolean
  onOpen?: () => void
  onCheck?: (value: boolean) => void
  onFavorite?: () => void
  compact?: boolean
}) {
  const cover = contentCover(item)
  const duration = formatDuration(item.video?.durationSeconds)
  const metrics = item.interaction
  return (
    <article
      tabIndex={0}
      className={`group flex min-w-0 cursor-pointer overflow-hidden rounded-lg border border-slate-200/70 bg-white outline-none transition-colors hover:border-slate-300 hover:bg-slate-50/40 focus-visible:border-slate-400 ${compact ? 'h-full min-h-28 flex-row' : 'flex-col'} ${selected ? 'border-slate-300 bg-slate-50' : ''}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && onOpen) {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      {cover ? (
        <div
          className={`relative shrink-0 overflow-hidden bg-slate-100 ${compact ? 'm-3 mr-0 w-24 rounded-lg' : 'aspect-[3/4] w-full'}`}
        >
          <img
            src={cover}
            alt=''
            className='size-full object-cover transition duration-300 group-hover:scale-[1.02]'
          />
          <div className='absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent' />
          <div className='absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 to-transparent' />
          <Badge className='absolute left-2 top-2 bg-white/90 text-slate-950 hover:bg-white/90'>
            {item.recommendation === 'core'
              ? '核心'
              : item.recommendation === 'explore'
                ? '探索'
                : '普通'}
          </Badge>
          <span className='absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur'>
            {item.totalScore} 分
          </span>
          {!compact && (item.chineseTranslation || item.summary) && (
            <p className='absolute inset-x-2 top-10 line-clamp-4 text-[11px] font-medium leading-4 text-white/95'>
              {item.chineseTranslation || item.summary}
            </p>
          )}
          <div className='absolute inset-x-2 bottom-2 min-w-0 text-white'>
            <div className='truncate text-xs font-medium'>
              {item.source?.name ?? '未知信源'}
            </div>
            <div className='mt-0.5 text-[10px] text-white/75'>
              {item.publishedAt
                ? new Date(item.publishedAt).toLocaleDateString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                  })
                : '时间未知'}
            </div>
          </div>
          {duration && (
            <span className='absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white'>
              {duration}
            </span>
          )}
        </div>
      ) : null}
      <div
        className={`flex min-w-0 flex-1 flex-col ${compact ? 'p-3' : 'p-3'}`}
      >
        <div className='mb-2 flex min-w-0 items-start gap-2'>
          {onCheck && !compact && (
            <Checkbox
              aria-label={`选择 ${item.title}`}
              checked={checked}
              onCheckedChange={(value) => onCheck(value === true)}
              onClick={(event) => event.stopPropagation()}
            />
          )}
          <div className='min-w-0 flex-1'>
            <div className='flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground'>
              {!cover && (
                <span className='flex size-6 shrink-0 items-center justify-center rounded-md bg-slate-100 [&>svg]:size-3.5'>
                  <KindIcon kind={item.kind} />
                </span>
              )}
              <span className='truncate'>
                {cover ? item.kind : (item.source?.name ?? '未知信源')}
              </span>
              <span aria-hidden='true'>·</span>
              <span
                className={`shrink-0 font-semibold text-foreground ${cover ? 'sr-only' : ''}`}
              >
                {item.totalScore} 分
              </span>
              {!item.read && (
                <span
                  className='size-2 shrink-0 rounded-full bg-blue-500'
                  title='未读'
                />
              )}
            </div>
          </div>
          {!cover && (
            <Badge
              variant={item.recommendation === 'core' ? 'default' : 'secondary'}
              className='shrink-0'
            >
              {item.recommendation === 'core'
                ? '核心'
                : item.recommendation === 'explore'
                  ? '探索'
                  : '普通'}
            </Badge>
          )}
        </div>
        <h2
          className={`font-semibold text-foreground ${compact ? 'line-clamp-2 text-sm leading-5' : 'line-clamp-2 text-sm leading-5'}`}
        >
          {listTitle(item)}
        </h2>
        <span className='mt-1 text-[11px] text-muted-foreground'>
          {languageLabel(item)}
        </span>
        {!compact && !cover && !item.chineseTranslation && (
          <p className='mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground'>
            {item.summary || '暂无摘要'}
          </p>
        )}
        <div className='mt-auto pt-3'>
          {!compact && item.topics.length > 0 && (
            <div className='mb-2 flex min-w-0 flex-nowrap gap-1 overflow-hidden'>
              {item.topics.slice(0, 2).map((topic) => (
                <Badge key={topic} variant='outline' className='font-normal'>
                  {topic}
                </Badge>
              ))}
              {item.topics.length > 2 && (
                <Badge variant='outline' className='font-normal'>
                  +{item.topics.length - 2}
                </Badge>
              )}
            </div>
          )}
          <div className='flex items-center justify-between gap-2 border-t pt-2 text-[11px] text-muted-foreground'>
            <div className='flex min-w-0 items-center gap-2.5'>
              {item.publishedAt && (
                <span className='shrink-0'>
                  {new Date(item.publishedAt).toLocaleDateString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                  })}
                </span>
              )}
              {!compact && (
                <>
                  <Metric label='浏览' value={metrics?.views} icon={Eye} />
                  <Metric label='点赞' value={metrics?.likes} icon={Heart} />
                  <Metric
                    label='评论'
                    value={metrics?.comments}
                    icon={MessageCircle}
                  />
                </>
              )}
            </div>
            <div className='flex shrink-0 items-center gap-1'>
              {onFavorite && (
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-8'
                  aria-label={
                    item.utilizationActions.includes('favorite')
                      ? '取消收藏'
                      : '收藏'
                  }
                  title={
                    item.utilizationActions.includes('favorite')
                      ? '取消收藏'
                      : '收藏'
                  }
                  disabled={item.junk.isJunk}
                  onClick={(event) => {
                    event.stopPropagation()
                    onFavorite()
                  }}
                >
                  <Bookmark
                    className={
                      item.utilizationActions.includes('favorite')
                        ? 'fill-current'
                        : ''
                    }
                  />
                </Button>
              )}
              {item.url && (
                <Button
                  asChild
                  variant='ghost'
                  size='icon'
                  className='size-8'
                  onClick={(event) => event.stopPropagation()}
                >
                  <a
                    href={item.url}
                    target='_blank'
                    rel='noreferrer'
                    aria-label='打开原文'
                    title='打开原文'
                  >
                    <ExternalLink />
                  </a>
                </Button>
              )}
            </div>
          </div>
          {item.junk.isJunk && (
            <Badge variant='destructive' className='mt-2'>
              垃圾内容 · {item.junk.source === 'manual' ? '人工' : 'AI'}
            </Badge>
          )}
          {item.processStatus !== 'completed' && (
            <Badge variant='outline' className='mt-2'>
              {statusLabels[item.processStatus]}
            </Badge>
          )}
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
          <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge>{item.totalScore} 分</Badge>
              {item.kind && (
                <Badge variant='secondary'>{kindLabels[item.kind]}</Badge>
              )}
              <Badge variant='outline'>{item.source?.name ?? '未知信源'}</Badge>
              <Badge variant='outline'>{languageLabel(item)}</Badge>
              {item.junk.isJunk && (
                <Badge variant='destructive'>垃圾内容</Badge>
              )}
              {(item.originalStatus === 'deleted' ||
                item.originalStatus === 'private') && (
                <Badge variant='outline'>原文不可用</Badge>
              )}
            </div>
            <div className='flex items-center gap-3 text-xs text-muted-foreground'>
              <Metric label='浏览' value={item.interaction?.views} icon={Eye} />
              <Metric
                label='点赞'
                value={item.interaction?.likes}
                icon={Heart}
              />
              <Metric
                label='评论'
                value={item.interaction?.comments}
                icon={MessageCircle}
              />
              <Metric
                label='分享'
                value={item.interaction?.shares}
                icon={Share2}
              />
            </div>
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
            (item.kind === 'short_post' &&
              item.source?.type === 'x' &&
              item.originalLanguage === 'en' &&
              !item.translatedToChinese) ||
            item.originalStatus === 'deleted' ||
            item.originalStatus === 'private') && (
            <Button
              variant='outline'
              size='sm'
              className='mt-4 ml-2'
              onClick={() => void retry()}
            >
              <RotateCcw />
              {item.originalLanguage === 'en' && !item.translatedToChinese ? '生成中文意译' : '单条恢复'}
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
            <TabsContent value='content' className='mt-5 space-y-5'>
              {item.images && item.images.length > 0 && (
                <div className='grid gap-2 sm:grid-cols-2'>
                  {item.images.slice(0, 4).map((image, imageIndex) => (
                    <a
                      key={`${image.url}-${imageIndex}`}
                      href={image.url}
                      target='_blank'
                      rel='noreferrer'
                      className={`overflow-hidden rounded-xl border bg-slate-100 ${imageIndex === 0 ? 'sm:col-span-2' : ''}`}
                      title='查看原图'
                    >
                      <img
                        src={image.url}
                        alt={`内容配图 ${imageIndex + 1}`}
                        className={`w-full object-cover ${imageIndex === 0 ? 'max-h-[440px]' : 'aspect-video'}`}
                      />
                    </a>
                  ))}
                </div>
              )}
              {item.video?.thumbnailUrl && (
                <div className='relative overflow-hidden rounded-xl border bg-slate-950'>
                  <img
                    src={item.video.thumbnailUrl}
                    alt='视频封面'
                    className='aspect-video w-full object-cover opacity-90'
                  />
                  <PlayCircle className='absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 text-white drop-shadow-lg' />
                </div>
              )}
              {item.chineseTranslation ? (
                <div className='space-y-4'>
                  <div className='whitespace-pre-wrap leading-8'>{item.chineseTranslation}</div>
                  <details className='text-sm text-muted-foreground'>
                    <summary className='cursor-pointer'>查看英文原文</summary>
                    <div className='mt-3 whitespace-pre-wrap leading-7'>{item.body}</div>
                  </details>
                </div>
              ) : (
                <div className='whitespace-pre-wrap leading-8'>
                  {item.body || item.summary}
                </div>
              )}
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
              <details className='rounded-lg border bg-slate-50 p-4'>
                <summary className='cursor-pointer text-sm font-medium'>
                  查看分析依据
                </summary>
                <pre className='mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground'>
                  {JSON.stringify(item.evidence, null, 2)}
                </pre>
              </details>
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
  const viewStorageKey = 'airadar:content:view'
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
  const [viewMode, setViewMode] = useState<ContentViewMode>(() => {
    if (typeof localStorage === 'undefined') return 'masonry'
    return localStorage.getItem(`${viewStorageKey}:mode`) === 'table'
      ? 'table'
      : 'masonry'
  })
  const [cardWidth, setCardWidth] = useState<ContentCardWidth>(() => {
    if (typeof localStorage === 'undefined') return 'medium'
    const saved = localStorage.getItem(`${viewStorageKey}:card-width`)
    return saved === 'small' || saved === 'large' ? saved : 'medium'
  })
  const [filters, setFilters] = useState<ContentFilters>(() => {
    const saved = initial()
    return {
      query: '',
      processStatus: 'all',
      recommendation: 'all',
      read: 'all',
      junk: 'all',
      dateFrom: saved?.dateFrom ?? '',
      dateTo: saved?.dateTo ?? '',
      datePreset: saved?.datePreset ?? 'all',
      kind: 'all',
      sourceType: 'all',
      sort: daily ? 'score-desc' : 'newest',
      ...(saved ?? {}),
    }
  })
  const [customRange, setCustomRange] = useState<DateRange | undefined>(() => {
    const from = parseLocalDate(filters.dateFrom)
    const to = parseLocalDate(filters.dateTo)
    return from ? { from, to } : undefined
  })
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
  const visible = useMemo(() => {
    const filtered = filterContentItems(items ?? [], filters)
    return [...filtered].sort((left, right) => {
      if (filters.sort === 'score-desc')
        return right.totalScore - left.totalScore
      const leftTime =
        Date.parse(left.publishedAt ?? left.discoveredAt ?? '') || 0
      const rightTime =
        Date.parse(right.publishedAt ?? right.discoveredAt ?? '') || 0
      return filters.sort === 'oldest'
        ? leftTime - rightTime
        : rightTime - leftTime
    })
  }, [items, filters])
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
  async function toggleFavorite(item: FeedItem) {
    const actions = item.utilizationActions.includes('favorite')
      ? item.utilizationActions.filter((value) => value !== 'favorite')
      : [...item.utilizationActions, 'favorite' as const]
    await post(`/api/contents/${encodeURIComponent(item.id)}/actions`, {
      actions,
    })
    changed({ ...item, utilizationActions: actions })
  }
  async function batch(operation: string) {
    await post('/api/contents/batch', { ids: checked, operation })
    setChecked([])
    await load()
  }
  const setFilter = (key: keyof ContentFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }))
  const setDatePreset = (preset: string, days?: number) => {
    if (!days) {
      setFilters((current) => ({
        ...current,
        datePreset: preset,
        dateFrom: '',
        dateTo: '',
      }))
      setCustomRange(undefined)
      return
    }
    const to = new Date()
    const from = new Date(to)
    from.setDate(from.getDate() - days + 1)
    setFilters((current) => ({
      ...current,
      datePreset: preset,
      dateFrom: formatLocalDate(from),
      dateTo: formatLocalDate(to),
    }))
    setCustomRange({ from, to })
  }
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (typeof localStorage !== 'undefined')
      localStorage.setItem(storageKey, JSON.stringify(filters))
  }, [filters, storageKey])
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(`${viewStorageKey}:mode`, viewMode)
    localStorage.setItem(`${viewStorageKey}:card-width`, cardWidth)
  }, [cardWidth, viewMode, viewStorageKey])
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
      compact={Boolean(selectedItem)}
      onOpen={() => open(item)}
      onFavorite={() => void toggleFavorite(item)}
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
  const cardWidthOptions: Array<{
    value: ContentCardWidth
    label: string
    pixels: number
  }> = [
    { value: 'small', label: '小卡片', pixels: 132 },
    { value: 'medium', label: '中卡片', pixels: 224 },
    { value: 'large', label: '大卡片', pixels: 288 },
  ]
  const selectedCardWidth =
    cardWidthOptions.find((option) => option.value === cardWidth) ??
    cardWidthOptions[1]
  const renderMasonry = (group: FeedItem[]) => (
    <div
      data-view='masonry'
      className='w-full'
      style={{
        columnGap: '0.75rem',
        columnWidth: `${selectedCardWidth.pixels}px`,
      }}
    >
      {group.map((item) => (
        <div key={item.id} className='mb-3 break-inside-avoid'>
          {renderCard(item)}
        </div>
      ))}
    </div>
  )
  const renderTable = (group: FeedItem[]) => (
    <div data-view='table' className='overflow-hidden rounded-lg border bg-white'>
      <Table>
        <TableHeader>
          <TableRow>
            {!daily && <TableHead className='w-10' />}
            <TableHead>内容</TableHead>
            <TableHead>平台</TableHead>
            <TableHead>类型</TableHead>
            <TableHead className='text-right'>评分</TableHead>
            <TableHead>推荐</TableHead>
            <TableHead>日期</TableHead>
            <TableHead className='w-20 text-right'>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {group.map((item) => (
            <TableRow
              key={item.id}
              tabIndex={0}
              data-state={selected === item.id ? 'selected' : undefined}
              className='cursor-pointer'
              onClick={() => open(item)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  open(item)
                }
              }}
            >
              {!daily && (
                <TableCell>
                  <Checkbox
                    aria-label={`选择 ${item.title}`}
                    checked={checked.includes(item.id)}
                    onCheckedChange={(value) =>
                      setChecked((current) =>
                        value === true
                          ? [...current, item.id]
                          : current.filter((id) => id !== item.id)
                      )
                    }
                    onClick={(event) => event.stopPropagation()}
                  />
                </TableCell>
              )}
              <TableCell className='max-w-80 whitespace-normal'>
                <div className='line-clamp-1 font-medium'>{listTitle(item)}</div>
                <div className='line-clamp-1 text-xs text-muted-foreground'>
                  {languageLabel(item)}{!item.chineseTranslation && ' · ' + (item.summary || '暂无摘要')}
                </div>
              </TableCell>
              <TableCell>
                {sourceTypeLabels[item.source?.type ?? ''] ??
                  item.source?.type ??
                  '未知'}
              </TableCell>
              <TableCell>
                {item.kind ? kindLabels[item.kind] : '未知'}
              </TableCell>
              <TableCell className='text-right font-medium'>
                {item.totalScore}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    item.recommendation === 'core' ? 'default' : 'secondary'
                  }
                >
                  {item.recommendation === 'core'
                    ? '核心'
                    : item.recommendation === 'explore'
                      ? '探索'
                      : '普通'}
                </Badge>
              </TableCell>
              <TableCell>
                {item.publishedAt
                  ? new Date(item.publishedAt).toLocaleDateString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                    })
                  : '未知'}
              </TableCell>
              <TableCell>
                <div className='flex justify-end gap-1'>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='size-8'
                    aria-label={
                      item.utilizationActions.includes('favorite')
                        ? '取消收藏'
                        : '收藏'
                    }
                    disabled={item.junk.isJunk}
                    onClick={(event) => {
                      event.stopPropagation()
                      void toggleFavorite(item)
                    }}
                  >
                    <Bookmark
                      className={
                        item.utilizationActions.includes('favorite')
                          ? 'fill-current'
                          : ''
                      }
                    />
                  </Button>
                  {item.url && (
                    <Button
                      asChild
                      variant='ghost'
                      size='icon'
                      className='size-8'
                      onClick={(event) => event.stopPropagation()}
                    >
                      <a
                        href={item.url}
                        target='_blank'
                        rel='noreferrer'
                        aria-label='打开原文'
                      >
                        <ExternalLink />
                      </a>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
  const kindFilters: Array<{ value: string; label: string }> = [
    { value: 'all', label: '全部' },
    { value: 'video', label: '视频' },
    { value: 'image_post', label: '图文' },
    { value: 'article', label: '文章' },
    { value: 'short_post', label: '短帖' },
  ]
  const recommendationFilters: Array<{ value: string; label: string }> = [
    { value: 'all', label: '全部推荐' },
    { value: 'core', label: '核心' },
    { value: 'explore', label: '探索' },
    ...(!daily ? [{ value: 'none', label: '普通' }] : []),
  ]
  const sourceOptions = [
    { value: 'all', label: '全部平台' },
    { value: 'x', label: 'X' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'rss', label: 'RSS' },
    { value: 'douyin', label: '抖音' },
    { value: 'wechat_channels', label: '视频号' },
    { value: 'xiaohongshu', label: '小红书' },
  ]
  const processOptions = [
    { value: 'all', label: '全部状态' },
    ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
    { value: 'original-unavailable', label: '原文不可用' },
  ]
  const advancedFilterActive =
    filters.processStatus !== 'all' ||
    filters.read !== 'all' ||
    filters.junk !== 'all'
  const datePresets = [
    { value: 'week', label: '近一周', days: 7 },
    { value: 'month', label: '近一个月', days: 30 },
    { value: 'quarter', label: '近三个月', days: 90 },
    { value: 'half-year', label: '近半年', days: 180 },
  ]
  const dateLabel =
    filters.datePreset === 'custom' && filters.dateFrom && filters.dateTo
      ? `${filters.dateFrom.slice(5)}–${filters.dateTo.slice(5)}`
      : (datePresets.find((preset) => preset.value === filters.datePreset)
          ?.label ?? '日期')
  const list = (
    <div className='flex h-svh w-full min-w-0 max-w-[100vw] flex-col overflow-x-hidden'>
      <div className='shrink-0 border-b bg-white'>
        <div className='flex min-h-16 min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2'>
          <div className='min-w-28 shrink-0'>
            <h2 className='truncate text-base font-semibold'>
              {daily ? '今日值得关注' : '内容资料库'}
            </h2>
            <p className='text-xs text-muted-foreground'>
              {visible.length} 条真实内容
            </p>
          </div>

          <div className='ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2'>
            <div className='relative min-w-28 flex-1 basis-36 sm:max-w-[168px]'>
              <Search className='pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground' />
              <Input
                value={filters.query}
                onChange={(event) => setFilter('query', event.target.value)}
                placeholder='搜索内容'
                className='h-8 pl-8 text-xs shadow-none'
              />
            </div>

            <ButtonGroup aria-label='内容搜索与筛选' className='shrink-0'>
              <FilterDropdown
                label='内容类型'
                value={filters.kind ?? 'all'}
                onChange={(value) => setFilter('kind', value)}
                options={kindFilters.map((filter) => ({
                  ...filter,
                  label: filter.value === 'all' ? '全部类型' : filter.label,
                }))}
              />

              <FilterDropdown
                label='推荐等级'
                value={filters.recommendation}
                onChange={(value) => setFilter('recommendation', value)}
                options={recommendationFilters}
              />

              <FilterDropdown
                label='评分'
                value={filters.sort ?? 'newest'}
                onChange={(value) => setFilter('sort', value)}
                icon={ArrowDownWideNarrow}
                options={[
                  { value: 'score-desc', label: '评分最高' },
                  { value: 'newest', label: '最新发布' },
                  { value: 'oldest', label: '最早发布' },
                ]}
              />

              <FilterDropdown
                label='平台'
                value={filters.sourceType ?? 'all'}
                onChange={(value) => setFilter('sourceType', value)}
                options={sourceOptions}
              />

              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='outline'
                    size='sm'
                    className='h-8 max-w-32 gap-1.5 px-2.5 text-xs font-normal shadow-none'
                    aria-label='日期范围'
                  >
                    <CalendarDays className='size-3.5 shrink-0' />
                    <span className='truncate'>{dateLabel}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-40'>
                  <DropdownMenuLabel className='text-xs'>
                    日期范围
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className='text-xs'
                    onSelect={() => setDatePreset('all')}
                  >
                    不限时间
                    {filters.datePreset === 'all' && (
                      <Check className='ml-auto size-3' />
                    )}
                  </DropdownMenuItem>
                  {datePresets.map((preset) => (
                    <DropdownMenuItem
                      key={preset.value}
                      className='text-xs'
                      onSelect={() => setDatePreset(preset.value, preset.days)}
                    >
                      {preset.label}
                      {filters.datePreset === preset.value && (
                        <Check className='ml-auto size-3' />
                      )}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className='text-xs'>
                      自定义
                      {filters.datePreset === 'custom' && (
                        <Check className='ml-auto mr-2 size-3' />
                      )}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className='w-auto p-0'>
                      <Calendar
                        mode='range'
                        selected={customRange}
                        onSelect={(value) => {
                          setCustomRange(value)
                          if (value?.from && value.to) {
                            setFilters((current) => ({
                              ...current,
                              datePreset: 'custom',
                              dateFrom: formatLocalDate(value.from!),
                              dateTo: formatLocalDate(value.to!),
                            }))
                          }
                        }}
                        numberOfMonths={2}
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>

              {!daily && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant={advancedFilterActive ? 'secondary' : 'outline'}
                      size='sm'
                      className='h-8 gap-1.5 px-2.5 text-xs font-normal shadow-none'
                      aria-label='更多筛选'
                    >
                      <SlidersHorizontal className='size-3.5' />
                      筛选
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end' className='w-44'>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className='text-xs'>
                        处理状态
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className='w-40'>
                        <DropdownMenuRadioGroup
                          value={filters.processStatus}
                          onValueChange={(value) =>
                            setFilter('processStatus', value)
                          }
                        >
                          {processOptions.map((option) => (
                            <DropdownMenuRadioItem
                              key={option.value}
                              value={option.value}
                              className='text-xs'
                            >
                              {option.label}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className='text-xs'>
                        阅读状态
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className='w-36'>
                        <DropdownMenuRadioGroup
                          value={filters.read}
                          onValueChange={(value) => setFilter('read', value)}
                        >
                          <DropdownMenuRadioItem
                            value='all'
                            className='text-xs'
                          >
                            全部阅读
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem
                            value='unread'
                            className='text-xs'
                          >
                            未读
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem
                            value='read'
                            className='text-xs'
                          >
                            已读
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className='text-xs'>
                        垃圾状态
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className='w-36'>
                        <DropdownMenuRadioGroup
                          value={filters.junk}
                          onValueChange={(value) => setFilter('junk', value)}
                        >
                          <DropdownMenuRadioItem
                            value='all'
                            className='text-xs'
                          >
                            全部内容
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem
                            value='clean'
                            className='text-xs'
                          >
                            正常
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem
                            value='junk'
                            className='text-xs'
                          >
                            垃圾内容
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </ButtonGroup>

            <ButtonGroup aria-label='内容展示方式' className='shrink-0'>
              {viewMode === 'masonry' && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant='outline'
                      size='sm'
                      className='h-8 gap-1.5 px-2.5 text-xs font-normal shadow-none'
                      aria-label='卡片宽度'
                    >
                      <Columns3 className='size-3.5' />
                      {selectedCardWidth.label}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end' className='min-w-32'>
                    <DropdownMenuRadioGroup
                      value={cardWidth}
                      onValueChange={(value) =>
                        setCardWidth(value as ContentCardWidth)
                      }
                    >
                      {cardWidthOptions.map((option) => (
                        <DropdownMenuRadioItem
                          key={option.value}
                          value={option.value}
                          className='text-xs'
                        >
                          {option.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant={viewMode === 'masonry' ? 'secondary' : 'outline'}
                size='sm'
                className='size-8 p-0 shadow-none'
                aria-label='瀑布流'
                title='瀑布流'
                onClick={() => setViewMode('masonry')}
              >
                <LayoutGrid className='size-3.5' />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'outline'}
                size='sm'
                className='size-8 p-0 shadow-none'
                aria-label='表格'
                title='表格'
                onClick={() => setViewMode('table')}
              >
                <TableProperties className='size-3.5' />
              </Button>
            </ButtonGroup>
          </div>
        </div>

        {!daily && checked.length > 0 && (
          <div className='flex flex-wrap items-center gap-2 border-t bg-slate-950 px-4 py-2 text-white'>
            <span className='mr-auto text-sm'>已选 {checked.length} 条</span>
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
            {viewMode === 'table' ? (
              renderTable(visible)
            ) : daily ? (
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
                      {renderMasonry(group)}
                    </section>
                  ) : null
                })}
              </>
            ) : (
              renderMasonry(visible)
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
      className='h-svh'
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
