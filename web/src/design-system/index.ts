/**
 * The design system's public API (ADR 0003). The app imports from here and from
 * nowhere deeper; ESLint (`boundaries/entry-point`) and dependency-cruiser both
 * fail a deep import. Anything not re-exported below is internal.
 */
export * from "./primitives";
