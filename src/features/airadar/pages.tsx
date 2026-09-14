import { useMemo, useState } from 'react'
import {
  Activity,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Database,
  Download,
  Filter,
  HardDrive,
  ListFilter,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  SearchIcon,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ContentWorkspace } from './content-workspace'
import { contentItems } from './mock-data'
import { SourcesSettingsPrototype } from './source-settings-prototype'

function AppHeader() {
  return (
    <Header fixed>
      <Search className='me-auto' placeholder='搜索内容或运行命令' />
      <Button variant='ghost' size='sm' className='hidden gap-2 text-emerald-700 sm:flex'>
        <span className='size-2 rounded-full bg-emerald-500' />
        系统正常
      </Button>
      <ThemeSwitch />
      <ConfigDrawer />
    </Header>
  )
}

function PageHeading({
  title,
  description,
  actions,
}: {
  title: string
  description: string
  actions?: React.ReactNode
}) {
  return (
    <div className='flex flex-wrap items-end justify-between gap-3'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>{title}</h1>
        <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
      </div>
      {actions}
    </div>
  )
}

export function DailyFeedPage() {
  const [level, setLevel] = useState<'core' | 'explore'>('core')
  const items = contentItems.filter((item) =>
    level === 'core' ? item.level === '核心精选' : item.level === '探索候选'
  )

  return (
    <>
      <AppHeader />
      <Main fluid className='space-y-5'>
        <PageHeading
          title='每日精选'
          description='今天真正值得花时间看的内容'
          actions={
            <div className='flex items-center gap-2'>
              <Button variant='outline' size='icon'><ChevronLeft /></Button>
              <Button variant='outline' className='gap-2'><CalendarDays />2026 年 9 月 13 日</Button>
              <Button variant='outline' size='icon' disabled><ChevronRight /></Button>
            </div>
          }
        />

        <div className='flex flex-wrap items-center justify-between gap-3'>
          <Tabs value={level} onValueChange={(value) => setLevel(value as 'core' | 'explore')}>
            <TabsList>
              <TabsTrigger value='core'>核心精选 <Badge className='ms-2'>2</Badge></TabsTrigger>
              <TabsTrigger value='explore'>探索候选 <Badge variant='secondary' className='ms-2'>2</Badge></TabsTrigger>
            </TabsList>
          </Tabs>
          <span className='text-xs text-muted-foreground'>08:30 更新 · 数量不设上限</span>
        </div>

        <ContentWorkspace items={items} />
      </Main>
    </>
  )
}

export function AllContentsPage() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const filtered = useMemo(
    () =>
      contentItems.filter((item) => {
        const matchesQuery = `${item.title}${item.author}${item.source}`.toLowerCase().includes(query.toLowerCase())
        const matchesStatus =
          status === 'all' ||
          (status === 'failed' && item.status === '补全失败') ||
          (status === 'junk' && !!item.junk) ||
          (status === 'waiting' && item.status === '等待转写')
        return matchesQuery && matchesStatus
      }),
    [query, status]
  )

  return (
    <>
      <AppHeader />
      <Main fluid className='space-y-5'>
        <PageHeading
          title='全部内容'
          description='所有已发现、处理中、失败、低分和垃圾内容都在这里'
          actions={<Button variant='outline' className='gap-2'><Download />导出当前结果</Button>}
        />

        <div className='flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3'>
          <div className='relative min-w-56 flex-1'>
            <SearchIcon className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder='搜索标题、作者或来源' className='pl-9' />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className='w-36'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>全部状态</SelectItem>
              <SelectItem value='failed'>补全失败</SelectItem>
              <SelectItem value='waiting'>等待转写</SelectItem>
              <SelectItem value='junk'>垃圾内容</SelectItem>
            </SelectContent>
          </Select>
          <Button variant='outline'><Filter />更多筛选</Button>
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <Checkbox
            checked={selected.length === filtered.length && filtered.length > 0}
            onCheckedChange={(checked) => setSelected(checked ? filtered.map((item) => item.id) : [])}
          />
          <span className='text-sm text-muted-foreground'>已选择 {selected.length} 条</span>
          <Button size='sm' variant='outline' disabled={!selected.length} onClick={() => toast.success('已提交符合条件的补全重试')}>
            <RefreshCw />重试补全
          </Button>
          <Button size='sm' variant='outline' disabled={!selected.length} onClick={() => toast.success('已提交可转写的视频')}>
            <Play />启动转写
          </Button>
          <Button size='sm' variant='outline' disabled={!selected.length} onClick={() => toast.success('已提交重新分析')}>
            <Sparkles />重新分析
          </Button>
          <Badge variant='secondary' className='ms-auto'>{filtered.length} 条结果</Badge>
        </div>

        <ContentWorkspace
          items={filtered}
          selectedIds={selected}
          onSelectionChange={setSelected}
        />
      </Main>
    </>
  )
}

