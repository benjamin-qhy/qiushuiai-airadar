import { afterEach, describe, expect, it } from 'vitest'
import { createServiceApp, type ServiceApp } from './index.js'

describe('background service shell', () => {
  let service: ServiceApp | undefined

  afterEach(async () => {
    await service?.stop()
  })

  it('starts on loopback and exposes only a minimal health response', async () => {
    service = createServiceApp()
    const address = await service.start({ host: '127.0.0.1', port: 0 })
    const response = await fetch(
      `http://${address.host}:${address.port}/health`
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      service: 'airadar',
      status: 'ready',
    })
  })

  it('does not expose unknown routes', async () => {
    service = createServiceApp()
    const address = await service.start({ host: '127.0.0.1', port: 0 })
    const response = await fetch(
      `http://${address.host}:${address.port}/secrets`
    )

    expect(response.status).toBe(404)
  })
})
