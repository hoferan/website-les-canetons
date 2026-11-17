/**
 * The design system's public API (ADR 0046). The app imports from here and from
 * nowhere deeper; ESLint (`boundaries/entry-point`) and dependency-cruiser both
 * fail a deep import. Anything not re-exported below is internal.
 *
 * No module in here may do anything when it is imported, a listener or a
 * global style say. The build counts on it (vite.config.ts) to keep the
 * components a page does not use out of the visitor's bundle (#476), and
 * would drop such a module unseen.
 */
export * from "./primitives";
export * from "./composites";
