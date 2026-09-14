import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { App, ContentCard } from './app.js'

describe('content feed shell', () => {
  it('shows daily and all-content views without demo content', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('AI Radar')
    expect(html).toContain('每日精选')
    expect(html).toContain('全部内容')
    expect(html).toContain('正在读取真实内容')
    expect(html).not.toMatch(/Clerk|Sign in|Dashboard|Tasks|Users/u)
  })

  it('labels a real multimedia content shape', () => {
    const html = renderToStaticMarkup(
      <ContentCard
        item={{
          id: 'xiaohongshu:note-1',
          kind: 'image_post',
          title: '真实图文',
          summary: '全部图片已经保存并逐图识别。',
          topics: ['AI'],
          totalScore: 80,
          recommendation: 'core',
        }}
      />
    )
    expect(html).toContain('图文')
    expect(html).toContain('真实图文')
  })
})
