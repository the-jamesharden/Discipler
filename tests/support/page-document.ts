/**
 * A page function answers with one jsonb document, and the client hands it back
 * untyped. These say what a test is about to read out of it: the document, or
 * one list of rows inside it. Named once, because every suite that reads a page
 * document raw needs the same two.
 */
export const asDocument = (data: unknown) => data as Record<string, unknown>
export const asRows = (data: unknown) => data as Record<string, unknown>[]
