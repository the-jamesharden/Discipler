import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The domain must not become coupled to the hosting platform. Supabase sits behind
 * the command boundary in the same position a delivery vendor occupies behind the
 * outbound queue: if either has to be replaced, the domain and its tests should not
 * move. That is a claim worth checking mechanically, because it decays one
 * convenient import at a time.
 */

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

const filesUnder = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return filesUnder(path)
    return path.endsWith('.ts') ? [path] : []
  })

const forbidden = [
  { pattern: /@supabase\//, name: 'the Supabase SDK' },
  { pattern: /(^|['"/])pg(['"/]|$)/, name: 'a Postgres driver' },
  { pattern: /\bnext\//, name: 'Next.js' },
  { pattern: /~\/platform\//, name: 'a platform adapter' },
  { pattern: /~\/service\//, name: 'the application service' },
  { pattern: /node:/, name: 'a Node built-in' },
]

const importedModules = (source: string): string[] => [
  ...source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g),
].map((match) => match[1]!)

describe('the domain', () => {
  const domainFiles = filesUnder(join(repoRoot, 'src', 'domain'))

  it('has files to check', () => {
    expect(domainFiles.length).toBeGreaterThan(0)
  })

  it.each(domainFiles.map((path) => [path.slice(repoRoot.length), path]))(
    'imports nothing outside itself: %s',
    (_label, path) => {
      for (const module of importedModules(readFileSync(path, 'utf8'))) {
        for (const { pattern, name } of forbidden) {
          expect(
            pattern.test(module),
            `${path.slice(repoRoot.length)} imports ${name} via "${module}"`,
          ).toBe(false)
        }
      }
    },
  )
})
