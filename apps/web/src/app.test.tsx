import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { App } from './app.js'

describe('content feed shell', () => {
  it('shows daily and all-content views without demo content', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('AI Radar')
    expect(html).toContain('每日精选')
    expect(html).toContain('全部内容')
    expect(html).toContain('正在读取真实内容')
    expect(html).not.toMatch(/Clerk|Sign in|Dashboard|Tasks|Users/u)
  })
})
