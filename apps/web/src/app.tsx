import { useEffect, useState } from 'react'
import { ExternalLink, Radar } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface FeedItem {
  id: string
  title: string
  url?: string
  summary: string
  topics: string[]
  totalScore: number
  recommendation: 'core' | 'explore' | 'none'
}

function Feed({ endpoint }: { endpoint: string }) {
  const [items, setItems] = useState<FeedItem[] | undefined>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`http://127.0.0.1:43110${endpoint}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return (await response.json()) as { items: FeedItem[] }
      })
      .then((payload) => setItems(payload.items))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })
    return () => controller.abort()
  }, [endpoint])

  if (error) {
    return <p className='text-destructive py-8 text-sm'>读取失败：{error}</p>
  }
  if (!items) {
    return (
      <p className='text-muted-foreground py-8 text-sm'>正在读取真实内容…</p>
    )
  }
  if (items.length === 0) {
    return <p className='text-muted-foreground py-8 text-sm'>暂时没有内容</p>
  }
  return (
    <div className='grid gap-4'>
      {items.map((item) => (
        <Card key={item.id}>
          <CardHeader className='gap-2'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge
                variant={
                  item.recommendation === 'core' ? 'default' : 'secondary'
                }
              >
                {item.recommendation === 'core'
                  ? '核心推荐'
                  : item.recommendation === 'explore'
                    ? '探索推荐'
                    : '未推荐'}
              </Badge>
              <span className='text-muted-foreground text-xs'>
                {item.totalScore} 分
              </span>
            </div>
            <CardTitle className='text-lg'>
              {item.url ? (
                <a
                  className='hover:underline'
                  href={item.url}
                  rel='noreferrer'
                  target='_blank'
                >
                  {item.title}{' '}
                  <ExternalLink aria-hidden='true' className='inline size-4' />
                </a>
              ) : (
                item.title
              )}
            </CardTitle>
            <CardDescription className='leading-6'>
              {item.summary}
            </CardDescription>
          </CardHeader>
          {item.topics.length > 0 && (
            <CardContent className='flex flex-wrap gap-2'>
              {item.topics.map((topic) => (
                <Badge key={topic} variant='outline'>
                  {topic}
                </Badge>
              ))}
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  )
}

export function App() {
  return (
    <main className='bg-muted/30 min-h-svh p-6 md:p-10'>
      <section className='mx-auto w-full max-w-4xl'>
        <header className='mb-8 flex items-center gap-3'>
          <div className='bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-xl'>
            <Radar aria-hidden='true' className='size-6' />
          </div>
          <div>
            <h1 className='text-2xl font-semibold'>AI Radar</h1>
            <p className='text-muted-foreground text-sm'>
              只呈现真实采集并完成分析的内容
            </p>
          </div>
        </header>
        <Tabs defaultValue='daily'>
          <TabsList>
            <TabsTrigger value='daily'>每日精选</TabsTrigger>
            <TabsTrigger value='all'>全部内容</TabsTrigger>
          </TabsList>
          <TabsContent value='daily'>
            <Feed endpoint='/api/daily' />
          </TabsContent>
          <TabsContent value='all'>
            <Feed endpoint='/api/contents' />
          </TabsContent>
        </Tabs>
      </section>
    </main>
  )
}