export function SourcesPage() {
  return <SourcesSettingsPrototype />
}

const runs = [
  ['08:30 每日流水线', '已完成', '39 条', '7 分 42 秒'],
  ['08:00 信源增量抓取', '部分失败', '44 条', '4 分 16 秒'],
  ['07:30 互动数据更新', '已完成', '128 条', '2 分 08 秒'],
  ['07:00 信源增量抓取', '已完成', '36 条', '3 分 51 秒'],
]

export function OperationsPage() {
  return (
    <>
      <AppHeader />
      <Main fluid className='space-y-5'>
        <PageHeading title='运行状态' description='查看当前任务、失败内容和供应商健康状态' actions={<Button onClick={() => toast.success('已启动一次完整流水线')}><Play />立即运行</Button>} />
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          {[
            ['系统状态', '正常', CheckCircle2, '6 个信源正在运行'],
            ['处理中', '12', Activity, '8 分析 · 4 补全'],
            ['需要处理', '3', CircleAlert, '2 补全失败 · 1 待转写'],
            ['供应商', '8/9', Bot, '1 个线路已自动切换'],
          ].map(([label, value, Icon, note]) => {
            const IconComponent = Icon as typeof Activity
            return <Card key={label as string}><CardHeader className='flex-row items-center justify-between pb-2'><CardDescription>{label as string}</CardDescription><IconComponent className='size-4 text-muted-foreground' /></CardHeader><CardContent><p className='text-2xl font-bold'>{value as string}</p><p className='mt-1 text-xs text-muted-foreground'>{note as string}</p></CardContent></Card>
          })}
        </div>
        <div className='grid gap-4 xl:grid-cols-[1.35fr_1fr]'>
          <Card>
            <CardHeader><CardTitle>最近运行</CardTitle><CardDescription>所有定时与手工任务都会留下记录</CardDescription></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>任务</TableHead><TableHead>结果</TableHead><TableHead>数量</TableHead><TableHead className='text-right'>耗时</TableHead></TableRow></TableHeader>
                <TableBody>{runs.map((run) => <TableRow key={run[0]}><TableCell className='font-medium'>{run[0]}</TableCell><TableCell><Badge variant={run[1] === '部分失败' ? 'destructive' : 'secondary'}>{run[1]}</Badge></TableCell><TableCell>{run[2]}</TableCell><TableCell className='text-right'>{run[3]}</TableCell></TableRow>)}</TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>需要处理</CardTitle><CardDescription>失败不会阻塞其他内容</CardDescription></CardHeader>
            <CardContent className='space-y-3'>
              {contentItems.filter((item) => item.status !== '已完成').map((item) => (
                <div key={item.id} className='rounded-lg border p-3'>
                  <div className='flex items-start justify-between gap-3'><div><p className='line-clamp-1 text-sm font-medium'>{item.title}</p><p className='mt-1 text-xs text-muted-foreground'>{item.source} · {item.status}</p></div><Button size='sm' variant='outline' onClick={() => toast.success('任务已重新提交')}><RotateCcw />处理</Button></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  )
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className='space-y-5'>{children}</CardContent></Card>
}

export function SettingsPage() {
  const save = () => toast.success('原型：配置已保存为新版本')
  return (
    <>
      <AppHeader />
      <Main fluid className='space-y-5'>
        <PageHeading title='配置中心' description='所有可调整参数集中在这里，并保留版本与回退记录' actions={<Button onClick={save}><Save />保存新版本</Button>} />
        <Tabs defaultValue='profile'>
          <TabsList className='h-auto w-full justify-start overflow-x-auto'>
            <TabsTrigger value='profile'><UserRound />个人画像</TabsTrigger>
            <TabsTrigger value='score'><SlidersHorizontal />评分规则</TabsTrigger>
            <TabsTrigger value='provider'><Bot />模型与供应商</TabsTrigger>
            <TabsTrigger value='capture'><ListFilter />采集参数</TabsTrigger>
            <TabsTrigger value='storage'><HardDrive />存储</TabsTrigger>
          </TabsList>
          <TabsContent value='profile' className='pt-4'><SettingsSection title='个人画像 v1' description='只允许人工修改；保存后生成不可变版本'><div className='space-y-2'><Label>个人背景</Label><Textarea defaultValue='20+ 年技术、产品、方案与销售经验；关注可实际应用的 AI 方法和产品机会。' rows={4} /></div><div className='space-y-2'><Label>关注主题</Label><Textarea defaultValue={'AI 智能体、AI 编程、开源 GitHub 项目\nAI 知识库、RAG、记忆系统\nAI 应用、企业落地\nAI 个人大脑、AI 记忆\nAI 技巧、Pi Agent 与 Skill\n产品增长策略、自媒体'} rows={7} /></div></SettingsSection></TabsContent>
          <TabsContent value='score' className='pt-4'><SettingsSection title='综合价值分' description='启用权重合计必须为 100%'><div className='grid gap-3 sm:grid-cols-2'>{[['主题匹配','20'],['实质性','15'],['可信度','15'],['新颖性','10'],['可操作性','15'],['工作价值','15'],['清晰完整','10']].map(([label,value]) => <div key={label} className='flex items-center justify-between gap-3 rounded-lg border p-3'><Label>{label}</Label><div className='flex items-center gap-2'><Input className='w-20 text-right' defaultValue={value} /><span>%</span></div></div>)}</div><Separator /><div className='grid gap-4 sm:grid-cols-2'><div className='space-y-2'><Label>核心精选阈值</Label><Input defaultValue='80' /></div><div className='space-y-2'><Label>探索候选阈值</Label><Input defaultValue='60' /></div></div></SettingsSection></TabsContent>
          <TabsContent value='provider' className='pt-4'><SettingsSection title='有序供应商路线' description='报错后按顺序自动切换'><div className='space-y-3'>{['综合分析：Claude → OpenAI → Gemini','图片理解：Gemini → OpenAI','语音转写：供应商 A → 供应商 B'].map((text,index) => <div key={text} className='flex items-center gap-3 rounded-lg border p-3'><span className='grid size-7 place-items-center rounded-full bg-primary text-sm text-primary-foreground'>{index + 1}</span><span className='flex-1 text-sm'>{text}</span><Button size='sm' variant='outline'>调整顺序</Button></div>)}</div></SettingsSection></TabsContent>
          <TabsContent value='capture' className='pt-4'><SettingsSection title='采集与转写' description='所有数字均可修改，不写死在程序中'><div className='grid gap-4 sm:grid-cols-2'><div className='space-y-2'><Label>默认抓取周期（分钟）</Label><Input defaultValue='30' /></div><div className='space-y-2'><Label>供应商原始响应保留（天）</Label><Input defaultValue='30' /></div></div><div className='flex items-center justify-between rounded-lg border p-4'><div><p className='font-medium'>YouTube 只抓普通视频</p><p className='text-sm text-muted-foreground'>默认开启，可手工修改</p></div><Switch defaultChecked /></div><div className='flex items-center justify-between rounded-lg border p-4'><div><p className='font-medium'>无字幕时自动转写</p><p className='text-sm text-muted-foreground'>默认关闭，由人工点击转写</p></div><Switch /></div></SettingsSection></TabsContent>
          <TabsContent value='storage' className='pt-4'><SettingsSection title='Markdown 主数据' description='SQLite 只作可重建索引，不提供备份功能'><div className='grid gap-4 sm:grid-cols-2'><div className='space-y-2'><Label>数据目录</Label><Input defaultValue='/data/qiushuiai-airadar' /></div><div className='space-y-2'><Label>临时视频保留（小时）</Label><Input defaultValue='24' /></div></div><div className='flex items-center gap-3 rounded-lg border p-4'><Database className='size-5 text-muted-foreground' /><div><p className='font-medium'>索引状态正常</p><p className='text-sm text-muted-foreground'>上次从 Markdown 核对：3 分钟前</p></div><Button variant='outline' className='ms-auto'>重建 SQLite</Button></div></SettingsSection></TabsContent>
        </Tabs>
      </Main>
    </>
  )
}
