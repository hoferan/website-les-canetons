import { ApiError } from "./http";

/**
 * The one place this app fetches an API endpoint without the generated client,
 * and the reason it has to.
 *
 * `customFetch` — the mutator every generated function goes through — ends with
 * `await response.json()`. That is right for an API whose every other response
 * is JSON, and fatal for these four: the guest list downloads answer with an
 * XLSX workbook, a semicolon-separated CSV and a Markdown table, none of which
 * parse. So `registrationExport` compiles, types beautifully, and throws on
 * three formats out of four.
 *
 * CLAUDE.md's rule against calling `fetch("/api/…")` by hand is about MUTATING
 * requests: Sanctum's stateful SPA mode puts /api/v1/* behind the `web`
 * middleware group, so a POST without the replayed `X-XSRF-TOKEN` comes back
 * 419. This is a GET, needs no CSRF priming, and needs `credentials` for the
 * session cookie — which is the whole of what the mutator would have added.
 *
 * NOT AN `<a download>` EITHER, which would be less code. A plain link cannot
 * read a status: a committee member whose server lacks ext-zip would have the
 * 503 problem document saved to their Downloads folder as a file named
 * souper-inscriptions.xlsx, and would open it in Excel to find JSON. Fetching
 * it means `xlsx_unavailable` can be said in French, which is the one refusal
 * this endpoint has that the operator can actually act on.
 */
const API_BASE = "/api/v1";

/** The formats `GET /events/{event}/registrations.{format}` serves. */
export type ExportFormat = "xlsx" | "csv" | "md" | "json";

/**
 * Downloads one file and hands it to the browser, or throws an `ApiError`.
 *
 * The filename comes from the server's `Content-Disposition` when it sends
 * one, because that is where the event's own name is; `fallback` covers a
 * proxy that strips the header, since a file called "download" in somebody's
 * Downloads folder is a file they cannot find again.
 */
export async function downloadGuestList(
  eventId: number,
  format: ExportFormat,
  fallback: string,
): Promise<void> {
  const response = await fetch(`${API_BASE}/events/${eventId}/registrations.${format}`, {
    method: "GET",
    credentials: "include",
    // No `Accept: application/json`, unlike every other request this app
    // makes: three of these four are not JSON, and saying otherwise to a
    // server that honoured it would be asking for the refusal.
    headers: { Accept: "*/*" },
  });

  if (!response.ok) {
    throw await asApiError(response);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filenameOf(response) ?? fallback;
    // Appended before the click and removed after: Firefox ignores a click on
    // an anchor that is not in the document.
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Freed on the next tick rather than immediately: revoking the URL in the
    // same task as the click races the browser's own read of it in Safari.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * The refusal, in the shape the French layer translates.
 *
 * A failure here IS still a problem document — only the success bodies are
 * binary — so this is `toApiError`'s job done again rather than differently.
 * It is not exported from http.ts, and exporting it to share four lines would
 * widen that module's surface for one caller.
 */
async function asApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { code?: string; title?: string };

    if (typeof body?.code === "string") {
      return new ApiError(response.status, body.code, body.title ?? `HTTP ${response.status}`);
    }
  } catch {
    // An HTML 502 from the shared host, or an empty body. Falls through.
  }

  return new ApiError(response.status, "unknown_error", `HTTP ${response.status}`);
}

/** The filename out of a `Content-Disposition`, or null when there is none. */
function filenameOf(response: Response): string | null {
  const disposition = response.headers.get("Content-Disposition");

  if (disposition === null) {
    return null;
  }

  // Only the plain `filename="…"` form: this API sends nothing else, and a
  // half-implemented RFC 5987 parser for a header we control would be more
  // code than the case deserves.
  const match = /filename="([^"]+)"/.exec(disposition);

  return match?.[1] ?? null;
}
