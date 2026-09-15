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

const navigationGroups: Array<{
  label: string
  items: Array<{ id: PageKey; label: string; icon: typeof Radar }>
}> = [
  {
    label: '内容',
    items: [
      { id: 'daily', label: '每日精选', icon: Sparkles },
      { id: 'all', label: '全部内容', icon: ListFilter },
    ],
  },
  {
    label: '管理',
    items: [{ id: 'sources', label: '信源管理', icon: BookOpen }],
  },
  {
    label: '系统',
    items: [
      { id: 'runtime', label: '运行状态', icon: Database },
      { id: 'config', label: '系统配置', icon: Settings2 },
    ],
  },
]
const navigation = navigationGroups.flatMap((group) => group.items)

export function AppShell({
  page,
  onPage,
  children,
}: {
  page: PageKey
  onPage: (page: PageKey) => void
  children: ReactNode
}) {
  const contentPage = page === 'daily' || page === 'all'
  return (
    <div className='min-h-svh w-screen max-w-full overflow-x-hidden bg-[#f7f8fa] lg:grid lg:grid-cols-[256px_1fr]'>
      <aside className='hidden border-r bg-[#f5f5f5] px-4 py-5 lg:flex lg:flex-col'>
        <div className='mb-7 flex items-center gap-3 px-2'>
          <span className='flex size-10 items-center justify-center rounded-xl bg-slate-950 text-white'>
            <Radar className='size-5' />
          </span>
          <div>
            <div className='font-semibold'>AI Radar</div>
            <div className='text-xs text-muted-foreground'>个人 AI 情报台</div>
          </div>
        </div>
        <nav className='space-y-5'>
          {navigationGroups.map((group) => (
            <div key={group.label}>
              <div className='mb-1.5 px-3 text-[11px] font-medium tracking-wide text-muted-foreground/80'>
                {group.label}
              </div>
              <div className='space-y-1'>
                {group.items.map(({ id, label, icon: Icon }) => (
                  <Button
                    key={id}
                    aria-label={label}
                    variant={page === id ? 'secondary' : 'ghost'}
                    className='w-full justify-start gap-3'
                    onClick={() => onPage(id)}
                  >
                    <Icon className='size-4 shrink-0' />
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className='mt-auto rounded-xl border bg-slate-50 p-3 text-xs text-muted-foreground'>
          <div className='mb-1 font-medium text-foreground'>真实数据模式</div>
          页面只读取本机服务与持久化数据。
        </div>
      </aside>
      <div className='min-w-0 w-full overflow-x-hidden'>
        {!contentPage && (
          <header className='sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white/95 px-4 backdrop-blur'>
            <div className='flex min-w-0 items-center gap-3'>
              <div className='min-w-0'>
                <div className='text-[11px] text-muted-foreground'>
                  AI Radar
                </div>
                <h1 className='truncate text-sm font-semibold'>
                  {navigation.find((item) => item.id === page)?.label}
                </h1>
              </div>
            </div>
            <span className='hidden rounded-full border px-3 py-1 text-xs text-emerald-700 sm:inline'>
              ● 服务已连接
            </span>
          </header>
        )}
        <main className='min-w-0'>{children}</main>
        <nav className='fixed inset-x-0 bottom-0 z-40 grid w-screen max-w-full grid-cols-5 border-t bg-white/95 px-1 py-1 backdrop-blur lg:hidden'>
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
