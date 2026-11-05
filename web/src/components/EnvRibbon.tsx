import { t } from "../i18n";

const NON_PROD = ["dev", "test", "qa"];

/**
 * The non-prod corner ribbon.
 *
 * An unknown or missing env is treated as PROD, with no ribbon, so the live
 * site stays clean by default. The other default would put a ribbon on the
 * real site, which teaches everyone to ignore ribbons.
 *
 * "preview" is no server's env: only the mocked backend of a PR preview
 * answers it (#353), and the PR number is baked into that build alone.
 */
export function EnvRibbon({ env }: { env: string }) {
  let label: string;
  if (env === "preview") {
    label = t("envRibbon.preview", { pr: import.meta.env.VITE_PREVIEW_PR ?? "?" });
  } else if (NON_PROD.includes(env)) {
    label = env.toUpperCase();
  } else {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      /* A corner tab rather than a rotated banner, so the whole label stays
         inside the viewport and readable.

         z-20, under the nav (z-30) and the phone menu (z-40), so it never
         covers the language switch or the menu's close button. */
      className="pointer-events-none fixed top-0 right-0 z-20 rounded-bl bg-danger px-3 py-1 text-xs font-bold tracking-widest text-white shadow-lg"
    >
      {label}
    </div>
  );
}
