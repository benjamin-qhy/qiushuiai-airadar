import { Radar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function App() {
  return (
    <main className='bg-muted/30 flex min-h-svh items-center justify-center p-6'>
      <Card className='w-full max-w-xl shadow-sm'>
        <CardHeader>
          <div className='bg-primary text-primary-foreground mb-3 flex size-11 items-center justify-center rounded-xl'>
            <Radar aria-hidden='true' className='size-6' />
          </div>
          <CardTitle className='text-2xl'>AI Radar</CardTitle>
          <CardDescription>系统外壳已就绪</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-muted-foreground text-sm leading-6'>
            信源、任务与分析能力将在后续工单中接入。当前页面不读取任何本机密钥。
          </p>
          <Button disabled>等待数据能力接入</Button>
        </CardContent>
      </Card>
    </main>
  )
}
