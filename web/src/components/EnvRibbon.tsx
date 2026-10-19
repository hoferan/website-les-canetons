const NON_PROD = ["dev", "test", "qa"];

/**
 * The non-prod corner ribbon.
 *
 * An unknown or missing env is treated as PROD, with no ribbon, so the live
 * site stays clean by default. The other default would put a ribbon on the
 * real site, which teaches everyone to ignore ribbons.
 */
export function EnvRibbon({ env }: { env: string }) {
  if (!NON_PROD.includes(env)) return null;

  return (
    <div
      aria-hidden="true"
      /* A corner tab rather than a rotated banner, so the whole label stays
         inside the viewport and readable.

         z-20, under the nav (z-30) and the phone menu (z-40), so it never
         covers the language switch or the menu's close button. */
      className="pointer-events-none fixed top-0 right-0 z-20 rounded-bl bg-danger px-3 py-1 text-xs font-bold tracking-widest text-white shadow-lg"
    >
      {env.toUpperCase()}
    </div>
  );
}
