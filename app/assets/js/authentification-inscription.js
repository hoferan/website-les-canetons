// using session.js
var urlParams = new URLSearchParams(window.location.search);
// returnTo is a same-origin route slug (see main.js). Resolve it against our own
// origin and keep only the path/query/hash of a same-origin result, so a crafted
// value can't turn the post-login redirect into an open redirect (//evil.com,
// /\evil.com) or a javascript: navigation. Anything else falls back to "/".
var returnToPage = "/";
var returnToRaw = urlParams.get("returnTo");
if (returnToRaw) {
  try {
    var returnToUrl = new URL(returnToRaw, window.location.origin);
    if (returnToUrl.origin === window.location.origin) {
      returnToPage = returnToUrl.pathname + returnToUrl.search + returnToUrl.hash;
    }
  } catch {
    // Malformed returnTo — keep the "/" default.
  }
}

document.getElementById("login-form").addEventListener("submit", function (event) {
  event.preventDefault();
  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;

  fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username, password: password }),
  })
    .then(function (response) {
      if (!response.ok) throw new Error("auth-failed");
      return response.json();
    })
    .then(function () {
      // The server now holds the session; the destination page reads the role
      // from it (window.__sessionRole). Full reload picks that up.
      window.location.href = returnToPage;
    })
    .catch(function () {
      alert("Nom d’utilisateur ou mot de passe incorrect");
    });
});
