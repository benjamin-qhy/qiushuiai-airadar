import { createServer, type Server } from 'node:http'

export interface ServiceAddress {
  host: string
  port: number
}

export interface ServiceApp {
  start(options: ServiceAddress): Promise<ServiceAddress>
  stop(): Promise<void>
}

export function createServiceApp(): ServiceApp {
  let server: Server | undefined

  return {
    async start(options) {
      if (server) throw new Error('AI Radar service is already running')
      server = createServer((request, response) => {
        response.setHeader('content-type', 'application/json; charset=utf-8')
        if (request.method === 'GET' && request.url === '/health') {
          response.statusCode = 200
          response.end(JSON.stringify({ service: 'airadar', status: 'ready' }))
          return
        }
        response.statusCode = 404
        response.end(JSON.stringify({ error: 'not_found' }))
      })

      await new Promise<void>((resolve, reject) => {
        server?.once('error', reject)
        server?.listen(options.port, options.host, resolve)
      })
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('Service did not bind a TCP address')
      return { host: options.host, port: address.port }
    },
    async stop() {
      if (!server) return
      const activeServer = server
      server = undefined
      await new Promise<void>((resolve, reject) => {
        activeServer.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}
