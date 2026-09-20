import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, post, put } from '@/lib/api'

interface LoginSession {
  id: string
  status: 'pending' | 'completed' | 'cancelled' | 'expired' | 'failed'
  events: Array<{
    type: string
    url?: string
    userCode?: string
    verificationUri?: string
    message?: string
  }>
  prompt?: {
    id: string
    type: string
    message: string
    options?: Array<{ id: string; label: string }>
  }
}

function safeUrl(value?: string) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

export function ProviderLogin({
  providerId,
  configured,
  onComplete,
}: {
  providerId: string
  configured: boolean
  onComplete: () => Promise<void>
}) {
  const [session, setSession] = useState<LoginSession>()
  const [answer, setAnswer] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([])
  const [model, setModel] = useState('')
  const [finished, setFinished] = useState(false)
  const popup = useRef<Window | null>(null)
  const opened = useRef('')
  const activeId = useRef<string | undefined>(undefined)
  const complete = useRef(onComplete)
  useEffect(() => {
    complete.current = onComplete
  }, [onComplete])
  const sessionId = session?.id
  const pending = session?.status === 'pending'
  const event = session?.events
    .slice()
    .reverse()
    .find((e) => e.type === 'auth_url' || e.type === 'device_code')
  const url = safeUrl(event?.url ?? event?.verificationUri)

  useEffect(() => {
    if (!pending || !sessionId) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const result = await api<LoginSession>(`/api/model-login/${sessionId}`)
        if (disposed) return
        setSession(result)
        if (result.status === 'completed') {
          activeId.current = undefined
          await complete.current()
        } else if (result.status === 'pending')
          timer = setTimeout(() => void poll(), 750)
      } catch {
        if (!disposed) {
          setMessage('暂时无法获取登录进度，正在重试。')
          timer = setTimeout(() => void poll(), 2000)
        }
      }
    }
    void poll()
    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [pending, sessionId])

  useEffect(() => {
    if (
      url &&
      opened.current !== url &&
      popup.current &&
      !popup.current.closed
    ) {
      popup.current.location.href = url
      opened.current = url
      popup.current = null
    }
  }, [url])

  useEffect(() => {
    if (!configured && session?.status !== 'completed') return
    let disposed = false
    void api<{
      availableModels: Array<{ id: string; name: string }>
      defaultModel: string
    }>(`/api/models?provider=${encodeURIComponent(providerId)}`)
      .then((result) => {
        if (disposed) return
        setModels(result.availableModels)
        setModel(
          result.availableModels.some((m) => m.id === result.defaultModel)
            ? result.defaultModel
            : (result.availableModels[0]?.id ?? '')
        )
      })
      .catch(() => {
        if (!disposed) setMessage('模型列表加载失败，请重新进入此提供商。')
      })
    return () => {
      disposed = true
    }
  }, [configured, providerId, session?.status])

  useEffect(
    () => () => {
      if (activeId.current)
        void post(`/api/model-login/${activeId.current}/cancel`, {}).catch(
          () => {}
        )
      popup.current?.close()
    },
    []
  )

  function prepareBrowser() {
    popup.current?.close()
    popup.current = window.open('about:blank', '_blank')
    if (popup.current) popup.current.opener = null
    opened.current = ''
  }

  async function start(method = 'browser') {
    prepareBrowser()
    setBusy(true)
    setMessage('')
    setFinished(false)
    try {
      const result = await post<LoginSession>('/api/model-login', {
        providerId,
        method,
      })
      activeId.current = result.id
      setSession(result)
    } catch {
      popup.current?.close()
      setMessage('无法开始登录，请重试。')
    } finally {
      setBusy(false)
    }
  }

  async function respond(value: string) {
    if (!session?.prompt) return
    setBusy(true)
    setMessage('')
    try {
      setSession(
        await post<LoginSession>(`/api/model-login/${session.id}/respond`, {
          promptId: session.prompt.id,
          answer: value,
        })
      )
      setAnswer('')
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (!session) return
    try {
      setSession(
        await post<LoginSession>(`/api/model-login/${session.id}/cancel`, {})
      )
      activeId.current = undefined
      popup.current?.close()
    } catch {
      setMessage('取消失败，请重试。')
    }
  }

  async function finish() {
    setBusy(true)
    setMessage('正在测试模型连接，请稍候……')
    try {
      await post(
        `/api/model-providers/${encodeURIComponent(providerId)}/connection-test`,
        { modelId: model }
      )
      await put('/api/models', {
        provider: providerId,
        defaultModel: model,
        stages: {},
      })
      await complete.current()
      setFinished(true)
      setMessage('可以使用了。已设为默认模型，各处理环节跟随此模型。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className='mt-6 grid gap-4'>
      <h3 className='font-display text-lg font-semibold'>账号登录</h3>
      <ol
        className='flex flex-wrap gap-4 text-sm text-muted-foreground'
        aria-label='配置步骤'
      >
        <li>1. 登录账号</li>
        <li>2. 浏览器授权</li>
        <li>3. 选择模型并测试</li>
      </ol>
      <p className='text-sm text-muted-foreground'>
        在提供商官方页面登录并授权，完成后这里会自动更新。
      </p>
      {!pending && (
        <Button className='w-fit' disabled={busy} onClick={() => void start()}>
          {configured
            ? '更换账号 / 重新登录'
            : providerId === 'openai-codex'
              ? '登录 ChatGPT 账号'
              : '登录账号'}
        </Button>
      )}
      {!pending && providerId === 'openai-codex' && (
        <Button
          className='w-fit'
          variant='ghost'
          disabled={busy}
          onClick={() => void start('device_code')}
        >
          浏览器登录遇到问题？使用设备验证码
        </Button>
      )}
      {pending && (
        <div className='grid gap-3 bg-foreground/[0.025] p-4'>
          <p role='status'>等待浏览器授权</p>
          {url && (
            <a
              className='underline'
              href={url}
              target='_blank'
              rel='noopener noreferrer'
            >
              打开 / 重新打开官方登录页
            </a>
          )}
          {event?.userCode && (
            <p>
              在官方页面输入验证码：
              <strong className='font-mono'>{event.userCode}</strong>
            </p>
          )}
          {session.prompt?.type === 'select' && (
            <div className='grid gap-2'>
              <p>
                {providerId === 'openai-codex'
                  ? '选择登录方式'
                  : session.prompt.message}
              </p>
              {session.prompt.options?.map((option) => (
                <Button
                  key={option.id}
                  variant='outline'
                  disabled={busy}
                  onClick={() => void respond(option.id)}
                >
                  {option.label === 'Browser login (default)'
                    ? '浏览器登录（推荐）'
                    : option.label === 'Device code login (headless)'
                      ? '使用设备验证码'
                      : option.label}
                </Button>
              ))}
            </div>
          )}
          {session.prompt && session.prompt.type !== 'select' && (
            <details open={session.prompt.type !== 'manual_code'}>
              <summary>
                {session.prompt.type === 'manual_code'
                  ? '浏览器授权后没有自动完成？'
                  : session.prompt.message}
              </summary>
              <label className='mt-3 grid gap-2 text-sm'>
                {session.prompt.type === 'manual_code'
                  ? '粘贴官方页面返回的授权码或完整回调网址'
                  : session.prompt.message}
                <Input
                  type={session.prompt.type === 'secret' ? 'password' : 'text'}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  autoComplete='off'
                />
              </label>
              <Button
                className='mt-2'
                disabled={busy || !answer.trim()}
                onClick={() => void respond(answer)}
              >
                继续
              </Button>
            </details>
          )}
          <Button
            className='w-fit'
            variant='ghost'
            onClick={() => void cancel()}
          >
            取消登录
          </Button>
        </div>
      )}
      {session?.status === 'completed' && (
        <p role='status'>账号授权成功，请选择模型。</p>
      )}
      {session?.status === 'failed' && (
        <p role='alert'>登录未完成，请检查网络后重新登录。</p>
      )}
      {session?.status === 'expired' && (
        <p role='alert'>登录已超时，请重新登录。</p>
      )}
      {session?.status === 'cancelled' && (
        <p role='status'>已取消登录，原有账号保持不变。</p>
      )}
      {(configured || session?.status === 'completed') && !pending && (
        <div className='grid gap-3 border-t pt-4'>
          <label className='grid gap-2 text-sm'>
            默认模型
            <select
              aria-label='登录后默认模型'
              className='h-9 rounded-md border bg-background px-3'
              value={model}
              onChange={(e) => {
                setModel(e.target.value)
                setFinished(false)
              }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <p className='text-xs text-muted-foreground'>
            测试会发送一次简短请求，消耗少量额度；成功后设为默认模型并让各环节跟随。
          </p>
          <Button
            className='w-fit'
            disabled={busy || !model || finished}
            onClick={() => void finish()}
          >
            {busy ? '正在测试…' : finished ? '配置完成' : '测试并完成'}
          </Button>
        </div>
      )}
      {message && (
        <p role='status' className='text-sm'>
          {message}
        </p>
      )}
    </div>
  )
}
