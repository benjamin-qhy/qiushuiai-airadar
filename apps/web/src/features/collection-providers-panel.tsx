import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, post, put } from '@/lib/api'
import type { ProviderItem } from '@/types'

const typeLabels: Record<string, string> = {
  x: 'X',
  youtube: 'YouTube',
  rss: 'RSS',
}

export function CollectionProvidersPanel() {
  const [providers, setProviders] = useState<ProviderItem[]>()
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')

  const load = useCallback(
    () =>
      api<{ items: ProviderItem[] }>('/api/providers').then((result) =>
        setProviders(result.items)
      ),
    []
  )

  useEffect(() => {
    void load().catch((error) => setMessage(String(error)))
  }, [load])

  async function save(provider: ProviderItem) {
    try {
      await put(`/api/providers/${encodeURIComponent(provider.id)}`, {
        preferred: true,
        secret: secrets[provider.id],
      })
      setSecrets((current) => ({ ...current, [provider.id]: '' }))
      setMessage(`${provider.name} 配置已保存。`)
      await load()
    } catch (error) {
      setMessage(String(error))
    }
  }

  async function test(provider: ProviderItem) {
    try {
      const result = await post<{ items?: unknown[] }>(
        `/api/providers/${encodeURIComponent(provider.id)}/test`,
        {}
      )
      setMessage(
        `${provider.name} 连接成功，返回 ${result.items?.length ?? 0} 条预览。`
      )
    } catch (error) {
      setMessage(String(error))
    }
  }

  async function clearSecret(provider: ProviderItem) {
    try {
      await put(`/api/providers/${encodeURIComponent(provider.id)}`, {
        clearSecret: true,
      })
      setMessage(`${provider.name} 密钥已清除。`)
      await load()
    } catch (error) {
      setMessage(String(error))
    }
  }

  return (
    <div>
      <div className='mb-4'>
        <h2 className='font-display text-xl font-semibold'>平台与采集提供商</h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          配置内容采集 API 的优先级、访问密钥并测试连接。
        </p>
      </div>
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {(providers ?? []).map((provider) => (
          <Card key={provider.id}>
            <CardHeader>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <CardTitle>{provider.name}</CardTitle>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {typeLabels[provider.sourceType] ?? provider.sourceType} ·
                    优先级 {provider.priority}
                  </p>
                </div>
                <CheckCircle2 className='size-5 shrink-0 text-foreground' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='mb-4 rounded-sm bg-foreground/[0.025] p-3 text-sm'>
                凭据：
                {provider.secretStatus
                  ? provider.secretStatus.configured
                    ? (provider.secretStatus.maskedValue ?? '已配置')
                    : '未配置'
                  : '无需凭据'}
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
                  className='mb-3'
                />
              )}
              <div className='flex flex-wrap gap-2'>
                <Button size='sm' onClick={() => void save(provider)}>
                  {provider.preferred ? '保存配置' : '设为首选并保存'}
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => void test(provider)}
                >
                  测试连接
                </Button>
                {provider.secretStatus?.configured && (
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => void clearSecret(provider)}
                  >
                    清除密钥
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {message && (
        <p className='mt-4 border-l-2 border-foreground/30 bg-foreground/[0.025] p-3 text-sm'>
          {message}
        </p>
      )}
    </div>
  )
}
