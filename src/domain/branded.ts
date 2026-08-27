/**
 * A compile-time brand. The runtime value is exactly the string it wraps; the brand
 * exists so that a value which has been through a check cannot be confused with one
 * that has not, and so that two strings meaning different things cannot be swapped.
 */

declare const brand: unique symbol

export type Branded<T, B extends string> = T & { readonly [brand]: B }
