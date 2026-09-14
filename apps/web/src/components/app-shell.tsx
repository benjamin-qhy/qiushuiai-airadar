import type { ReactNode } from 'react'
import {
  BookOpen,
  Database,
  ListFilter,
  Radar,
  Settings2,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PageKey } from '@/types'

const navigation: { id: PageKey; label: string; icon: typeof Radar }[] = [
  { id: 'daily', label: '每日精选', icon: Sparkles },
  { id: 'all', label: '全部内容', icon: ListFilter },
  { id: 'sources', label: '信源管理', icon: BookOpen },
  { id: 'runtime', label: '运行状态', icon: Database },
  { id: 'config', label: '系统配置', icon: Settings2 },
]

export function AppShell({
  page,
  onPage,
  children,
}: {
  page: PageKey
  onPage: (page: PageKey) => void
  children: ReactNode
}) {
  return (
    <div className='min-h-svh w-screen max-w-full overflow-x-hidden bg-[#f7f8fa] lg:grid lg:grid-cols-[240px_1fr]'>
      <aside className='hidden border-r bg-white px-4 py-6 lg:flex lg:flex-col'>
        <div className='mb-8 flex items-center gap-3 px-2'>
          <span className='flex size-10 items-center justify-center rounded-xl bg-slate-950 text-white'>
            <Radar className='size-5' />
          </span>
          <div>
            <div className='font-semibold'>AI Radar</div>
            <div className='text-xs text-muted-foreground'>个人 AI 情报台</div>
          </div>
        </div>
        <nav className='space-y-1'>
          {navigation.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant={page === id ? 'secondary' : 'ghost'}
              className='w-full justify-start gap-3'
              onClick={() => onPage(id)}
            >
              <Icon className='size-4' />
              {label}
            </Button>
          ))}
        </nav>
        <div className='mt-auto rounded-xl border bg-slate-50 p-3 text-xs text-muted-foreground'>
          <div className='mb-1 font-medium text-foreground'>真实数据模式</div>
          页面只读取本机服务与持久化数据。
        </div>
      </aside>
      <div className='min-w-0 w-full overflow-x-hidden'>
        <header className='sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white/95 px-4 backdrop-blur md:px-6'>
          <div>
            <div className='text-sm text-muted-foreground'>AI Radar</div>
            <h1 className='font-semibold'>
              {navigation.find((item) => item.id === page)?.label}
            </h1>
          </div>
          <span className='hidden rounded-full border px-3 py-1 text-xs text-emerald-700 sm:inline'>
            ● 服务已连接
          </span>
        </header>
        <main className='min-w-0'>{children}</main>
        <nav className='fixed inset-x-0 bottom-0 z-40 grid w-screen max-w-full grid-cols-5 border-t bg-white px-1 py-1 lg:hidden'>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`min-w-0 flex flex-col items-center gap-1 rounded-md py-2 text-[10px] ${page === id ? 'bg-slate-100 text-slate-950' : 'text-muted-foreground'}`}
              onClick={() => onPage(id)}
            >
              <Icon className='size-4' />
              <span className='w-full truncate px-0.5'>{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  )
}
