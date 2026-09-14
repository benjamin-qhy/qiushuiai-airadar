import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/dist/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'apps/web/src'),
      '@airadar/config': path.resolve(
        import.meta.dirname,
        'packages/config/src/index.ts'
      ),
      '@airadar/domain': path.resolve(
        import.meta.dirname,
        'packages/domain/src/index.ts'
      ),
      '@airadar/runtime': path.resolve(
        import.meta.dirname,
        'packages/runtime/src/index.ts'
      ),
      '@airadar/service': path.resolve(
        import.meta.dirname,
        'apps/service/src/index.ts'
      ),
      '@airadar/source-adapters': path.resolve(
        import.meta.dirname,
        'packages/source-adapters/src/index.ts'
      ),
    },
  },
})
