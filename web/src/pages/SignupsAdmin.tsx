import { useSignupIndex } from "../api/generated/endpoints";
import { PageSection } from "@/components/PageSection";

/**
 * Who reserved, at which table, eating what.
 *
 * Admin-only — `view_summary`, which `admin` alone holds. The capability matrix
 * is not a hierarchy, so `user`/`moderator` are refused even though they may
 * respond to events: this page lists every guest's name, address, phone and
 * email. RequireCapability in routes.tsx is UX only; the route's
 * `capability:view_summary` middleware is the enforcement.
 */

/** A zero is a dash, as the old page had it — it keeps a long table readable. */
function Num({ value, total = false }: { value: number; total?: boolean }) {
  return (
    <td
      className={`p-3 text-right tabular-nums ${total ? "font-semibold" : ""} ${
        value === 0 ? "text-ink-muted" : ""
      }`}
    >
      {value === 0 ? "–" : value}
    </td>
  );
}

export function SignupsAdmin() {
  const summary = useSignupIndex();

  if (summary.isPending) {
    return (
      <PageSection>
        <p>Chargement…</p>
      </PageSection>
    );
  }

  if (summary.isError) {
    return (
      <PageSection>
        <p role="alert" className="text-danger">
          Les inscriptions n’ont pas pu être chargées. Veuillez réessayer.
        </p>
      </PageSection>
    );
  }

  // TWO narrowings are needed here, because the generated union has three arms.
  //
  // First `status`, as InscriptionsAdmin does: the spec documents a 401, so
  // `data` is otherwise `AuthenticationExceptionResponse` too. customFetch
  // (web/src/api/http.ts) throws on every non-2xx before a query resolves, so
  // isError above has already caught that; the check just proves it.
  //
  // Then the data shape, because the 200 documents TWO media types — the JSON
  // summary and the xlsx export — and BOTH carry `status: 200`, so status alone
  // still leaves `SignupIndex200One | string`. This page never requests the
  // spreadsheet (the export is a plain <a>, below), so the string arm is
  // unreachable here; narrowing proves that to the type checker rather than
  // asserting past it with a cast.
  const data = summary.data.status === 200 ? summary.data.data : null;
  if (data === null || typeof data === "string") {
    return (
      <PageSection>
        <p role="alert" className="text-danger">
          Les inscriptions n’ont pas pu être chargées. Veuillez réessayer.
        </p>
      </PageSection>
    );
  }

  const tiles = [
    { label: "Total personnes", value: data.totalPersons },
    { label: "Total tables", value: data.totalTables },
    { label: "Viande", value: data.menuTotals.meat },
    { label: "Enfant", value: data.menuTotals.child },
    { label: "Végétarien", value: data.menuTotals.vegetarian },
  ];

  return (
    <PageSection>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl">Inscriptions — {data.occasion.title}</h1>
        {/* A plain link, NOT a client call: the generated client cannot stream
            a download, and a normal navigation carries the session cookie. */}
        <a
          href="/api/signups?format=xlsx"
          className="rounded border border-line px-3 py-2 hover:border-violet hover:text-violet"
        >
          <span aria-hidden="true">⬇</span> Exporter en Excel
        </a>
      </div>

      {/* NAMED, because the layout's nav is a list too. */}
      <ul
        aria-label="Totaux des inscriptions"
        aria-live="polite"
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        {tiles.map((item) => (
          <li
            key={item.label}
            data-tile
            className="rounded-lg border border-line bg-panel p-5 text-center"
          >
            <p className="font-display text-4xl text-violet">{item.value}</p>
            <p className="mt-1 text-sm text-ink-muted">{item.label}</p>
          </li>
        ))}
      </ul>

      {/* The table below carries `min-w-160` as well as `w-full`, and that is
          the whole reason this panel works. `w-full` inside an overflow-x
          container is width:100% OF THAT CONTAINER, so a six-column table never
          scrolls — it SQUEEZES: at 390px every phone number broke across five
          lines, every address across four, and the Total column still hung 47px
          past the edge behind a scrollbar too short to read as one. The
          min-width is what gives the container something to scroll; above 40rem
          `w-full` still wins and nothing changes.

          tabIndex and role go on the SCROLLER, not the table: a container that
          scrolls has to be reachable by keyboard. Its label is deliberately not
          the table's own ("Inscriptions"), so a query for one never matches the
          other. */}
      <div
        role="region"
        aria-label="Tableau des inscriptions"
        tabIndex={0}
        className="mt-8 overflow-x-auto rounded-lg border border-line bg-panel focus-visible:outline-2 focus-visible:outline-violet"
      >
        <table className="w-full min-w-160 text-left" aria-label="Inscriptions">
          <thead>
            <tr className="border-b border-line">
              <th className="p-3 font-semibold text-ink-muted">Table / Contact</th>
              <th className="p-3 font-semibold text-ink-muted">Tél.</th>
              <th className="p-3 text-right font-semibold text-ink-muted">Viande</th>
              <th className="p-3 text-right font-semibold text-ink-muted">Enfant</th>
              <th className="p-3 text-right font-semibold text-ink-muted">Végét.</th>
              <th className="p-3 text-right font-semibold text-ink-muted">Total</th>
            </tr>
          </thead>
          {/* flatMap, not a nested <tbody> per table: the group row and its
              reservations are SIBLINGS, as the old markup had them, and a
              <tbody> per table would break the row count every test asserts on. */}
          <tbody aria-live="polite">
            {data.tables.flatMap((table) => [
              <tr key={`${table.name}-group`} className="border-b border-line bg-line/30">
                <td className="p-3 font-semibold" colSpan={2}>
                  {table.name}
                </td>
                <Num value={table.menuCounts.meat} />
                <Num value={table.menuCounts.child} />
                <Num value={table.menuCounts.vegetarian} />
                <Num value={table.personCount} total />
              </tr>,
              /* Keyed by POSITION, not by contact details. A signup carries no
                 id — the payload has none, `signups` has no unique index on
                 email, and store() does not dedupe — so two reservations from
                 one household at one table (a parent booking again to add a
                 grandparent) collide on any natural key built from email and
                 phone. This list is read-only and never reorders, so the index
                 is both stable and safe here. */
              ...table.signups.map((signup, position) => (
                <tr key={`${table.name}-${position}`} className="border-b border-line">
                  <td className="p-3">
                    <strong>
                      {signup.first_name} {signup.last_name}
                    </strong>
                    <span className="block text-sm text-ink-muted">{signup.address}</span>
                  </td>
                  {/* nowrap: a phone number has one shape and reading it costs
                      nothing when it is on one line and everything when the
                      column is narrow enough to stack it digit-group per
                      line. */}
                  <td className="p-3 whitespace-nowrap">{signup.phone}</td>
                  <Num value={signup.menuCounts.meat} />
                  <Num value={signup.menuCounts.child} />
                  <Num value={signup.menuCounts.vegetarian} />
                  <Num value={signup.personCount} total />
                </tr>
              )),
            ])}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line bg-line/30">
              <td className="p-3 font-semibold" colSpan={2}>
                Total général
              </td>
              <Num value={data.menuTotals.meat} total />
              <Num value={data.menuTotals.child} total />
              <Num value={data.menuTotals.vegetarian} total />
              <Num value={data.totalPersons} total />
            </tr>
          </tfoot>
        </table>
      </div>
    </PageSection>
  );
}
