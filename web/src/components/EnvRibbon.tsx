const NON_PROD = ["dev", "test", "qa"];

/**
 * The non-prod corner ribbon.
 *
 * An unknown or missing env is treated as PROD — i.e. no ribbon — so the live
 * site stays clean BY DEFAULT rather than by configuration. That was
 * App\Env's behaviour and it is kept: the failure mode of the other default is
 * a ribbon on the real site, which teaches everyone to ignore ribbons.
 */
export function EnvRibbon({ env }: { env: string }) {
  if (!NON_PROD.includes(env)) return null;

  return (
    <div
      aria-hidden="true"
      /* A corner TAB, not the old rotated banner. The 45-degree version was
         translated a quarter of its own width to the right, so most of the
         label sat outside the viewport and could only be read by guessing —
         which defeats the entire point of a ribbon that exists to stop someone
         mistaking TEST for the live site. */
      className="pointer-events-none fixed top-0 right-0 z-50 rounded-bl bg-danger px-3 py-1 text-xs font-bold tracking-widest text-white shadow-lg"
    >
      {env.toUpperCase()}
    </div>
  );
}
