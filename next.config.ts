import type { NextConfig } from 'next'
import { assertDeploymentIsSafe } from './src/platform/deployment'
import { SECURITY_HEADERS } from './src/platform/security-headers'

// Refused at build, before anything is compiled, so a staging deployment given a
// production value never goes live and the one before it goes on serving
// (Exponential launch, ticket 02). `instrumentation.ts` checks again at start.
assertDeploymentIsSafe(process.env)

const nextConfig: NextConfig = {
  /**
   * On every response, redirects and files included (Exponential launch, ticket 37). The
   * Content-Security-Policy is in `middleware.ts`, because it holds a nonce.
   */
  headers: async () => [{ source: '/(.*)', headers: [...SECURITY_HEADERS] }],
  /**
   * `import text from './page.md?raw'` gives the file's text, as it does under
   * Vite, which the tests and scripts run on. The help docs are Markdown files read
   * this way (`app/help/library.ts`), so their words are bundled with whatever
   * reads them -- the help pages, search and the AI guide -- and nothing has to
   * find a file on the server at run time.
   */
  webpack: (config: { module: { rules: unknown[] } }) => {
    config.module.rules.push({ resourceQuery: /^\?raw$/, type: 'asset/source' })
    return config
  },
}

export default nextConfig
