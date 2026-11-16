import { type ComponentProps, type ComponentType, lazy, Suspense } from "react";

/** Any component, as `React.lazy` itself constrains it. */
type AnyComponent = ComponentType<any>;

/**
 * A component under a named export, loaded the first time it renders, in a
 * chunk of its own (#396). The caller provides the Suspense boundary.
 */
export function lazyNamed<Name extends string, Component extends AnyComponent>(
  load: () => Promise<Record<Name, Component>>,
  name: Name,
) {
  return lazy(() => load().then((module) => ({ default: module[name] })));
}

/**
 * The same, for an editor inside a public page: a visitor never renders it,
 * so its code stays out of the visitor's bundle. It brings its own empty
 * boundary, so the page around it never falls back while the chunk loads.
 *
 * The pages mount an editor as soon as edit mode is on, closed, so the chunk
 * is usually in before anybody opens it.
 */
export function onDemand<Name extends string, Component extends AnyComponent>(
  load: () => Promise<Record<Name, Component>>,
  name: Name,
) {
  const Lazy = lazyNamed(load, name) as unknown as ComponentType<ComponentProps<Component>>;

  return function OnDemand(props: ComponentProps<Component>) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
