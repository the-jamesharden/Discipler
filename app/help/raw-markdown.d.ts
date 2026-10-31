/**
 * A help page's Markdown, imported as its text: `import page from './page.md?raw'`.
 * Vite reads `?raw` by itself, and `next.config.ts` teaches webpack the same. See
 * `app/help/library.ts`.
 */
declare module '*.md?raw' {
  const text: string
  export default text
}
