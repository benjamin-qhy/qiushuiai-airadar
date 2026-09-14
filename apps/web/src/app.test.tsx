import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { App } from './app.js'

describe('empty web shell', () => {
  it('identifies AI Radar without template login or demo content', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('AI Radar')
    expect(html).toContain('系统外壳已就绪')
    expect(html).not.toMatch(/Clerk|Sign in|Dashboard|Tasks|Users/u)
  })
})
