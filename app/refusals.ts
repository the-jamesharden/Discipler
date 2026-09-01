/**
 * Reading a refusal code back off the query string, for every surface in this app.
 *
 * The boundary refuses in codes and each screen owns the sentences it says them
 * with -- that part is deliberately per-surface, because rewording what an Admin
 * reads is a different reason to change than anything the domain changes for. What
 * is *not* per-surface is the lookup itself, and it had already been written out
 * twice letter for letter before this existed. A helper that means the same thing
 * in two files is one helper, which is the argument `src/platform/supabase/rows.ts`
 * makes about its own.
 *
 * The `Object.hasOwn` is the whole point of it. `in` walks the prototype chain, so
 * `__proto__`, `toString` and `valueOf` are all `in` a plain object and none of
 * them is a refusal -- and what arrives in the query string is whatever somebody
 * typed there, so `in` would hand a screen an object or a function to render and
 * take the page down with it.
 *
 * Nothing is ever echoed. A code no surface recognises renders nothing rather than
 * reflecting itself into the page.
 */

/** Whether this Ministry's screen has a sentence for that code. */
export const isRefusalIn = <Refusal extends string>(
  sentences: Record<Refusal, string>,
  code: string,
): code is Refusal => Object.hasOwn(sentences, code)

/**
 * The sentence for a single refusal that came back on the query string, or null
 * for one this screen does not recognise.
 */
export const refusalIn = <Refusal extends string>(
  sentences: Record<Refusal, string>,
  code: string | undefined,
): string | null =>
  code !== undefined && isRefusalIn(sentences, code) ? sentences[code] : null

/**
 * The sentences for a comma-separated list of refusals, in the order they arrived
 * -- which is the order of the fields on the form, so an Admin reads their
 * mistakes top to bottom the way they filled it in.
 *
 * Unrecognised codes are dropped rather than rendered, for the reason above.
 */
export const refusalsIn = <Refusal extends string>(
  sentences: Record<Refusal, string>,
  codes: string | undefined,
): readonly string[] =>
  (codes ?? '')
    .split(',')
    .filter((code) => isRefusalIn(sentences, code))
    .map((code) => sentences[code as Refusal])
