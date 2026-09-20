import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/page-header'
import { api } from '@/lib/api'
import { CollectionControls, type CollectionData } from './collection-controls'
import { RuntimeLog } from './runtime-log'

export function RuntimeLogPage() {
  const [data, setData] = useState<CollectionData>({})
  useEffect(() => {
    let disposed = false
    let busy = false
    const load = () => {
      if (busy) return
      busy = true
      void api<CollectionData>('/api/runtime')
        .then((value) => {
          if (!disposed) setData(value)
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false
        })
    }
    load()
    const timer = setInterval(load, 3000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [])
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <PageHeader
        title='运行日志'
        description='查看采集和内容处理记录，并控制手工采集'
      />
      <div className='min-h-0 flex-1 overflow-y-auto p-4 pb-24 md:p-6 lg:pb-6'>
        <div className='mx-auto max-w-6xl space-y-6'>
          <CollectionControls data={data} onChanged={setData} />
          <RuntimeLog />
        </div>
      </div>
    </div>
  )
}
