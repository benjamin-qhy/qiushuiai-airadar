import { PageHeader } from '@/components/page-header'
import { CollectionProvidersPanel } from '@/features/collection-providers-panel'

export function CollectionSettingsPage() {
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <PageHeader
        title='采集设置'
        description='管理平台接口、调用顺序与连接状态'
      />
      <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-24 md:p-6 lg:pb-6'>
        <div className='mx-auto max-w-[1500px]'>
          <CollectionProvidersPanel />
        </div>
      </div>
    </div>
  )
}
