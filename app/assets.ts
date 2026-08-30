import { createAssetServer } from 'remix/assets'

const rootDir = process.cwd()

/**
 * `@remix-run/assets` watches the filesystem by default (chokidar). That is correct for a
 * long-lived `npm run start` / `npm run dev` process, but HTML renders in `node --test` call
 * `assetServer.getHref`, which registers StatWatchers and prevents the runner from exiting
 * after assertions complete. Disable watch under the test runner and in production.
 * See `@remix-run/assets` README "File watching" and `assetServer.close()`.
 *
 * Detection note: with `--test-isolation=process`, worker processes do not see `--test` in
 * `process.argv` / `execArgv`. Node sets `NODE_TEST_CONTEXT` instead.
 */
function resolveAssetWatch(): boolean {
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'production') {
    return false
  }
  if (process.env.NODE_TEST_CONTEXT) {
    return false
  }
  return true
}

export const assetServer = createAssetServer({
  basePath: '/assets',
  rootDir,
  fileMap: {
    'app/*path': 'app/*path',
    'node_modules/*path': 'node_modules/*path',
  },
  allow: [
    'app/assets/**',
    'app/ui/**',
    'app/utils/**',
    'app/routes.ts',
    'node_modules/**',
  ],
  deny: ['app/**/*.server.*'],
  watch: resolveAssetWatch(),
  sourceMaps: process.env.NODE_ENV === 'development' ? 'external' : undefined,
  scripts: {
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'development'),
    },
  },
})
