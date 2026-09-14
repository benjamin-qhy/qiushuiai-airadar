import type { SecretStatusReader } from '@airadar/config'
import { createServiceApp } from '@airadar/service'
import { fileURLToPath } from 'node:url'
import {
  createSystemServiceManager,
  type ManagedServiceCommand,
  type ServiceManager,
} from './service-manager.js'

interface Output {
  write(chunk: string): void
}

interface CliDependencies {
  stdout: Output
  stderr?: Output
  secretStatusReader?: SecretStatusReader
  serviceFactory?: typeof createServiceApp
  serviceManager?: ServiceManager
}

const help = `AI Radar command line

Usage:
  airadar status
  airadar secrets status <NAME>
  airadar service run [--host <HOST>] [--port <PORT>]
  airadar service <install|start|stop|restart|status|uninstall> [--host <HOST>] [--port <PORT>]
`

function writeJson(output: Output, value: unknown): void {
  output.write(`${JSON.stringify(value)}\n`)
}

export async function runCli(
  args: string[],
  dependencies: CliDependencies
): Promise<number> {
  const [command, subcommand, name] = args
  if (!command || command === '--help' || command === 'help') {
    dependencies.stdout.write(help)
    return 0
  }
  if (command === '--version' || command === 'version') {
    dependencies.stdout.write('0.1.0\n')
    return 0
  }
  if (command === 'status') {
    writeJson(dependencies.stdout, {
      name: 'airadar',
      status: 'ready',
      version: '0.1.0',
    })
    return 0
  }
  if (command === 'secrets' && subcommand === 'status' && name) {
    if (!dependencies.secretStatusReader)
      throw new Error('Secret status reader is not configured')
    writeJson(
      dependencies.stdout,
      await dependencies.secretStatusReader.getStatus(name)
    )
    return 0
  }
  if (command === 'service') {
    const hostIndex = args.indexOf('--host')
    const portIndex = args.indexOf('--port')
    const host = hostIndex >= 0 ? args[hostIndex + 1] : '127.0.0.1'
    const portText = portIndex >= 0 ? args[portIndex + 1] : undefined
    const port = portText ? Number.parseInt(portText, 10) : 43110
    if (!host || !Number.isInteger(port) || port < 0 || port > 65535) {
      throw new Error('service requires a valid --host and --port')
    }
    const managedCommands = new Set<ManagedServiceCommand>([
      'install',
      'start',
      'stop',
      'restart',
      'status',
      'uninstall',
    ])
    if (managedCommands.has(subcommand as ManagedServiceCommand)) {
      const manager =
        dependencies.serviceManager ??
        createSystemServiceManager({
          nodePath: process.execPath,
          cliPath: process.argv[1] ?? '',
        })
      writeJson(
        dependencies.stdout,
        await manager.execute(subcommand as ManagedServiceCommand, {
          host,
          port,
        })
      )
      return 0
    }
    if (subcommand && subcommand !== 'run' && !subcommand.startsWith('--')) {
      throw new Error(`Unknown service command: ${subcommand}`)
    }
    const address = await (dependencies.serviceFactory ?? createServiceApp)({
      executeTasks: true,
      webRoot: fileURLToPath(new URL('../web', import.meta.url)),
    }).start({ host, port })
    writeJson(dependencies.stdout, {
      service: 'airadar',
      status: 'ready',
      ...address,
    })
    return 0
  }

  dependencies.stderr?.write(`Unknown command: ${args.join(' ')}\n`)
  return 1
}
