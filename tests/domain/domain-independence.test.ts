import { builtinModules } from 'node:module'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
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

const nodeBuiltins = new Set(builtinModules)

/**
 * Matched against the module specifier with its quotes already stripped, so a
 * pattern must not expect them. Each covers the bare name, the `~/` alias and the
 * relative form, because an escape is as likely to be written `../platform/...` as
 * `~/platform/...`.
 */
const forbidden = [
  { pattern: /^@supabase\//, name: 'the Supabase SDK' },
  { pattern: /^(pg|postgres)(\/|$)/, name: 'a Postgres driver' },
  { pattern: /^next(\/|$)/, name: 'Next.js' },
  { pattern: /(^|\/)platform\//, name: 'a platform adapter' },
  { pattern: /(^|\/)service\//, name: 'the application service' },
  { pattern: /^node:/, name: 'a Node built-in' },
]

const isNodeBuiltin = (module: string): boolean =>
  module.startsWith('node:') || nodeBuiltins.has(module)

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
      const label = path.slice(repoRoot.length)

      for (const module of importedModules(readFileSync(path, 'utf8'))) {
        for (const { pattern, name } of forbidden) {
          expect(pattern.test(module), `${label} imports ${name} via "${module}"`).toBe(false)
        }

        expect(isNodeBuiltin(module), `${label} imports a Node built-in via "${module}"`).toBe(
          false,
        )
      }
    },
  )

  // The list above names the escapes worth naming. This catches the rest: any
  // relative import that lands outside src/domain, whatever it is called and
  // wherever it is added later.
  it.each(domainFiles.map((path) => [path.slice(repoRoot.length), path]))(
    'reaches no further than its own directory: %s',
    (_label, path) => {
      const domainRoot = join(repoRoot, 'src', 'domain')

      for (const module of importedModules(readFileSync(path, 'utf8'))) {
        if (!module.startsWith('.')) continue

        const escape = relative(domainRoot, resolve(dirname(path), module))
        expect(
          escape.startsWith('..'),
          `${path.slice(repoRoot.length)} reaches outside the domain via "${module}"`,
        ).toBe(false)
      }
    },
  )
})
