import { ApiError } from "./http";

/**
 * The one place this app fetches an API endpoint without the generated client.
 *
 * `customFetch`, the mutator, ends with `await response.json()`, and three of
 * the guest list formats (XLSX, a semicolon-separated CSV, a Markdown table)
 * are not JSON. So `registrationExport` compiles and throws on them.
 *
 * The rule against calling `fetch("/api/…")` by hand is about writes, which
 * need the replayed `X-XSRF-TOKEN` or answer 419. This is a GET and needs only
 * `credentials` for the session cookie.
 *
 * A plain `<a download>` cannot read a status: a server without ext-zip would
 * save its 503 problem document as a file named souper-inscriptions.xlsx.
 * Fetching lets `xlsx_unavailable` be shown in the UI's language.
 */
const API_BASE = "/api/v1";

/** The formats `GET /events/{event}/registrations.{format}` serves. */
export type ExportFormat = "xlsx" | "csv" | "md" | "json";

/**
 * Downloads one file and hands it to the browser, or throws an `ApiError`.
 *
 * The filename comes from the server's `Content-Disposition`, which carries
 * the event's name; `fallback` covers a proxy that strips the header.
 */
export async function downloadGuestList(
  eventId: number,
  format: ExportFormat,
  fallback: string,
): Promise<void> {
  const response = await fetch(`${API_BASE}/events/${eventId}/registrations.${format}`, {
    method: "GET",
    credentials: "include",
    // Not `application/json`: three of the four formats are not JSON.
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
    // Revoking in the same task as the click races Safari's read of the URL.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * The refusal, in the shape the French layer translates.
 *
 * A failure is still a problem document; only the success bodies are binary.
 * This repeats `toApiError` rather than exporting it from http.ts for one
 * caller.
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

  // Only the plain `filename="…"` form, the one this API sends; no RFC 5987.
  const match = /filename="([^"]+)"/.exec(disposition);

  return match?.[1] ?? null;
}
