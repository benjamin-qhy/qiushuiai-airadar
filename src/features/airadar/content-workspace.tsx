import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bookmark,
  BriefcaseBusiness,
  ExternalLink,
  FileText,
  Image,
  PanelsTopLeft,
  Play,
  RotateCcw,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { type ContentItem } from './mock-data'

const actionIcons = {
  收藏: Bookmark,
  做成卡片: PanelsTopLeft,
  做成视频: Video,
  写成文章: FileText,
  应用到项目: BriefcaseBusiness,
}

const shortActionLabels: Record<string, string> = {
  收藏: '收藏',
  做成卡片: '卡片',
  做成视频: '视频',
  写成文章: '文章',
  应用到项目: '项目',
}

const junkReasons = [
  '广告营销',
  '引流诱导',
  '无实质内容',
  '标题党或夸大误导',
  '低质搬运或拼凑',
  '明显错误或不可信',
]

function ScoreDetails({ item }: { item: ContentItem }) {
  return (
    <div className='w-56 space-y-2'>
      <div className='flex items-center justify-between font-medium'>
        <span>综合价值分</span>
        <span>{item.score || '未评分'}</span>
      </div>
      {item.scores.map((score) => (
        <div key={score.label} className='flex items-center gap-2 text-xs'>
          <span className='w-16 text-muted-foreground'>{score.label}</span>
          <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-muted'>
            <div
              className='h-full rounded-full bg-primary'
              style={{ width: `${score.value * 20}%` }}
            />
          </div>
          <span className='w-4 text-right'>{score.value || '—'}</span>
        </div>
      ))}
    </div>
  )
}

function ScoreButton({ item }: { item: ContentItem }) {
  const color =
    item.score >= 80
      ? 'bg-emerald-600 text-white hover:bg-emerald-600'
      : item.score >= 60
        ? 'bg-amber-500 text-white hover:bg-amber-500'
        : 'bg-muted text-muted-foreground hover:bg-muted'

  return (
    <>
      <div className='hidden md:block'>
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button className={cn('h-11 min-w-11 rounded-xl text-base', color)}>
                {item.score || '—'}
              </Button>
            </TooltipTrigger>
            <TooltipContent side='left' className='p-3'>
              <ScoreDetails item={item} />
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button className={cn('h-10 min-w-10 rounded-lg md:hidden', color)}>
            {item.score || '—'}
          </Button>
        </PopoverTrigger>
        <PopoverContent align='end' className='w-64'>
          <ScoreDetails item={item} />
        </PopoverContent>
      </Popover>
    </>
  )
}

function KindIcon({ kind }: { kind: ContentItem['kind'] }) {
  if (kind === '视频') return <Play className='size-3.5 fill-current' />
  if (kind === '图文') return <Image className='size-3.5' />
  if (kind === '文章') return <FileText className='size-3.5' />
  return <PanelsTopLeft className='size-3.5' />
}

