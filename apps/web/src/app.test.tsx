import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { App, ContentCard, type FeedItem } from './app.js'
import { filterContentItems } from './lib/content-filters.js'

const item: FeedItem = {
  id: 'xiaohongshu:note-1',
  kind: 'image_post',
  title: '真实图文',
  body: '正文',
  summary: '全部图片已经保存并逐图识别。',
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
    expect(html).toContain('信源管理')
    expect(html).toContain('运行状态')
    expect(html).toContain('系统配置')
    expect(html).toContain('正在读取真实内容')
    expect(html).not.toMatch(/Clerk|Sign in|Dashboard|Tasks|Users/u)
  })

  it('labels a real multimedia content shape', () => {
    const html = renderToStaticMarkup(<ContentCard item={item} />)
    expect(html).toContain('图文')
    expect(html).toContain('真实图文')
    expect(html).toContain('80 分')
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
        date: '',
      })
    ).toEqual([other])
    expect(
      filterContentItems([{ ...item, originalStatus: 'private' }], {
        query: '',
        processStatus: 'original-unavailable',
        recommendation: 'all',
        read: 'all',
        junk: 'all',
        date: '',
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
        ],
        {
          query: '',
          processStatus: 'all',
          recommendation: 'all',
          read: 'all',
          junk: 'all',
          date: '2026-09-14',
        }
      )
    ).toHaveLength(1)
  })
})
