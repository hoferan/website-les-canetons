// The one way this app talks to /api/* — do not call fetch("/api/…") directly.
//
// Why this exists: the API is Laravel with Sanctum's stateful SPA mode enabled
// (statefulApi() in api/bootstrap/app.php), which puts /api/* behind the web
// middleware group. Any same-origin request that looks like it came from a
// browser (it carries an Origin/Referer header) is therefore treated as a
// session request, and every mutating method on it is CSRF-validated. A bare
// fetch("/api/…", { method: "POST" }) carries no token and comes back
// 419 {"error":"Invalid session","code":"invalid_session"} — that hits the
// public contact and signup forms just as much as login. (Server-side curl
// checks sent no Origin header, so they were never stateful and never saw it.)
//
// Exempting /api/* from CSRF would fix that too, and was rejected on purpose:
// it would also strip the protection from the members'-area writes
// (/api/events, /api/responses). Priming the token on the client is the fix.
//
// So: apiFetch() primes Laravel's XSRF-TOKEN cookie once per page load and
// replays its value in the X-XSRF-TOKEN header, and no call site has to know
// any of the above.

// GET/HEAD are not CSRF-validated, so they must never trigger a prime — a page
// that only reads would otherwise fetch a cookie it has no use for.
var SAFE_METHODS = ["GET", "HEAD"];

// The in-flight prime, shared by every caller that arrives while it is running
// so concurrent first calls issue one /sanctum/csrf-cookie request between them
// instead of one each. Reset on failure so a later call can try again.
var priming = null;

function readXsrfCookie() {
  var match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  if (!match) {
    return null;
  }
  // Laravel writes the cookie URL-encoded (its base64 payload ends in "%3D"),
  // but compares the header against the decoded token — sending the raw cookie
  // value straight through is rejected exactly like sending none at all.
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function ensureCsrfToken() {
  var existing = readXsrfCookie();
  if (existing) {
    return Promise.resolve(existing);
  }

  if (!priming) {
    priming = fetch("/sanctum/csrf-cookie", {
      method: "GET",
      credentials: "same-origin",
    })
      .then(function () {
        return readXsrfCookie();
      })
      .catch(function () {
        return null;
      })
      .then(function (token) {
        if (!token) {
          priming = null;
        }
        return token;
      });
  }

  return priming;
}

// Drop-in replacement for fetch() against our own API: same arguments, same
// returned Promise<Response>, plus the CSRF handling above. Caller-supplied
// headers and options are preserved as given.
export function apiFetch(url, options) {
  var opts = Object.assign({}, options);
  var method = (opts.method || "GET").toUpperCase();
  if (!opts.credentials) {
    opts.credentials = "same-origin";
  }

  if (SAFE_METHODS.indexOf(method) !== -1) {
    return fetch(url, opts);
  }

  return ensureCsrfToken().then(function (token) {
    if (token) {
      // Headers() merges rather than replaces, so a call site's own
      // Content-Type/Accept survive. A FormData body still gets no explicit
      // Content-Type from us, so the browser keeps setting its own multipart
      // boundary.
      var headers = new Headers(opts.headers || {});
      headers.set("X-XSRF-TOKEN", token);
      opts.headers = headers;
    }
    // No token (the prime failed): send the request anyway and let the call
    // site's existing error handling report the resulting failure, rather than
    // inventing a new error shape here.
    return fetch(url, opts);
  });
}
