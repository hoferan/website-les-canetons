// main.js — nav + banner UI wiring.
// Auth is enforced server-side via the session cookie; everything here is
// UI-only. Requires session.js to be loaded before this file.

// Current page identifier (the route slug), used for returnTo links.
var currentPage = window.location.pathname.split("/").pop();

document.addEventListener("DOMContentLoaded", function () {
  setupNavToggle();
  setupNavAuth();
  setupLoginBtn();
});

// Mobile hamburger toggle. The nav markup is server-rendered, so it exists at
// parse time (no fetch to wait for).
function setupNavToggle() {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".nav");
  if (!toggle || !nav) {
    return;
  }
  toggle.addEventListener("click", function () {
    var isOpen = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
}

// In-menu login/logout link (#nav-auth-link). Uses the UI-only role hint to
// decide the label; the server is the real source of truth.
function setupNavAuth() {
  wireAuthControl(document.getElementById("nav-auth-link"));
}

// Desktop banner login/logout button (#login-btn). Same behavior as the nav link.
function setupLoginBtn() {
  wireAuthControl(document.getElementById("login-btn"));
}

function wireAuthControl(el) {
  if (!el || typeof Session === "undefined") {
    return;
  }
  if (Session.uiRole()) {
    el.textContent = "Déconnexion";
    el.addEventListener("click", function (e) {
      e.preventDefault();
      fetch("/api/logout", { method: "POST" }).finally(function () {
        window.location.href = "/";
      });
    });
  } else {
    el.textContent = "Connexion";
    el.addEventListener("click", function (e) {
      e.preventDefault();
      window.location.href = "/authentification_inscription?returnTo=" + currentPage;
    });
  }
}
