import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleAlert,
  Info,
  LoaderCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, post, put } from '@/lib/api'
import type { ProviderItem, ProviderRouteItem } from '@/types'

const typeLabels: Record<string, string> = {
  x: 'X',
  youtube: 'YouTube',
  rss: 'RSS',
  web: '网页',
}

type ProviderAction = 'saving' | 'testing' | 'success' | 'error'

interface ProviderFeedback {
  action: ProviderAction
  message: string
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function CollectionProvidersPanel() {
  const [providers, setProviders] = useState<ProviderItem[]>()
  const [routes, setRoutes] = useState<ProviderRouteItem[]>([])
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [editingSecrets, setEditingSecrets] = useState<Record<string, boolean>>(
    {}
  )
  const [pageMessage, setPageMessage] = useState('')
  const [routeBusy, setRouteBusy] = useState('')
  const [routeFeedback, setRouteFeedback] = useState<
    Record<string, ProviderFeedback | undefined>
  >({})
  const [feedback, setFeedback] = useState<
    Record<string, ProviderFeedback | undefined>
  >({})

  const report = useCallback(
    (providerId: string, action: ProviderAction, message: string) =>
      setFeedback((current) => ({
        ...current,
        [providerId]: { action, message },
      })),
    []
  )

  const load = useCallback(
    () =>
      api<{ items: ProviderItem[]; routes?: ProviderRouteItem[] }>(
        '/api/providers'
      ).then((result) => {
        setProviders(result.items)
        setRoutes(result.routes ?? [])
      }),
    []
  )

  useEffect(() => {
    void load().catch((error) => setPageMessage(errorMessage(error)))
  }, [load])

  async function save(provider: ProviderItem) {
    const secret = secrets[provider.id]?.trim()
    if (!secret) {
      report(provider.id, 'error', '请先填写密钥，再保存。')
      return
    }
    report(provider.id, 'saving', '正在安全保存…')
    try {
      await put(`/api/providers/${encodeURIComponent(provider.id)}`, {
        secret,
      })
      setSecrets((current) => ({ ...current, [provider.id]: '' }))
      setEditingSecrets((current) => ({
        ...current,
        [provider.id]: false,
      }))
      await load()
      report(provider.id, 'success', '密钥已保存到当前运行环境。')
    } catch (error) {
      report(provider.id, 'error', errorMessage(error))
    }
  }

  async function saveRoute(
    route: ProviderRouteItem,
    providers: string[],
    successMessage: string
  ) {
    setRouteBusy(route.id)
    setRouteFeedback((current) => ({
      ...current,
      [route.id]: { action: 'saving', message: '正在保存配置…' },
    }))
    try {
      await put(`/api/provider-routes/${encodeURIComponent(route.id)}`, {
        providers,
      })
      await load()
      setRouteFeedback((current) => ({
        ...current,
        [route.id]: { action: 'success', message: successMessage },
      }))
    } catch (error) {
      setRouteFeedback((current) => ({
        ...current,
        [route.id]: { action: 'error', message: errorMessage(error) },
      }))
    } finally {
      setRouteBusy('')
    }
  }

  async function move(route: ProviderRouteItem, index: number, by: number) {
    const nextIndex = index + by
    if (nextIndex < 0 || nextIndex >= route.providers.length) return
    const next = [...route.providers]
    ;[next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!]
    await saveRoute(route, next, '调用顺序已保存。')
  }

  async function configureRoute(
    route: ProviderRouteItem,
    providerId: string,
    enabled: boolean
  ) {
    const next = enabled
      ? [...route.providers, providerId]
      : route.providers.filter((id) => id !== providerId)
    if (!next.length) return
    await saveRoute(
      route,
      next,
      enabled ? '供应商已加入调用顺序。' : '供应商已从调用顺序移除。'
    )
  }

  async function test(provider: ProviderItem) {
    if (provider.secretStatus?.configured === false) {
      report(
        provider.id,
        'error',
        '当前运行环境尚未配置密钥。请先填写并保存，再测试连接。'
      )
      return
    }
    report(provider.id, 'testing', '正在连接并读取少量预览…')
    try {
      const result = await post<{ items?: unknown[] }>(
        `/api/providers/${encodeURIComponent(provider.id)}/test`,
        {}
      )
      report(
        provider.id,
        'success',
        `连接成功，已返回 ${result.items?.length ?? 0} 条预览。`
      )
    } catch (error) {
      report(provider.id, 'error', errorMessage(error))
    }
  }

  async function clearSecret(provider: ProviderItem) {
    if (!window.confirm(`确定清除 ${provider.name} 在当前运行环境中的密钥？`))
      return
    report(provider.id, 'saving', '正在清除密钥…')
    try {
      await put(`/api/providers/${encodeURIComponent(provider.id)}`, {
        clearSecret: true,
      })
      setSecrets((current) => ({ ...current, [provider.id]: '' }))
      setEditingSecrets((current) => ({
        ...current,
        [provider.id]: false,
      }))
      await load()
      report(provider.id, 'success', '密钥已从当前运行环境清除。')
    } catch (error) {
      report(provider.id, 'error', errorMessage(error))
    }
  }

  return (
    <div>
      <div className='mb-4'>
        <h2 className='font-display text-xl font-semibold'>平台与采集提供商</h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          分别管理供应商凭据，以及每项业务接口启用哪些供应商和调用顺序。
        </p>
      </div>
      <div className='mb-4 flex gap-3 border-l-2 border-foreground/20 bg-foreground/[0.025] p-3 text-sm'>
        <Info className='mt-0.5 size-4 shrink-0' />
        <p>
          配置状态仅代表当前打开的运行环境。开发环境与正式安装环境相互隔离，密钥不会自动复制。
        </p>
      </div>
      <Tabs defaultValue='providers'>
        <TabsList className='mb-4'>
          <TabsTrigger value='providers'>采集供应商配置</TabsTrigger>
          <TabsTrigger value='routes'>业务接口配置</TabsTrigger>
        </TabsList>
        <TabsContent value='providers'>
          <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
            {(providers ?? []).map((provider) => {
              const current = feedback[provider.id]
              const busy =
                current?.action === 'saving' || current?.action === 'testing'
              const configured = provider.secretStatus?.configured
              const editingSecret =
                configured === false || editingSecrets[provider.id] === true
              const StatusIcon =
                configured === false ? CircleAlert : CheckCircle2
              return (
                <Card key={provider.id} className='h-full'>
                  <CardHeader>
                    <div className='flex items-start justify-between gap-3'>
                      <div>
                        <CardTitle>{provider.name}</CardTitle>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          {typeLabels[provider.sourceType] ??
                            provider.sourceType}
                        </p>
                      </div>
                      <StatusIcon
                        className={`size-5 shrink-0 ${configured === false ? 'text-muted-foreground' : 'text-foreground'}`}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className='mb-4 rounded-sm bg-foreground/[0.025] p-3 text-sm'>
                      {provider.secretStatus ? (
                        provider.secretStatus.configured ? (
                          <>
                            <span className='font-medium'>密钥已安全保存</span>
                            <span className='mt-1 block text-xs text-muted-foreground'>
                              为保护安全，页面不会显示密钥原值。
                            </span>
                          </>
                        ) : (
                          <>
                            <span className='font-medium'>尚未配置密钥</span>
                            <span className='mt-1 block text-xs text-muted-foreground'>
                              填写并保存后才能使用这个供应商。
                            </span>
                          </>
                        )
                      ) : (
                        '无需密钥，可直接使用'
                      )}
                    </div>
                    {provider.secretName && editingSecret && (
                      <Input
                        type='password'
                        value={secrets[provider.id] ?? ''}
                        onChange={(event) =>
                          setSecrets((current) => ({
                            ...current,
                            [provider.id]: event.target.value,
                          }))
                        }
                        placeholder={`${configured ? '输入新的' : '填写'} ${provider.secretName}`}
                        aria-label={`${configured ? '新的' : ''}${provider.name} 密钥`}
                        className='mb-3'
                        autoFocus={configured === true}
                      />
                    )}
                    <div className='flex flex-wrap gap-2'>
                      {provider.secretName && editingSecret && (
                        <Button
                          size='sm'
                          disabled={busy || !secrets[provider.id]?.trim()}
                          onClick={() => void save(provider)}
                        >
                          {current?.action === 'saving'
                            ? '保存中…'
                            : configured
                              ? '保存新密钥'
                              : '保存密钥'}
                        </Button>
                      )}
                      {provider.secretName && configured && !editingSecret && (
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={busy}
                          onClick={() =>
                            setEditingSecrets((current) => ({
                              ...current,
                              [provider.id]: true,
                            }))
                          }
                        >
                          更换密钥
                        </Button>
                      )}
                      {provider.secretName && configured && editingSecret && (
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={busy}
                          onClick={() => {
                            setSecrets((current) => ({
                              ...current,
                              [provider.id]: '',
                            }))
                            setEditingSecrets((current) => ({
                              ...current,
                              [provider.id]: false,
                            }))
                          }}
                        >
                          取消
                        </Button>
                      )}
                      {provider.sourceType !== 'web' && (
                        <Button
                          variant={
                            provider.secretName && editingSecret
                              ? 'outline'
                              : 'default'
                          }
                          size='sm'
                          disabled={busy}
                          onClick={() => void test(provider)}
                        >
                          {current?.action === 'testing' ? (
                            <LoaderCircle className='animate-spin' />
                          ) : null}
                          {current?.action === 'testing'
                            ? '测试中…'
                            : '测试连接'}
                        </Button>
                      )}
                      {provider.secretStatus?.configured && !editingSecret && (
                        <Button
                          variant='ghost'
                          size='sm'
                          disabled={busy}
                          onClick={() => void clearSecret(provider)}
                        >
                          清除密钥
                        </Button>
                      )}
                    </div>
                    {current && (
                      <p
                        role={current.action === 'error' ? 'alert' : 'status'}
                        aria-live='polite'
                        className={`mt-3 border-l-2 p-2 text-sm ${current.action === 'error' ? 'border-destructive/60 text-destructive' : 'border-foreground/25 bg-foreground/[0.025]'}`}
                      >
                        {current.message}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>
        <TabsContent value='routes' className='space-y-4'>
          <div className='border-l-2 border-foreground/20 bg-foreground/[0.025] p-3 text-sm'>
            勾选要启用的供应商，再用上移、下移调整失败后的备用顺序。每项业务接口至少保留一个供应商。
          </div>
          {routes.map((route) => {
            const current = routeFeedback[route.id]
            const available = route.availableProviders?.length
              ? route.availableProviders
              : route.providers
            return (
              <Card key={route.id}>
                <CardHeader>
                  <CardTitle>{route.name}</CardTitle>
                  <p className='text-sm text-muted-foreground'>
                    {route.description}
                  </p>
                </CardHeader>
                <CardContent className='space-y-5'>
                  <div>
                    <p className='mb-2 text-sm font-medium'>已启用及调用顺序</p>
                    <div className='flex flex-wrap gap-2'>
                      {route.providers.map((providerId, index) => (
                        <div
                          key={providerId}
                          className='flex items-center gap-1 rounded-sm bg-foreground/[0.04] px-2 py-1 text-sm'
                        >
                          <span>
                            {index + 1}.{' '}
                            {providers?.find((item) => item.id === providerId)
                              ?.name ?? providerId}
                            <span className='ml-1 text-xs text-muted-foreground'>
                              {index === 0 ? '默认' : '失败后'}
                            </span>
                          </span>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='size-7'
                            disabled={index === 0 || routeBusy === route.id}
                            aria-label={`上移 ${providerId}`}
                            onClick={() => void move(route, index, -1)}
                          >
                            <ArrowUp className='size-3.5' />
                          </Button>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='size-7'
                            disabled={
                              index === route.providers.length - 1 ||
                              routeBusy === route.id
                            }
                            aria-label={`下移 ${providerId}`}
                            onClick={() => void move(route, index, 1)}
                          >
                            <ArrowDown className='size-3.5' />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className='mb-2 text-sm font-medium'>可用供应商</p>
                    <div className='grid gap-2 sm:grid-cols-2'>
                      {available.map((providerId) => {
                        const provider = providers?.find(
                          (item) => item.id === providerId
                        )
                        const checked = route.providers.includes(providerId)
                        const lastEnabled =
                          checked && route.providers.length === 1
                        return (
                          <label
                            key={providerId}
                            className='flex items-start gap-3 rounded-sm border p-3 text-sm'
                          >
                            <Checkbox
                              checked={checked}
                              disabled={routeBusy === route.id || lastEnabled}
                              onCheckedChange={(value) =>
                                void configureRoute(
                                  route,
                                  providerId,
                                  value === true
                                )
                              }
                              aria-label={`${checked ? '停用' : '启用'} ${provider?.name ?? providerId}`}
                            />
                            <span>
                              <span className='block font-medium'>
                                {provider?.name ?? providerId}
                              </span>
                              <span className='text-xs text-muted-foreground'>
                                {provider?.secretStatus?.configured === false
                                  ? '未配置密钥'
                                  : '当前环境可用'}
                              </span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  {current && (
                    <p
                      role={current.action === 'error' ? 'alert' : 'status'}
                      aria-live='polite'
                      className={`border-l-2 p-2 text-sm ${current.action === 'error' ? 'border-destructive/60 text-destructive' : 'border-foreground/25 bg-foreground/[0.025]'}`}
                    >
                      {current.message}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
          <p className='text-sm text-muted-foreground'>
            互动数据不单独调用接口，只随作品列表或作品详情保存；0、空值不会覆盖已有数据。
          </p>
        </TabsContent>
      </Tabs>
      {pageMessage && (
        <p role='alert' className='mt-4 text-sm text-destructive'>
          读取配置失败：{pageMessage}
        </p>
      )}
    </div>
  )
}
