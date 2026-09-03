/**
 * Jump links to each register on /canetons.
 *
 * WHY A LONG PAGE GETS AN INDEX RATHER THAN BEING SHORTENED. One photograph per
 * register is a requirement carried from the legacy site, and the photographs
 * are coming back — so the page has to be designed PHOTOGRAPHED. Measured, the
 * photographed page is ~3554px at 390px against today's 3034px: the length is
 * inherent to the requirement, not a placeholder artefact. What the page lacked
 * was a way in. See the E2a spec for the two alternatives that were rejected
 * (side-by-side registers, and disclosures).
 *
 * It knows nothing about registers — the page owns that list — so the same
 * component works whether the photographs are present or pending.
 */
export function RegisterIndex({ entries }: { entries: { id: string; label: string }[] }) {
  return (
    // aria-label because this is the page's SECOND nav; the site's own is
    // "Menu de navigation" and two unnamed navs are indistinguishable to a
    // screen reader.
    <nav aria-label="Registres" className="mt-6">
      <ul className="flex flex-wrap gap-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            {/*
              A plain <a>, not a router Link: react-router would treat "#drums"
              as a route. A same-page fragment is the browser's own job, and
              nothing in this app intercepts it — there is no scroll restoration
              and the header is not sticky.
            */}
            <a
              href={`#${entry.id}`}
              className="focus-ring flex min-h-touch items-center rounded-full border border-line bg-panel px-3 text-sm text-ink hover:border-violet hover:text-violet"
            >
              {entry.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
