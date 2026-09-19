import { build } from 'esbuild'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
await build({
  entryPoints: [path.join(root, 'apps/cli/src/cli.ts')],
  outfile: path.join(root, 'apps/cli/dist/cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['@earendil-works/pi-ai', '@earendil-works/pi-ai/*'],
  banner: {
    js: "import { createRequire as createNodeRequire } from 'node:module'; const require = createNodeRequire(import.meta.url);",
  },
})
