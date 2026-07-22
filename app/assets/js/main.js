// main.js — nav + banner UI wiring.
// Auth is enforced server-side via the session cookie; everything here is
// UI-only.
import { createIcons } from "lucide";
import { icons } from "./icons.js";
import { Session } from "./session.js";

// Current page identifier (the route slug), used for returnTo links.
var currentPage = window.location.pathname.split("/").pop();

// Formats a Date as French text ("22 août 2026" by default). Pass options to
// override toLocaleDateString's format, e.g. { weekday: "long", ...defaults }.
export function formatFrenchDate(date, options) {
  var defaults = { day: "numeric", month: "long", year: "numeric" };
  return date.toLocaleDateString("fr-FR", options || defaults);
}

document.addEventListener("DOMContentLoaded", function () {
  setupNavToggle();
  setupNavAuth();
  setupLoginBtn();
  createIcons({ icons });
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
  if (!el) {
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
