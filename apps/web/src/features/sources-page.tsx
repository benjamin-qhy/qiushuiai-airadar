import { useEffect, useMemo, useState } from 'react'
import { Activity, CheckCircle2, FlaskConical, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, post } from '@/lib/api'
import type { ProviderItem, SourceItem } from '@/types'

const typeLabels: Record<string, string> = {
  x: 'X',
  youtube: 'YouTube',
  rss: 'RSS',
  douyin: '抖音',
  wechat_channels: '微信视频号',
  xiaohongshu: '小红书',
}
const healthLabels: Record<string, string> = {
  healthy: '健康',
  warning: '有告警',
  unavailable: '不可用',
  disabled: '已停用',
}

export function SourcesPage() {
  const [sources, setSources] = useState<SourceItem[]>()
  const [providers, setProviders] = useState<ProviderItem[]>()
  const [selected, setSelected] = useState<string>()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [message, setMessage] = useState('')
  const load = () =>
    Promise.all([
      api<{ items: SourceItem[] }>('/api/sources'),
      api<{ items: ProviderItem[] }>('/api/providers'),
    ]).then(([a, b]) => {
      setSources(a.items)
      setProviders(b.items)
      setSelected((current) => current ?? a.items[0]?.id)
    })
  useEffect(() => {
    void load()
  }, [])
  const visible = useMemo(
    () =>
      (sources ?? []).filter(
        (source) =>
          (status === 'all' || source.status === status) &&
          `${source.name} ${source.externalIdentity}`
            .toLowerCase()
            .includes(query.toLowerCase())
      ),
    [sources, status, query]
  )
  const source = sources?.find((item) => item.id === selected)
  async function changeStatus(next: SourceItem['status']) {
    if (!source) return
    await post(`/api/sources/${encodeURIComponent(source.id)}/status`, {
      status: next,
    })
    setMessage(
      `已将「${source.name}」设为${next === 'enabled' ? '启用' : next === 'disabled' ? '停用' : '归档'}`
    )
    await load()
  }
  async function testFetch() {
    if (!source) return
    const data = await post<{
      providerId: string
      items: Array<{ title?: string }>
    }>(`/api/sources/${encodeURIComponent(source.id)}/test-fetch`, {
      execute: true,
    })
    const titles = data.items
      .map((item) => item.title)
      .filter(Boolean)
      .join('；')
    setMessage(
      `试抓成功（${data.providerId}，${data.items.length} 条）${titles ? `：${titles}` : ''}`
    )
  }
  return (
    <div className='p-4 pb-24 md:p-6 lg:pb-6'>
      <div className='mx-auto max-w-[1500px]'>
        <Tabs defaultValue='sources'>
          <TabsList>
            <TabsTrigger value='sources'>信源管理</TabsTrigger>
            <TabsTrigger value='providers'>平台与供应商</TabsTrigger>
          </TabsList>
          <TabsContent value='sources' className='mt-4'>
            <div className='grid min-h-[calc(100svh-9rem)] overflow-hidden rounded-xl border bg-white lg:grid-cols-[380px_1fr]'>
              <section className='border-r'>
                <div className='space-y-3 border-b p-4'>
                  <div>
                    <h2 className='font-semibold'>全部信源</h2>
                    <p className='text-xs text-muted-foreground'>
                      已导入 {sources?.length ?? 0} 个定义
                    </p>
                  </div>
                  <div className='relative'>
                    <Search className='absolute left-3 top-2.5 size-4 text-muted-foreground' />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder='搜索信源'
                      className='pl-9'
                    />
                  </div>
                  <select
                    aria-label='信源状态'
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className='h-9 w-full rounded-md border px-3 text-sm'
                  >
                    <option value='all'>全部状态</option>
                    <option value='enabled'>已启用</option>
                    <option value='disabled'>已停用</option>
                    <option value='archived'>已归档</option>
                  </select>
                </div>
                <div className='max-h-[calc(100svh-20rem)] overflow-y-auto'>
                  {visible.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelected(item.id)}
                      className={`w-full border-b p-4 text-left hover:bg-slate-50 ${selected === item.id ? 'bg-slate-100' : ''}`}
                    >
                      <div className='flex justify-between gap-2'>
                        <span className='font-medium'>{item.name}</span>
                        <Badge
                          variant={
                            item.health === 'healthy' ? 'secondary' : 'outline'
                          }
                        >
                          {healthLabels[item.health]}
                        </Badge>
                      </div>
                      <p className='mt-1 truncate text-xs text-muted-foreground'>
                        {typeLabels[item.type] ?? item.type} ·{' '}
                        {item.externalIdentity}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
              <section className='p-5 md:p-7'>
                {source ? (
                  <>
                    <div className='flex flex-wrap items-start justify-between gap-4'>
                      <div>
                        <Badge variant='outline'>
                          {typeLabels[source.type] ?? source.type}
                        </Badge>
                        <h2 className='mt-3 text-2xl font-semibold'>
                          {source.name}
                        </h2>
                        <p className='mt-1 text-sm text-muted-foreground'>
                          {source.externalIdentity}
                        </p>
                      </div>
                      <div className='flex gap-2'>
                        <Button
                          variant='outline'
                          onClick={() => void testFetch()}
                        >
                          <FlaskConical />
                          试抓预览
                        </Button>
                        <select
                          aria-label='修改信源状态'
                          value={source.status}
                          onChange={(event) =>
                            void changeStatus(
                              event.target.value as SourceItem['status']
                            )
                          }
                          className='h-9 rounded-md border px-3 text-sm'
                        >
                          <option value='enabled'>启用</option>
                          <option value='disabled'>停用</option>
                          <option value='archived'>归档</option>
                        </select>
                      </div>
                    </div>
                    {message && (
                      <p className='mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800'>
                        {message}
                      </p>
                    )}
                    <Tabs defaultValue='overview' className='mt-6'>
                      <TabsList>
                        <TabsTrigger value='overview'>概览</TabsTrigger>
                        <TabsTrigger value='parameters'>有效参数</TabsTrigger>
                        <TabsTrigger value='provider'>供应商</TabsTrigger>
                        <TabsTrigger value='history'>版本记录</TabsTrigger>
                      </TabsList>
                      <TabsContent
                        value='overview'
                        className='mt-5 grid gap-4 sm:grid-cols-3'
                      >
                        <Card>
                          <CardHeader>
                            <CardTitle className='text-sm'>运行健康</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className='flex items-center gap-2 text-lg font-semibold'>
                              <Activity className='size-5 text-emerald-600' />
                              {healthLabels[source.health]}
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardTitle className='text-sm'>最近发现</CardTitle>
                          </CardHeader>
                          <CardContent className='text-2xl font-semibold'>
                            {source.latestAudit?.discovered ?? 0}
                          </CardContent>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardTitle className='text-sm'>
                              成功 / 失败
                            </CardTitle>
                          </CardHeader>
                          <CardContent className='text-2xl font-semibold'>
                            {source.latestAudit?.succeeded ?? 0} /{' '}
                            {source.latestAudit?.failed ?? 0}
                          </CardContent>
                        </Card>
                      </TabsContent>
                      <TabsContent value='parameters' className='mt-5'>
                        <p className='mb-3 text-sm text-muted-foreground'>
                          按 全局 → 平台类型 → 当前信源 三层合并后的实际参数。
                        </p>
                        <pre className='overflow-auto rounded-xl bg-slate-950 p-5 text-xs text-slate-100'>
                          {JSON.stringify(source.effectiveParameters, null, 2)}
                        </pre>
                      </TabsContent>
                      <TabsContent value='provider' className='mt-5'>
                        {(providers ?? [])
                          .filter((item) => item.sourceType === source.type)
                          .map((item) => (
                            <div
                              key={item.id}
                              className='mb-3 flex items-center justify-between rounded-lg border p-4'
                            >
                              <div>
                                <div className='font-medium'>{item.name}</div>
                                <div className='text-xs text-muted-foreground'>
                                  优先级 {item.priority}
                                </div>
                              </div>
                              <Badge variant='outline'>
                                {item.secretStatus?.configured === false
                                  ? '凭据未配置'
                                  : '可用'}
                              </Badge>
                            </div>
                          ))}
                      </TabsContent>
                      <TabsContent
                        value='history'
                        className='mt-5 text-sm text-muted-foreground'
                      >
                        参数版本由“系统配置”统一保存与回退，信源身份和固定规则不可修改。
                      </TabsContent>
                    </Tabs>
                  </>
                ) : (
                  <div className='grid h-full place-items-center text-muted-foreground'>
                    选择一个信源查看详情
                  </div>
                )}
              </section>
            </div>
          </TabsContent>
          <TabsContent value='providers' className='mt-4'>
            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
              {(providers ?? []).map((provider) => (
                <Card key={provider.id}>
                  <CardHeader>
                    <div className='flex items-start justify-between'>
                      <div>
                        <CardTitle>{provider.name}</CardTitle>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          {typeLabels[provider.sourceType] ??
                            provider.sourceType}{' '}
                          · 优先级 {provider.priority}
                        </p>
                      </div>
                      <CheckCircle2 className='size-5 text-emerald-600' />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className='mb-4 rounded-lg bg-slate-50 p-3 text-sm'>
                      凭据：
                      {provider.secretStatus
                        ? provider.secretStatus.configured
                          ? (provider.secretStatus.maskedValue ?? '已配置')
                          : '未配置'
                        : '无需凭据'}
                    </div>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() =>
                        void post<{ items?: unknown[] }>(
                          `/api/providers/${encodeURIComponent(provider.id)}/test`,
                          {}
                        )
                          .then((result) =>
                            setMessage(
                              `${provider.name} 远端验证成功，返回 ${result.items?.length ?? 0} 条预览`
                            )
                          )
                          .catch((error) => setMessage(String(error)))
                      }
                    >
                      测试连接
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            {message && <p className='mt-4 text-sm'>{message}</p>}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
