import type { ReactNode } from 'react'
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const { state } = useSidebar()

  return (
    <header
      data-slot='page-header'
      className={cn(
        'z-30 flex min-h-16 shrink-0 flex-wrap items-center gap-3 bg-background/95 px-4 py-2 backdrop-blur',
        className
      )}
    >
      <div className='flex min-w-0 shrink-0 items-center gap-3'>
        {state === 'collapsed' && (
          <SidebarTrigger className='hidden lg:inline-flex' />
        )}
        <div className='min-w-0'>
          <h1 className='truncate text-base font-semibold'>{title}</h1>
          {description && (
            <div className='text-xs text-muted-foreground'>{description}</div>
          )}
        </div>
      </div>
      {children && (
        <div className='ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2'>
          {children}
        </div>
      )}
    </header>
  )
}
