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
      className="pointer-events-none fixed right-0 top-0 z-50 origin-top-right translate-x-1/4 translate-y-8 rotate-45 bg-canetons-red px-12 py-1 text-center text-sm font-bold tracking-wider text-white shadow"
    >
      {env.toUpperCase()}
    </div>
  );
}
