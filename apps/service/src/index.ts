import { createServer, type Server } from 'node:http'
import { homedir } from 'node:os'
import path from 'node:path'

import { RuntimeRepository } from '@airadar/runtime'

export interface ServiceAddress {
  host: string
  port: number
}

export interface ServiceApp {
  start(options: ServiceAddress): Promise<ServiceAddress>
  stop(): Promise<void>
}

export function createServiceApp(
  options: { dataRoot?: string } = {}
): ServiceApp {
  let server: Server | undefined
  let repository: RuntimeRepository | undefined
  const dataRoot =
    options.dataRoot ??
    process.env.AIRADAR_DATA_ROOT ??
    path.join(homedir(), '.airadar', 'data')

  return {
    async start(options) {
      if (server) throw new Error('AI Radar service is already running')
      repository = await RuntimeRepository.open(dataRoot)
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

      try {
        await new Promise<void>((resolve, reject) => {
          server?.once('error', reject)
          server?.listen(options.port, options.host, resolve)
        })
      } catch (error) {
        server = undefined
        await repository.close()
        repository = undefined
        throw error
      }
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('Service did not bind a TCP address')
      return { host: options.host, port: address.port }
    },
    async stop() {
      const activeServer = server
      const activeRepository = repository
      server = undefined
      repository = undefined
      if (activeServer) {
        await new Promise<void>((resolve, reject) => {
          activeServer.close((error) => (error ? reject(error) : resolve()))
        })
      }
      await activeRepository?.close()
    },
  }
}
