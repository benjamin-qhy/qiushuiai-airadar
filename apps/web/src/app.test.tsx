import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { App, ContentCard, type FeedItem } from './app.js'
import {
  filterContentItems,
  filterContentScope,
} from './lib/content-filters.js'

const item: FeedItem = {
  id: 'xiaohongshu:note-1',
  kind: 'image_post',
  title: '真实图文',
  body: '正文',
  summary: '全部图片附件已经保存。',
  topics: ['AI'],
  scores: { substance: 12 },
  totalScore: 80,
  recommendation: 'core',
  processStatus: 'completed',
  read: false,
  utilizationActions: [],
  junk: { isJunk: false, source: 'none' },
}

describe('complete web shell', () => {
  it('shows all five primary pages without demo content', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('AI Radar')
    expect(html).toContain('每日精选')
    expect(html).toContain('全部内容')
    expect(html).toContain('垃圾内容')
    expect(html).toContain('信源管理')
    expect(html).toContain('运行状态')
    expect(html).toContain('系统配置')
    expect(html).toContain('data-slot="sidebar"')
    expect(html).toContain('aria-label="折叠侧栏"')
    expect(html).toContain('日期范围')
    expect(html).toContain('卡片宽度')
    expect(html).toContain('瀑布流')
    expect(html).toContain('aria-label="表格"')
    expect(html).toContain('正在读取真实内容')
    expect(html).not.toMatch(/Clerk|Sign in|Dashboard|Tasks|Users/u)
  })

  it('labels a real multimedia content shape', () => {
    const html = renderToStaticMarkup(<ContentCard item={item} />)
    expect(html).toContain('图文')
    expect(html).toContain('真实图文')
    expect(html).toContain('80 分')
  })

  it('shows the Chinese paraphrase and translation status for English X posts', () => {
    const html = renderToStaticMarkup(<ContentCard item={{
      ...item,
      id: 'x:translated',
      kind: 'short_post',
      source: { id: 'x-test', name: 'X', type: 'x' },
      title: 'We shipped a new feature',
      body: 'We shipped a new feature today.',
      originalLanguage: 'en',
      chineseTranslation: '我们今天推出了一项新功能。',
      translatedToChinese: true,
    }} />)
    expect(html).toContain('我们今天推出了一项新功能。')
    expect(html).toContain('原文英文 · 已意译')
    expect(html).not.toContain('We shipped a new feature</h2>')
  })

  it('supports combined process, read and junk filters', () => {
    const other: FeedItem = {
      ...item,
      id: 'x:2',
      title: '失败垃圾',
      processStatus: 'failed',
      read: true,
      junk: { isJunk: true, source: 'manual' },
    }
    expect(
      filterContentItems([item, other], {
        query: '垃圾',
        processStatus: 'failed',
        recommendation: 'all',
        read: 'read',
        junk: 'junk',
        dateFrom: '',
        dateTo: '',
      })
    ).toEqual([other])
    expect(
      filterContentItems([{ ...item, originalStatus: 'private' }], {
        query: '',
        processStatus: 'original-unavailable',
        recommendation: 'all',
        read: 'all',
        junk: 'all',
        dateFrom: '',
        dateTo: '',
      })
    ).toHaveLength(1)
    expect(
      filterContentItems(
        [
          {
            ...item,
            publishedAt: '2020-01-01T00:00:00.000Z',
            firstInflowAt: '2026-09-14T01:00:00.000Z',
          },
          {
            ...item,
            id: 'x:outside-range',
            firstInflowAt: '2026-09-07T01:00:00.000Z',
          },
        ],
        {
          query: '',
          processStatus: 'all',
          recommendation: 'all',
          read: 'all',
          junk: 'all',
          dateFrom: '2026-09-08',
          dateTo: '2026-09-14',
        }
      )
    ).toHaveLength(1)
  })

  it('keeps daily, all and junk content scopes separate', () => {
    const junk = {
      ...item,
      id: 'x:junk',
      junk: { isJunk: true, source: 'manual' as const },
    }
    const ordinary = {
      ...item,
      id: 'x:ordinary',
      recommendation: 'none' as const,
    }
    const failed = {
      ...item,
      id: 'x:failed',
      processStatus: 'failed' as const,
    }
    const items = [item, junk, ordinary, failed]

    expect(filterContentScope(items, 'daily')).toEqual([item])
    expect(filterContentScope(items, 'all')).toEqual([item, ordinary, failed])
    expect(filterContentScope(items, 'junk')).toEqual([junk])
  })
})
