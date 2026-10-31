import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
