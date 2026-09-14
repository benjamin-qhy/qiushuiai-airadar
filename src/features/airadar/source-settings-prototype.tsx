/**
 * PROTOTYPE ONLY: three variants of source, provider, and runtime settings,
 * switchable with `?variant=A|B|C` on the existing `/sources` route.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Eye,
  FileClock,
  Globe2,
  Layers3,
  ListChecks,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search as GlobalSearch } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ConfigDrawer } from '@/components/config-drawer'

type Variant = 'A' | 'B' | 'C'

const variants: Array<{ key: Variant; name: string }> = [
  { key: 'A', name: '主从工作台（推荐）' },
  { key: 'B', name: '平台健康看板' },
  { key: 'C', name: '参数层级树' },
]

const sources = [
  { id: 'x-lina', platform: 'X', name: 'Lina Chen', account: '@lina_ai', enabled: true, status: '正常', last: '今天 08:02', found: 18, provider: 'TikHub', schedule: '每天 08:00' },
  { id: 'yt-engineer', platform: 'YouTube', name: 'AI Engineer', account: '@ai-engineer', enabled: true, status: '正常', last: '今天 07:41', found: 4, provider: 'YouTube Data API', schedule: '每天 08:00' },
  { id: 'rss-lenny', platform: 'RSS', name: "Lenny's Newsletter", account: 'lennysnewsletter.com', enabled: true, status: '正常', last: '今天 07:36', found: 2, provider: 'RSS 原生', schedule: '每天 08:00' },
  { id: 'dy-aigc', platform: '抖音', name: 'AIGC 产品观察', account: 'sec_uid_82…9a', enabled: true, status: '警告', last: '今天 07:22', found: 0, provider: '供应商 B', schedule: '每天 08:00' },
  { id: 'wx-agent', platform: '视频号', name: '智能体实践', account: 'finder_37…2f', enabled: false, status: '停用', last: '9 月 10 日', found: 7, provider: '供应商 A', schedule: '每天 08:00' },
  { id: 'rednote-brain', platform: '小红书', name: '个人大脑实验室', account: 'red_id_19…cc', enabled: true, status: '正常', last: '今天 07:10', found: 9, provider: '供应商 A', schedule: '每天 08:00' },
]

const providers = [
  { name: 'TikHub', state: '正常', latency: '1.2 秒', key: 'tk_live_••••••82', note: '首选线路' },
  { name: 'Apify', state: '冷却中', latency: '—', key: 'apify_••••••17', note: '12 分钟后重试' },
  { name: '自建适配器', state: '正常', latency: '2.8 秒', key: '无需密钥', note: '末位兜底' },
]

function PrototypeHeader() {
  return (
    <Header fixed>
      <GlobalSearch className='me-auto' placeholder='搜索信源或运行命令' />
      <Button variant='ghost' size='sm' className='hidden gap-2 text-emerald-700 sm:flex'>
        <span className='size-2 rounded-full bg-emerald-500' />系统正常
      </Button>
      <ThemeSwitch />
      <ConfigDrawer />
    </Header>
  )
}

function PageTitle({ children }: { children?: React.ReactNode }) {
  return (
    <div className='flex flex-wrap items-end justify-between gap-3'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>信源与采集配置</h1>
        <p className='mt-1 text-sm text-muted-foreground'>管理六类信源、供应商顺序和最终生效的采集参数</p>
      </div>
      {children}
    </div>
  )
}

function ResultBanner({ text }: { text: string }) {
  return (
    <div className='flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'>
      <CheckCircle2 className='size-4' />
      <span>{text}</span>
    </div>
  )
}

function SourceList({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const [checked, setChecked] = useState<string[]>([])
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='space-y-3 border-b p-3'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input className='pl-9' placeholder='搜索名称或账号' />
        </div>
        <div className='flex items-center gap-2'>
          <Checkbox
            checked={checked.length === sources.length}
            onCheckedChange={(value) => setChecked(value ? sources.map((item) => item.id) : [])}
          />
          <span className='text-xs text-muted-foreground'>已选 {checked.length} 个</span>
          <Button size='sm' variant='outline' disabled={!checked.length} className='ms-auto'>批量配置</Button>
        </div>
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto p-2'>
        {sources.map((source) => (
          <div key={source.id} className='relative flex items-start gap-2'>
            <Checkbox
              className='mt-5 ms-2'
              checked={checked.includes(source.id)}
              onCheckedChange={(value) => setChecked((current) => value ? [...current, source.id] : current.filter((id) => id !== source.id))}
            />
            <button
              className={cn('my-1 min-w-0 flex-1 rounded-lg border p-3 text-left transition-colors hover:bg-muted/60', selected === source.id && 'border-foreground bg-muted')}
              onClick={() => onSelect(source.id)}
            >
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0'>
                  <div className='flex items-center gap-2'><Badge variant='outline'>{source.platform}</Badge><span className='truncate font-medium'>{source.name}</span></div>
                  <p className='mt-1 truncate text-xs text-muted-foreground'>{source.account}</p>
                </div>
                <Badge variant={source.status === '警告' ? 'destructive' : 'secondary'}>{source.status}</Badge>
              </div>
              <p className='mt-2 text-xs text-muted-foreground'>{source.last} · 发现 {source.found} 条</p>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function SourceDetail({
  sourceId,
  onAction,
  onOpenProviders,
}: {
  sourceId: string
  onAction: (text: string) => void
  onOpenProviders: () => void
}) {
  const source = sources.find((item) => item.id === sourceId) ?? sources[0]

  return (
    <div className='h-full min-h-0 overflow-y-auto'>
      <div className='sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-background/95 p-4 backdrop-blur'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'><Badge>{source.platform}</Badge><h2 className='truncate text-lg font-semibold'>{source.name}</h2></div>
          <p className='mt-1 text-xs text-muted-foreground'>最终生效：{source.schedule} · {source.provider}</p>
        </div>
        <Switch defaultChecked={source.enabled} />
        <Button variant='outline' onClick={() => onAction(`已生成 ${source.name} 的试抓预览：发现 3 条，不保存。`)}><Eye />试抓预览</Button>
        <AlertDialog>
          <AlertDialogTrigger asChild><Button><Save />预览并保存</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认保存为新版本？</AlertDialogTitle>
              <AlertDialogDescription>只影响之后开始的任务，正在运行的任务继续使用原配置。</AlertDialogDescription>
            </AlertDialogHeader>
            <div className='space-y-2 rounded-lg border p-3 text-sm'>
              <div className='flex justify-between gap-4'><span className='text-muted-foreground'>首次回看天数</span><span><s className='text-muted-foreground'>14 天</s> → 7 天</span></div>
              <div className='flex justify-between gap-4'><span className='text-muted-foreground'>影响范围</span><span>{source.name} 1 个信源</span></div>
              <div className='flex justify-between gap-4'><span className='text-muted-foreground'>新版本</span><span>v13</span></div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>继续修改</AlertDialogCancel>
              <AlertDialogAction onClick={() => onAction('配置已保存为版本 v13，只影响之后启动的任务。')}>确认保存</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Tabs defaultValue='overview' className='p-4'>
        <TabsList className='h-auto w-full justify-start overflow-x-auto'>
          <TabsTrigger value='overview'>概览</TabsTrigger>
          <TabsTrigger value='capture'>采集参数</TabsTrigger>
          <TabsTrigger value='providers'>生效供应商</TabsTrigger>
          <TabsTrigger value='history'>版本与审计</TabsTrigger>
        </TabsList>
        <TabsContent value='overview' className='space-y-4 pt-4'>
          <div className='grid gap-3 sm:grid-cols-3'>
            {[
              ['最近采集', source.last, Clock3],
              ['本轮发现', `${source.found} 条`, ListChecks],
              ['当前线路', source.provider, Bot],
            ].map(([label, value, Icon]) => {
              const ItemIcon = Icon as typeof Clock3
              return <Card key={label as string}><CardContent className='flex items-start gap-3 p-4'><ItemIcon className='mt-0.5 size-4 text-muted-foreground' /><div><p className='text-xs text-muted-foreground'>{label as string}</p><p className='mt-1 font-medium'>{value as string}</p></div></CardContent></Card>
            })}
          </div>
          <Card>
            <CardHeader><CardTitle className='text-base'>最近一次运行</CardTitle><CardDescription>运行结果和进度推进证据</CardDescription></CardHeader>
            <CardContent className='grid gap-3 text-sm sm:grid-cols-2'>
              <div className='rounded-lg bg-muted/50 p-3'><p className='text-muted-foreground'>结果</p><p className='mt-1 font-medium'>部分成功：18 条保存，1 条解析失败</p></div>
              <div className='rounded-lg bg-muted/50 p-3'><p className='text-muted-foreground'>采集进度</p><p className='mt-1 font-medium'>已安全推进到 2026-09-13 08:02</p></div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value='capture' className='space-y-4 pt-4'>
          <Card>
            <CardHeader><CardTitle className='text-base'>最终生效参数</CardTitle><CardDescription>每项都显示来源；此处修改将形成“具体信源”覆盖</CardDescription></CardHeader>
            <CardContent className='grid gap-4 sm:grid-cols-2'>
              {[
                ['采集计划', '每天 08:00', '继承：X 平台'],
                ['单轮上限', '100', '继承：全系统'],
                ['首次回看天数', '7', '此信源覆盖'],
                ['首次最多内容', '20', '继承：全系统'],
                ['自动转写', '关闭', '继承：X 平台'],
                ['原始响应保留', '30 天', '继承：全系统'],
              ].map(([label, value, origin]) => (
                <div key={label} className='space-y-2 rounded-lg border p-3'>
                  <div className='flex items-center justify-between gap-2'><Label>{label}</Label><Badge variant={origin === '此信源覆盖' ? 'default' : 'outline'}>{origin}</Badge></div>
                  <Input defaultValue={value} />
                  <Button size='sm' variant='ghost' className='px-0 text-xs'>恢复继承值</Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className='border-dashed'>
            <CardHeader><CardTitle className='flex items-center gap-2 text-base'><ShieldCheck className='size-4' />固定规则（不可编辑）</CardTitle><CardDescription>内容身份、完整补全、正文冻结、缺失互动为空和归档保留关系等规则只能查看。</CardDescription></CardHeader>
          </Card>
        </TabsContent>
        <TabsContent value='providers' className='space-y-3 pt-4'>
          <div className='flex flex-wrap items-center justify-between gap-2'><div><h3 className='font-semibold'>{source.platform} 平台生效线路</h3><p className='text-sm text-muted-foreground'>这是平台共享配置，不属于单个博主。</p></div><Button variant='outline' onClick={onOpenProviders}><Settings2 />前往平台供应商</Button></div>
          {providers.map((provider, index) => (
            <Card key={provider.name}>
              <CardContent className='flex flex-wrap items-center gap-3 p-4'>
                <span className='grid size-7 place-items-center rounded-full bg-primary text-sm text-primary-foreground'>{index + 1}</span>
                <div className='min-w-40 flex-1'><p className='font-medium'>{provider.name}</p><p className='text-xs text-muted-foreground'>{provider.note}</p></div>
                <Badge variant={provider.state === '冷却中' ? 'destructive' : 'secondary'}>{provider.state}</Badge>
                <span className='text-xs text-muted-foreground'>{provider.latency}</span>
                <Badge variant='outline'>只读</Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value='history' className='space-y-3 pt-4'>
          {[
            ['v12 当前版本', '今天 08:15', '采集计划改为每天 08:00', false],
            ['v11', '9 月 12 日 18:20', '调整 TikHub 为首选线路', true],
            ['v10', '9 月 11 日 09:06', '首次回看从 14 天改为 7 天', true],
          ].map(([version, time, note, canRollback]) => (
            <div key={version as string} className='flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm'><FileClock className='size-4 text-muted-foreground' /><div className='min-w-40 flex-1'><p className='font-medium'>{version as string}</p><p className='text-xs text-muted-foreground'>{time as string} · {note as string}</p></div>{canRollback && <Button size='sm' variant='outline' onClick={() => onAction(`已准备恢复 ${version as string}，保存后形成新版本。`)}><RotateCcw />恢复此版本</Button>}</div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PlatformProviders({ onAction }: { onAction: (text: string) => void }) {
  const platforms = ['X', 'YouTube', 'RSS', '抖音', '视频号', '小红书']
  const [platform, setPlatform] = useState('X')
  const [route, setRoute] = useState(providers)
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= route.length) return
    const next = [...route]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    setRoute(next)
    onAction(`${platform} 平台的供应商顺序已加入草稿。`)
  }

  return (
    <div className='grid min-h-[650px] overflow-hidden rounded-xl border bg-card lg:grid-cols-[240px_minmax(0,1fr)]'>
      <div className='border-b p-3 lg:border-b-0 lg:border-r'>
        <h2 className='mb-3 px-2 font-semibold'>平台类型</h2>
        <div className='space-y-1'>
          {platforms.map((item) => (
            <button key={item} onClick={() => setPlatform(item)} className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted', platform === item && 'bg-muted font-medium')}>
              <Layers3 className='size-4' /><span className='flex-1'>{item}</span><Badge variant='outline'>{item === 'RSS' ? 1 : 3}</Badge><ChevronRight className='size-3' />
            </button>
          ))}
        </div>
      </div>
      <div className='min-w-0 p-4 sm:p-6'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div><Badge>{platform}</Badge><h2 className='mt-2 text-xl font-semibold'>{platform} 采集供应商</h2><p className='mt-1 text-sm text-muted-foreground'>本平台所有信源共享；失败时从上到下依次切换。</p></div>
          <div className='flex gap-2'><Button variant='outline'><Plus />添加供应商</Button><Button onClick={() => onAction(`${platform} 供应商配置已准备保存为新版本。`)}><Save />预览变更</Button></div>
        </div>
        <div className='mt-5 space-y-3'>
          {route.map((provider, index) => (
            <Card key={provider.name}>
              <CardContent className='flex flex-wrap items-center gap-3 p-4'>
                <span className='grid size-8 place-items-center rounded-full bg-primary text-sm text-primary-foreground'>{index + 1}</span>
                <div className='min-w-40 flex-1'><p className='font-medium'>{provider.name}</p><p className='text-xs text-muted-foreground'>{provider.note}</p></div>
                <Badge variant={provider.state === '冷却中' ? 'destructive' : 'secondary'}>{provider.state}</Badge>
                <span className='text-xs text-muted-foreground'>{provider.latency}</span>
                <span className='rounded bg-muted px-2 py-1 font-mono text-xs'>{provider.key}</span>
                <Button size='sm' variant='outline' onClick={() => onAction(`${provider.name} 连接测试成功；密钥仍不回显。`)}>测试连接</Button>
                <Button size='sm' variant='ghost' onClick={() => onAction(`正在替换 ${provider.name} 密钥；保存后旧密钥不可查看。`)}>替换密钥</Button>
                <div className='flex gap-1'><Button size='icon' variant='ghost' disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button><Button size='icon' variant='ghost' disabled={index === route.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button></div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className='mt-5 rounded-lg border border-dashed p-4 text-sm'><div className='flex items-center gap-2 font-medium'><ShieldCheck className='size-4' />密钥保护</div><p className='mt-2 text-muted-foreground'>保存后只显示末尾两位；编辑只能整体替换，不能查看或复制旧密钥。</p></div>
      </div>
    </div>
  )
}

function VariantA() {
  const [selected, setSelected] = useState(sources[0].id)
  const [area, setArea] = useState<'sources' | 'providers'>('sources')
  const [result, setResult] = useState('当前展示完整有效配置，所有操作仅修改原型内存。')
  return (
    <div className='space-y-4'>
      <PageTitle><div className='flex gap-2'>{area === 'sources' ? <><Button variant='outline'><Upload />批量导入</Button><Button><Plus />新增信源</Button></> : <Button><Plus />添加供应商</Button>}</div></PageTitle>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Tabs value={area} onValueChange={(value) => setArea(value as 'sources' | 'providers')}>
          <TabsList><TabsTrigger value='sources'><ListChecks />信源管理</TabsTrigger><TabsTrigger value='providers'><Bot />平台供应商</TabsTrigger></TabsList>
        </Tabs>
        <span className='text-xs text-muted-foreground'>供应商按平台共享；参数按全系统、平台、信源三级继承</span>
      </div>
      <ResultBanner text={result} />
      {area === 'sources' ? (
        <div className='grid min-h-[650px] overflow-hidden rounded-xl border bg-card lg:grid-cols-[340px_minmax(0,1fr)]'>
          <div className='border-b lg:border-b-0 lg:border-r'><SourceList selected={selected} onSelect={setSelected} /></div>
          <SourceDetail key={selected} sourceId={selected} onAction={setResult} onOpenProviders={() => setArea('providers')} />
        </div>
      ) : <PlatformProviders onAction={setResult} />}
    </div>
  )
}

function VariantB() {
  const grouped = useMemo(() => sources.map((source) => ({ ...source, providers: source.platform === 'RSS' ? 1 : 3 })), [])
  return (
    <div className='space-y-5'>
      <PageTitle><Button><Settings2 />批量管理全部平台</Button></PageTitle>
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        {grouped.map((source) => (
          <Card key={source.id} className={cn(source.status === '警告' && 'border-amber-400')}>
            <CardHeader>
              <div className='flex items-start justify-between gap-3'><div><Badge variant='outline'>{source.platform}</Badge><CardTitle className='mt-3 text-base'>{source.name}</CardTitle><CardDescription>{source.account}</CardDescription></div><Switch defaultChecked={source.enabled} /></div>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid grid-cols-3 gap-2 text-center text-xs'>
                <div className='rounded-lg bg-muted p-2'><p className='text-muted-foreground'>信源</p><p className='mt-1 text-base font-semibold'>1</p></div>
                <div className='rounded-lg bg-muted p-2'><p className='text-muted-foreground'>供应商</p><p className='mt-1 text-base font-semibold'>{source.providers}</p></div>
                <div className='rounded-lg bg-muted p-2'><p className='text-muted-foreground'>发现</p><p className='mt-1 text-base font-semibold'>{source.found}</p></div>
              </div>
              <div className='flex items-center justify-between text-sm'><span className='text-muted-foreground'>状态</span><Badge variant={source.status === '警告' ? 'destructive' : 'secondary'}>{source.status}</Badge></div>
              <div className='flex items-center justify-between text-sm'><span className='text-muted-foreground'>生效计划</span><span>{source.schedule}</span></div>
              <div className='flex gap-2'><Button variant='outline' className='flex-1' onClick={() => toast.success('已生成试抓预览')}><Play />试抓</Button><Button className='flex-1'>进入平台</Button></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card><CardHeader><CardTitle>跨平台异常</CardTitle><CardDescription>把需要处理的供应商和信源集中到页面底部</CardDescription></CardHeader><CardContent><div className='flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950'><CircleAlert className='size-4 text-amber-600' /><span className='flex-1'>抖音首选供应商余额不足，已切换到供应商 B。</span><Button size='sm' variant='outline'>查看</Button></div></CardContent></Card>
    </div>
  )
}

const treeItems = [
  { level: 0, icon: Globe2, label: '全系统默认值', badge: '基础' },
  { level: 0, icon: Layers3, label: 'X 平台', badge: '覆盖 3 项' },
  { level: 1, icon: Activity, label: 'Lina Chen', badge: '覆盖 1 项' },
  { level: 0, icon: Layers3, label: 'YouTube 平台', badge: '覆盖 2 项' },
  { level: 1, icon: Activity, label: 'AI Engineer', badge: '继承' },
  { level: 0, icon: Layers3, label: 'RSS 平台', badge: '继承' },
]

function VariantC() {
  const [selected, setSelected] = useState('X 平台')
  return (
    <div className='space-y-4'>
      <PageTitle><Button><Save />保存参数版本</Button></PageTitle>
      <div className='grid min-h-[650px] overflow-hidden rounded-xl border bg-card lg:grid-cols-[300px_minmax(0,1fr)]'>
        <div className='border-b p-3 lg:border-b-0 lg:border-r'>
          <div className='mb-3 flex items-center justify-between'><h2 className='font-semibold'>参数作用范围</h2><Button size='icon' variant='ghost'><Plus /></Button></div>
          <div className='space-y-1'>
            {treeItems.map((item) => {
              const Icon = item.icon
              return <button key={item.label} onClick={() => setSelected(item.label)} className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted', item.level === 1 && 'ps-8', selected === item.label && 'bg-muted font-medium')}><Icon className='size-4' /><span className='flex-1'>{item.label}</span><Badge variant='outline' className='text-[10px]'>{item.badge}</Badge><ChevronRight className='size-3' /></button>
            })}
          </div>
        </div>
        <div className='min-w-0 p-4 sm:p-6'>
          <div className='flex flex-wrap items-start justify-between gap-3'><div><Badge variant='outline'>当前层级</Badge><h2 className='mt-2 text-xl font-semibold'>{selected}</h2><p className='mt-1 text-sm text-muted-foreground'>修改这里时，下级未覆盖项目会自动继承。</p></div><Button variant='outline'><FileClock />查看版本</Button></div>
          <Separator className='my-5' />
          <div className='space-y-5'>
            {[
              ['采集计划', '每天 08:00', '此层覆盖'],
              ['单轮最多接收', '100 条', '继承全系统'],
              ['供应商故障冷却', '30 分钟', '此层覆盖'],
              ['原始响应保留', '30 天', '继承全系统'],
            ].map(([label, value, origin]) => (
              <div key={label} className='grid gap-2 rounded-lg border p-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center'><div><Label>{label}</Label><p className='mt-1 text-xs text-muted-foreground'>{origin}</p></div><Input defaultValue={value} /><Button variant='ghost' size='sm'>清除覆盖</Button></div>
            ))}
          </div>
          <div className='mt-5 rounded-lg border border-dashed p-4'><div className='flex items-center gap-2 font-medium'><ShieldCheck className='size-4' />固定领域规则</div><p className='mt-2 text-sm text-muted-foreground'>只读：内容唯一身份、完整补全后才能分析、正文成功后冻结、缺失互动为空。</p></div>
        </div>
      </div>
    </div>
  )
}

function PrototypeSwitcher({ current, onChange }: { current: Variant; onChange: (variant: Variant) => void }) {
  const index = variants.findIndex((item) => item.key === current)
  const cycle = (direction: -1 | 1) => onChange(variants[(index + direction + variants.length) % variants.length].key)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return
      if (event.key === 'ArrowLeft') cycle(-1)
      if (event.key === 'ArrowRight') cycle(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (!import.meta.env.DEV) return null

  return (
    <div className='fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border bg-foreground p-1.5 text-background shadow-2xl'>
      <Button aria-label='上一种方案' size='icon' variant='ghost' className='rounded-full text-background hover:bg-background/15 hover:text-background' onClick={() => cycle(-1)}><ArrowLeft /></Button>
      <div className='min-w-40 px-2 text-center text-xs font-medium'>{current} · {variants[index].name}</div>
      <Button aria-label='下一种方案' size='icon' variant='ghost' className='rounded-full text-background hover:bg-background/15 hover:text-background' onClick={() => cycle(1)}><ArrowRight /></Button>
    </div>
  )
}

export function SourcesSettingsPrototype() {
  const readVariant = (): Variant => {
    const value = new URLSearchParams(window.location.search).get('variant')
    return value === 'B' || value === 'C' ? value : 'A'
  }
  const [variant, setVariant] = useState<Variant>(readVariant)
  const changeVariant = (next: Variant) => {
    const url = new URL(window.location.href)
    url.searchParams.set('variant', next)
    window.history.replaceState({}, '', url)
    setVariant(next)
  }

  return (
    <>
      <PrototypeHeader />
      <Main fluid className='space-y-5 pb-24'>
        {variant === 'A' && <VariantA />}
        {variant === 'B' && <VariantB />}
        {variant === 'C' && <VariantC />}
      </Main>
      <PrototypeSwitcher current={variant} onChange={changeVariant} />
    </>
  )
}
