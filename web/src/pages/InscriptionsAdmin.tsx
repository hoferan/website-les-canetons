import { useSearchParams } from "react-router-dom";

import { useResponseIndex } from "../api/generated/endpoints";

/**
 * Who is coming, and how many of each register.
 *
 * The endpoint returns EVERY user with their instrument and their answer or
 * null — a LEFT JOIN, not only the people who replied. That is what makes
 * "En attente" countable, and it is why the register list can be derived from
 * the data instead of the hardcoded array of nine French instrument names the
 * old page carried, which drifted from the `instruments` table.
 */
export function InscriptionsAdmin() {
  const [params] = useSearchParams();
  const eventId = params.get("id");

  const summary = useResponseIndex(
    { eventId: eventId ?? "" },
    { query: { enabled: Boolean(eventId) } },
  );

  if (!eventId) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-display text-4xl">Résumé des inscriptions</h1>
        <p role="alert" className="mt-4 text-danger">
          Aucun événement choisi. Retournez à la liste et choisissez-en un.
        </p>
      </section>
    );
  }

  if (summary.isPending) {
    return <p className="mx-auto max-w-4xl px-4 py-8">Chargement…</p>;
  }

  if (summary.isError) {
    return (
      <p role="alert" className="mx-auto max-w-4xl px-4 py-8 text-danger">
        Le résumé n’a pas pu être chargé. Veuillez réessayer.
      </p>
    );
  }

  // The generated response type is a union over every status the OpenAPI spec
  // documents (200/400/401), because `responseIndex()` can structurally return
  // any of them — even though customFetch (web/src/api/http.ts) throws on every
  // non-2xx response before a query ever resolves with one. `isError` above
  // catches that throw, so by the time we get here `status` is always 200; this
  // guard just proves it to the type checker instead of asserting past it.
  const rows = summary.data.status === 200 ? summary.data.data : [];
  const participating = rows.filter((row) => row.response === "participate");
  const declining = rows.filter((row) => row.response === "notparticipate");
  const pending = rows.length - participating.length - declining.length;

  // Derived, and sorted, so the table is stable between renders.
  const registers = [
    ...new Set(rows.map((row) => row.instrument).filter((name): name is string => Boolean(name))),
  ].sort((a, b) => a.localeCompare(b, "fr"));

  // Four tiles and these exact words, because that is what the old page had.
  // "Convoqués" is the roll call — every member the event applies to — and it
  // is only countable because the endpoint returns people who have NOT answered
  // as well.
  const tiles = [
    { label: "Convoqués", value: rows.length },
    { label: "Participe", value: participating.length },
    { label: "Ne participe pas", value: declining.length },
    { label: "Pas de réponse", value: pending },
  ];

  return (
    <section className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-display text-4xl">Résumé des inscriptions</h1>

      {/* A NAMED list, not a bare div. The tiles and the table below use the
          same three words — "Participe", "Ne participe pas", "Pas de réponse" —
          because the old page did, and a plain getByText for one of them
          matches four elements. Naming the list is what lets a test say which
          it means, and it is the same thing the planning page does with its
          "Événements" list.

          aria-live as the old page had it: the numbers change when the query
          refetches, and an admin watching the page should hear it. */}
      <ul
        aria-label="Résumé de la participation"
        aria-live="polite"
        className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
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

      <div className="mt-8 overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full text-left" aria-label="Réponses">
          <thead>
            <tr className="border-b border-line">
              <th className="p-3 font-semibold text-ink-muted">Nom d’utilisateur</th>
              <th className="p-3 font-semibold text-ink-muted">Instrument</th>
              <th className="p-3 font-semibold text-ink-muted">Participation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.username} className="border-b border-line last:border-0">
                <td className="p-3">{row.username}</td>
                <td className="p-3">{row.instrument ?? "—"}</td>
                {/* Deliberately worded differently from the tile labels above
                    ("Participe" / "Ne participe pas" / "En attente"): with the
                    same three strings in both places, an accessible-name query
                    for one string would match a tile AND up to five table
                    cells at once. */}
                <td className="p-3">
                  {row.response === "participate"
                    ? "Participe"
                    : row.response === "notparticipate"
                      ? "Ne participe pas"
                      : "Pas de réponse"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-display text-2xl">Résumé des instruments</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full text-left" aria-label="Résumé des instruments">
          <thead>
            <tr className="border-b border-line">
              <th className="p-3 font-semibold text-ink-muted">Instrument</th>
              <th className="p-3 font-semibold text-ink-muted">Nombre</th>
            </tr>
          </thead>
          <tbody>
            {registers.map((register) => (
              <tr key={register} className="border-b border-line last:border-0">
                <td className="p-3">{register}</td>
                <td className="p-3 tabular-nums">
                  {participating.filter((row) => row.instrument === register).length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
