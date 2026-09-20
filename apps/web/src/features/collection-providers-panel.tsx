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
import { Input } from '@/components/ui/input'
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
  const [pageMessage, setPageMessage] = useState('')
  const [routeMessage, setRouteMessage] = useState('')
  const [routeBusy, setRouteBusy] = useState('')
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
      await load()
      report(provider.id, 'success', '密钥已保存到当前运行环境。')
    } catch (error) {
      report(provider.id, 'error', errorMessage(error))
    }
  }

  async function move(route: ProviderRouteItem, index: number, by: number) {
    const nextIndex = index + by
    if (nextIndex < 0 || nextIndex >= route.providers.length) return
    const next = [...route.providers]
    ;[next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!]
    setRouteBusy(route.id)
    setRouteMessage(`正在保存“${route.name}”的调用顺序…`)
    try {
      await put(`/api/provider-routes/${encodeURIComponent(route.id)}`, {
        providers: next,
      })
      await load()
      setRouteMessage(`“${route.name}”的调用顺序已保存。`)
    } catch (error) {
      setRouteMessage(errorMessage(error))
    } finally {
      setRouteBusy('')
    }
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
          每项能力按顺序调用；前一个失败后，自动尝试下一个。
        </p>
      </div>
      <div className='mb-4 flex gap-3 border-l-2 border-foreground/20 bg-foreground/[0.025] p-3 text-sm'>
        <Info className='mt-0.5 size-4 shrink-0' />
        <p>
          配置状态仅代表当前打开的运行环境。开发环境与正式安装环境相互隔离，密钥不会自动复制。
        </p>
      </div>
      <Card className='mb-4'>
        <CardHeader>
          <CardTitle>第三方接口调用顺序</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {routes.map((route) => (
            <div
              key={route.id}
              className='flex flex-col gap-2 border-l pl-4 sm:flex-row sm:items-center sm:justify-between'
            >
              <div className='font-medium'>{route.name}</div>
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
          ))}
          <p className='text-sm text-muted-foreground'>
            互动数据不单独调用接口，只随作品列表或作品详情保存；0、空值不会覆盖已有数据。
          </p>
          {routeMessage && (
            <p aria-live='polite' className='text-sm'>
              {routeMessage}
            </p>
          )}
        </CardContent>
      </Card>
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {(providers ?? []).map((provider) => {
          const current = feedback[provider.id]
          const busy =
            current?.action === 'saving' || current?.action === 'testing'
          const configured = provider.secretStatus?.configured
          const StatusIcon = configured === false ? CircleAlert : CheckCircle2
          return (
            <Card key={provider.id} className='h-full'>
              <CardHeader>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <CardTitle>{provider.name}</CardTitle>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {typeLabels[provider.sourceType] ?? provider.sourceType}
                    </p>
                  </div>
                  <StatusIcon
                    className={`size-5 shrink-0 ${configured === false ? 'text-muted-foreground' : 'text-foreground'}`}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className='mb-4 rounded-sm bg-foreground/[0.025] p-3 text-sm'>
                  当前环境：
                  {provider.secretStatus
                    ? provider.secretStatus.configured
                      ? (provider.secretStatus.maskedValue ?? '已配置')
                      : '未配置密钥'
                    : '无需密钥，可直接使用'}
                </div>
                {provider.secretName && (
                  <Input
                    type='password'
                    value={secrets[provider.id] ?? ''}
                    onChange={(event) =>
                      setSecrets((current) => ({
                        ...current,
                        [provider.id]: event.target.value,
                      }))
                    }
                    placeholder={`填写 ${provider.secretName}`}
                    aria-label={`${provider.name} 密钥`}
                    className='mb-3'
                  />
                )}
                <div className='flex flex-wrap gap-2'>
                  {provider.secretName && (
                    <Button
                      size='sm'
                      disabled={busy || !secrets[provider.id]?.trim()}
                      onClick={() => void save(provider)}
                    >
                      {current?.action === 'saving' ? '保存中…' : '保存密钥'}
                    </Button>
                  )}
                  {provider.sourceType !== 'web' && (
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={busy}
                      onClick={() => void test(provider)}
                    >
                      {current?.action === 'testing' ? (
                        <LoaderCircle className='animate-spin' />
                      ) : null}
                      {current?.action === 'testing' ? '测试中…' : '测试连接'}
                    </Button>
                  )}
                  {provider.secretStatus?.configured && (
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
      {pageMessage && (
        <p role='alert' className='mt-4 text-sm text-destructive'>
          读取配置失败：{pageMessage}
        </p>
      )}
    </div>
  )
}