function ContentCard({
  item,
  selected,
  compact,
  onOpen,
  checked,
  onCheck,
}: {
  item: ContentItem
  selected: boolean
  compact: boolean
  onOpen: () => void
  checked?: boolean
  onCheck?: (checked: boolean) => void
}) {
  return (
    <Card
      className={cn(
        'cursor-pointer py-0 transition-colors hover:bg-muted/30',
        selected && 'border-primary bg-muted/40',
        item.junk && 'opacity-65',
        onCheck && 'relative'
      )}
      onClick={onOpen}
    >
      {onCheck && (
        <div
          className='absolute top-5 left-4 z-10'
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox checked={checked} onCheckedChange={(value) => onCheck(value === true)} />
        </div>
      )}
      <CardContent className={cn('p-4', !compact && 'sm:p-5', onCheck && 'pl-11 sm:pl-12')}>
        <div className='mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
          <Badge variant='outline' className='gap-1 font-normal'>
            <KindIcon kind={item.kind} /> {item.kind}
          </Badge>
          <span>{item.source}</span>
          <span>·</span>
          <span className='truncate'>{item.author}</span>
          <span>·</span>
          <span>{item.time}</span>
          {item.junk && <Badge variant='destructive'>{item.junk.source} 垃圾</Badge>}
        </div>
        <div className='flex items-start gap-3'>
          <div className='min-w-0 flex-1'>
            <h3 className={cn('font-semibold tracking-tight', !compact && 'text-lg')}>
              {item.title}
            </h3>
            {!compact && (
              <p className='mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground'>
                {item.summary}
              </p>
            )}
          </div>
          <ScoreButton item={item} />
        </div>
        {!compact && (
          <div className='mt-3 flex flex-wrap items-center gap-2'>
            {item.tags.map((tag) => (
              <Badge key={tag} variant='secondary' className='font-normal'>
                {tag}
              </Badge>
            ))}
            <span className='text-xs text-muted-foreground'>{item.engagement}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ContentDetail({
  item,
  onClose,
  onPrevious,
  onNext,
}: {
  item: ContentItem
  onClose: () => void
  onPrevious: () => void
  onNext: () => void
}) {
  const [actions, setActions] = useState<string[]>([])
  const [junk, setJunk] = useState(item.junk)

  const toggleAction = (action: string) => {
    if (junk) return
    setActions((current) =>
      current.includes(action)
        ? current.filter((value) => value !== action)
        : [...current, action]
    )
  }

  return (
    <div className='flex h-full min-h-0 flex-col bg-background'>
      <div className='flex items-center gap-2 border-b px-4 py-3'>
        <Button variant='ghost' size='icon' className='lg:hidden' onClick={onClose}>
          <ArrowLeft />
          <span className='sr-only'>返回列表</span>
        </Button>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
            <span>{item.source}</span>
            <span>·</span>
            <span>{item.author}</span>
          </div>
          <p className='truncate font-medium'>{item.title}</p>
        </div>
        <Button variant='ghost' size='icon' onClick={onPrevious} title='上一条'>
          <ArrowUp />
        </Button>
        <Button variant='ghost' size='icon' onClick={onNext} title='下一条'>
          <ArrowDown />
        </Button>
        <Button variant='outline' size='sm' className='hidden gap-1.5 sm:flex'>
          <ExternalLink /> 打开原文
        </Button>
        <Button variant='ghost' size='icon' className='hidden lg:inline-flex' onClick={onClose} title='关闭详情'>
          <X />
        </Button>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto p-4 sm:p-6'>
        {junk && (
          <div className='mb-4 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm'>
            <span>{junk.source} 标记：{junk.reason}</span>
            <Button size='sm' variant='outline' onClick={() => setJunk(undefined)}>
              <RotateCcw /> 撤销
            </Button>
          </div>
        )}

        <div className='mb-5 flex items-start gap-4'>
          <div className='min-w-0 flex-1'>
            <div className='mb-2 flex flex-wrap gap-2'>
              <Badge>{item.level}</Badge>
              <Badge variant='outline'>{item.kind}</Badge>
              <Badge variant={item.status === '已完成' ? 'secondary' : 'destructive'}>
                {item.status}
              </Badge>
            </div>
            <h2 className='text-xl font-bold leading-8 sm:text-2xl'>{item.title}</h2>
            <p className='mt-2 text-sm text-muted-foreground'>{item.engagement}</p>
          </div>
          <ScoreButton item={item} />
        </div>

        <Tabs defaultValue='content'>
          <TabsList className='grid w-full grid-cols-3'>
            <TabsTrigger value='content'>内容</TabsTrigger>
            <TabsTrigger value='analysis'>AI 分析</TabsTrigger>
            <TabsTrigger value='capture'>采集信息</TabsTrigger>
          </TabsList>
          <TabsContent value='content' className='space-y-5 pt-3'>
            {item.kind === '视频' && (
              <div className='relative aspect-video overflow-hidden rounded-xl border bg-muted'>
                <img
                  src='/images/shadcn-admin.png'
                  alt='视频封面示例'
                  className='h-full w-full object-cover opacity-80'
                />
                <div className='absolute inset-0 grid place-items-center'>
                  <Button size='lg' className='rounded-full'><Play className='fill-current' />播放</Button>
                </div>
              </div>
            )}
            <p className='text-base leading-8'>{item.body}</p>
            {item.kind === '视频' && (
              <div className='rounded-xl border p-4'>
                <h3 className='mb-2 font-medium'>字幕</h3>
                <p className='text-sm leading-7 text-muted-foreground'>{item.body}</p>
              </div>
            )}
          </TabsContent>
          <TabsContent value='analysis' className='space-y-5 pt-3'>
            <div className='rounded-xl border p-4'>
              <h3 className='mb-2 font-medium'>摘要</h3>
              <p className='text-sm leading-7 text-muted-foreground'>{item.summary}</p>
            </div>
            <ScoreDetails item={item} />
          </TabsContent>
          <TabsContent value='capture' className='space-y-3 pt-3 text-sm'>
            {[
              ['内容 ID', item.id],
              ['发现来源', `${item.source} · ${item.author}`],
              ['补全状态', item.status],
              ['互动快照', item.engagement],
              ['正文保存', 'Markdown 主文件'],
              ['最近更新', item.time],
            ].map(([label, value]) => (
              <div key={label} className='flex justify-between gap-6 border-b py-2'>
                <span className='text-muted-foreground'>{label}</span>
                <span className='text-right'>{value}</span>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      <div className='flex flex-nowrap items-center gap-1 overflow-x-auto border-t bg-background p-2 sm:p-3'>
        {Object.entries(actionIcons).map(([action, Icon]) => (
          <Button
            key={action}
            size='sm'
            variant={actions.includes(action) ? 'secondary' : 'ghost'}
            disabled={!!junk}
            className='h-12 min-w-12 flex-1 flex-col gap-0.5 px-1 text-[11px] sm:h-8 sm:flex-none sm:flex-row sm:gap-1.5 sm:px-3 sm:text-xs'
            onClick={() => toggleAction(action)}
          >
            <Icon className={cn('size-3.5', actions.includes(action) && 'fill-current')} />
            <span className='sm:hidden'>{shortActionLabels[action]}</span>
            <span className='hidden sm:inline'>{action}</span>
          </Button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size='sm' variant='ghost' className='ms-auto h-12 min-w-12 flex-col gap-0.5 px-1 text-[11px] text-destructive hover:text-destructive sm:h-8 sm:flex-row sm:gap-1.5 sm:px-3 sm:text-xs'>
              <Trash2 /> <span>垃圾</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            {junkReasons.map((reason) => (
              <DropdownMenuItem
                key={reason}
                onClick={() => {
                  setJunk({ source: '人工', reason })
                  setActions([])
                  toast.success(`已标记：${reason}`)
                }}
              >
                {reason}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export function ContentWorkspace({
  items,
  selectedIds,
  onSelectionChange,
}: {
  items: ContentItem[]
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedIndex = useMemo(
    () => items.findIndex((item) => item.id === selectedId),
    [items, selectedId]
  )
  const selected = selectedIndex >= 0 ? items[selectedIndex] : null

  const chooseAt = useCallback(
    (index: number) => {
      if (!items.length) return
      const normalized = (index + items.length) % items.length
      setSelectedId(items[normalized].id)
    },
    [items]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.key === 'Escape') setSelectedId(null)
      if (selected && (event.key === 'ArrowDown' || event.key.toLowerCase() === 'j')) {
        event.preventDefault()
        chooseAt(selectedIndex + 1)
      }
      if (selected && (event.key === 'ArrowUp' || event.key.toLowerCase() === 'k')) {
        event.preventDefault()
        chooseAt(selectedIndex - 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selected, selectedIndex, chooseAt])

  const list = (
    <div className={cn('space-y-3', selected && 'p-3')}>
      {items.map((item) => (
        <ContentCard
          key={item.id}
          item={item}
          compact={!!selected}
          selected={selectedId === item.id}
          onOpen={() => setSelectedId(item.id)}
          checked={selectedIds?.includes(item.id)}
          onCheck={
            onSelectionChange
              ? (checked) =>
                  onSelectionChange(
                    checked
                      ? [...(selectedIds ?? []), item.id]
                      : (selectedIds ?? []).filter((id) => id !== item.id)
                  )
              : undefined
          }
        />
      ))}
    </div>
  )

  if (!selected) return list

  return (
    <>
      <div className='hidden h-[calc(100svh-13.5rem)] min-h-[560px] overflow-hidden rounded-xl border lg:block'>
        <ResizablePanelGroup
          orientation='horizontal'
          defaultLayout={
            JSON.parse(localStorage.getItem('airadar-content-layout') || 'null') || {
              list: 38,
              detail: 62,
            }
          }
          onLayoutChanged={(layout) =>
            localStorage.setItem('airadar-content-layout', JSON.stringify(layout))
          }
        >
          <ResizablePanel id='list' minSize='28' maxSize='55'>
            <div className='h-full overflow-y-auto'>{list}</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id='detail' minSize='45'>
            <ContentDetail
              key={selected.id}
              item={selected}
              onClose={() => setSelectedId(null)}
              onPrevious={() => chooseAt(selectedIndex - 1)}
              onNext={() => chooseAt(selectedIndex + 1)}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <div className='fixed inset-0 z-50 bg-background lg:hidden'>
        <ContentDetail
          key={selected.id}
          item={selected}
          onClose={() => setSelectedId(null)}
          onPrevious={() => chooseAt(selectedIndex - 1)}
          onNext={() => chooseAt(selectedIndex + 1)}
        />
      </div>
    </>
  )
}
