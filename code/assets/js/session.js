// UI-only helper. NOT a source of truth for authentication — the server
// enforces auth via the session cookie and injects the authenticated role as
// window.__sessionRole on every page (see partials/head.php). The UI reads that
// server value, so it can never disagree with the real session (e.g. a fresh
// tab no longer shows a "logged out" UI while the server session is still alive).
// The capability map mirrors Auth::CAPABILITIES in src/Auth.php.
const Session = (function () {
  var CAPABILITIES = {
    user: ["respond"],
    moderator: ["respond"],
    admin: ["manage_events", "view_summary"],
  };
  function role() {
    return (typeof window !== "undefined" && window.__sessionRole) || null;
  }
  function can(capability) {
    var caps = CAPABILITIES[role()] || [];
    return caps.indexOf(capability) !== -1;
  }
  return {
    uiRole: role,
    canManageEvents: function () { return can("manage_events"); },
    canViewSummary: function () { return can("view_summary"); },
    canRespond: function () { return can("respond"); },
  };
})();
