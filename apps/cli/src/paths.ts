import { homedir } from 'node:os'
import path from 'node:path'

export const applicationDirectoryName = '.qiushuiai-airadar'

export function applicationRoot(home = homedir()): string {
  return path.join(home, applicationDirectoryName)
}

export function installedDataRoot(home = homedir()): string {
  return path.join(applicationRoot(home), 'installed-data')
}

export function installedProgramRoot(home = homedir()): string {
  return path.join(applicationRoot(home), 'installed-program')
}

export function installedServiceRoot(home = homedir()): string {
  return path.join(applicationRoot(home), 'installed-service')
}
