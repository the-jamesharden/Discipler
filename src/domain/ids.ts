/**
 * Identifiers are branded so a PersonId cannot be passed where a MinistryId is
 * expected. The brand exists only at compile time; the runtime value is a uuid.
 */

declare const brand: unique symbol

type Branded<T, B extends string> = T & { readonly [brand]: B }

export type MinistryId = Branded<string, 'MinistryId'>
export type PersonId = Branded<string, 'PersonId'>
export type EventId = Branded<string, 'EventId'>

export const ministryId = (value: string): MinistryId => value as MinistryId
export const personId = (value: string): PersonId => value as PersonId
export const eventId = (value: string): EventId => value as EventId
