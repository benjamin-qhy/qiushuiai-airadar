import { useEffect, useState } from 'react'
import { Activity, CircleAlert, Clock3 } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'

interface RuntimeData {
  mode?: 'single-table'
  total?: number
  failed?: number
  waiting?: number
  recent?: Array<{
    id: string
    sourceId: string
    status: string
    stage: string
    updatedAt: string
  }>
  tasks?: Record<string, unknown>[]
  audits?: Record<string, unknown>[]
  providerAttempts?: Record<string, unknown>[]
}
export function RuntimePage() {
  const [data, setData] = useState<RuntimeData>()
  const [error, setError] = useState('')
  useEffect(() => {
    void api<RuntimeData>('/api/runtime')
      .then(setData)
      .catch((reason) => setError(String(reason)))
  }, [])
  if (data?.mode === 'single-table') {
    return (
      <div className='flex h-full min-h-0 flex-col'>
        <PageHeader
          title='运行状态'
          description='直接查看内容的当前处理状态；完整请求和响应保存在各内容的执行日志中'
        />
        <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24 md:p-6 lg:pb-6'>
          <div className='mx-auto max-w-6xl'>
            <div className='grid gap-0 border-y sm:grid-cols-3 sm:divide-x'>
              <div className='p-4'>
                <div className='text-sm text-muted-foreground'>内容总数</div>
                <div className='mt-2 text-3xl font-semibold'>
                  {data.total ?? 0}
                </div>
              </div>
              <div className='border-t p-4 sm:border-t-0'>
                <div className='text-sm text-muted-foreground'>处理失败</div>
                <div className='mt-2 text-3xl font-semibold'>
                  {data.failed ?? 0}
                </div>
              </div>
              <div className='border-t p-4 sm:border-t-0'>
                <div className='text-sm text-muted-foreground'>待人工转写</div>
                <div className='mt-2 text-3xl font-semibold'>
                  {data.waiting ?? 0}
                </div>
              </div>
            </div>
            <div className='mt-6 overflow-x-auto'>
              <table className='w-full text-left text-sm'>
                <thead className='bg-foreground/[0.025] text-muted-foreground'>
                  <tr>
                    <th className='p-3'>内容 ID</th>
                    <th className='p-3'>信源</th>
                    <th className='p-3'>状态</th>
                    <th className='p-3'>当前步骤</th>
                    <th className='p-3'>更新时间</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.recent ?? []).map((row) => (
                    <tr key={row.id} className='hover:bg-foreground/[0.025]'>
                      <td className='p-3 font-mono text-xs'>{row.id}</td>
                      <td className='p-3'>{row.sourceId}</td>
                      <td className='p-3'>{row.status}</td>
                      <td className='p-3'>{row.stage}</td>
                      <td className='p-3'>{row.updatedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.recent?.length && (
                <p className='p-8 text-center text-sm text-muted-foreground'>
                  暂无内容处理记录
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
  const tasks = data?.tasks ?? []
  const failed = tasks.filter((task) => task.status === 'failed').length
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <PageHeader
        title='运行状态'
        description='采集、补全、分析和供应商调用的真实运行记录'
      />
      <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24 md:p-6 lg:pb-6'>
        <div className='mx-auto max-w-6xl'>
          {error && <p className='text-destructive'>{error}</p>}
          <div className='grid gap-0 border-y sm:grid-cols-3 sm:divide-x'>
            <Card className='gap-3 rounded-none border-0 bg-transparent py-4'>
              <CardHeader className='px-4'>
                <CardTitle className='flex items-center gap-2 text-sm'>
                  <Clock3 />
                  任务总数
                </CardTitle>
              </CardHeader>
              <CardContent className='px-4 text-3xl font-semibold'>
                {tasks.length}
              </CardContent>
            </Card>
            <Card className='gap-3 rounded-none border-0 border-t bg-transparent py-4 sm:border-t-0'>
              <CardHeader className='px-4'>
                <CardTitle className='flex items-center gap-2 text-sm'>
                  <CircleAlert />
                  失败任务
                </CardTitle>
              </CardHeader>
              <CardContent className='px-4 text-3xl font-semibold'>
                {failed}
              </CardContent>
            </Card>
            <Card className='gap-3 rounded-none border-0 border-t bg-transparent py-4 sm:border-t-0'>
              <CardHeader className='px-4'>
                <CardTitle className='flex items-center gap-2 text-sm'>
                  <Activity />
                  供应商尝试
                </CardTitle>
              </CardHeader>
              <CardContent className='px-4 text-3xl font-semibold'>
                {data?.providerAttempts?.length ?? 0}
              </CardContent>
            </Card>
          </div>
          <div className='mt-6 overflow-hidden rounded-sm border bg-card'>
            <div className='border-b p-4 font-semibold'>最近任务</div>
            <div className='overflow-x-auto'>
              <table className='w-full text-left text-sm'>
                <thead className='bg-foreground/[0.025] text-muted-foreground'>
                  <tr>
                    <th className='p-3'>类型</th>
                    <th className='p-3'>状态</th>
                    <th className='p-3'>信源</th>
                    <th className='p-3'>任务 ID</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.slice(0, 30).map((task) => (
                    <tr
                      key={String(task.id)}
                      className='transition-colors hover:bg-foreground/[0.025]'
                    >
                      <td className='p-3'>{String(task.type)}</td>
                      <td className='p-3'>
                        <Badge
                          variant={
                            task.status === 'failed' ? 'destructive' : 'outline'
                          }
                        >
                          {String(task.status)}
                        </Badge>
                      </td>
                      <td className='p-3'>{String(task.sourceId ?? '-')}</td>
                      <td className='p-3 font-mono text-xs'>
                        {String(task.id)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tasks.length === 0 && (
              <div className='p-8 text-center text-sm text-muted-foreground'>
                暂无任务记录
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
