import { type ReactNode } from "react";

const NON_PROD = ["dev", "test", "qa"];

/**
 * The non-prod corner ribbon.
 *
 * An unknown or missing env is treated as PROD, with no ribbon, so the live
 * site stays clean by default. The other default would put a ribbon on the
 * real site, which teaches everyone to ignore ribbons.
 *
 * "preview" is no server's env: only the mocked backend of a PR preview
 * answers it (#353), and the PR number is baked into that build alone. Its
 * label is English in both locales, like the env names, because only
 * developers and reviewers ever see a preview.
 */
export function EnvRibbon({ env }: { env: string }) {
  let label: ReactNode;
  if (env === "preview") {
    const pr = import.meta.env.VITE_PREVIEW_PR ?? "?";
    // The whole label is wider than a phone's header leaves free and would
    // cover the band's name, so a phone gets the PR number alone.
    label = (
      <>
        <span className="sm:hidden">PR {pr}</span>
        <span className="hidden sm:inline">Preview PR {pr}, mocked data</span>
      </>
    );
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
         covers the language switch or the menu's close button.

         Shorter on a phone, where the band's name in the header starts 17px
         from the top and a full-height tab clips its last letters. */
      className="pointer-events-none fixed top-0 right-0 z-20 rounded-bl bg-danger px-2 py-0.5 text-[10px] leading-tight font-bold tracking-widest text-white shadow-lg sm:px-3 sm:py-1 sm:text-xs sm:leading-4"
    >
      {label}
    </div>
  );
}
