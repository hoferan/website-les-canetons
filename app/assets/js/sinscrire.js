import { Session } from "./session.js";
import { formatFrenchDate } from "./main.js";

// Page access is enforced server-side.
document.addEventListener("DOMContentLoaded", function () {
  fetch("/api/events", { method: "GET" })
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      parseEvents(data || []);
    })
    .catch(function (e) {
      console.error("Erreur chargement événements:", e);
    });
});

function parseEvents(data) {
  // Members and moderators attend events, so both record their own response.
  // Admin (Team Direction) manages events and sees the summary but does not respond.
  var canViewSummary = Session.canViewSummary(); // admin only
  var canRespond = Session.canRespond(); // user + moderator
  data.sort(function (a, b) {
    return new Date(a.date) - new Date(b.date);
  });
  var eventsList = document.getElementById("events-list");

  data.forEach(function (item) {
    var row = document.createElement("tr");
    var dateCell = document.createElement("td");
    var titleCell = document.createElement("td");
    var inscriptionCell = document.createElement("td");

    dateCell.textContent = formatFrenchDate(new Date(item.date));
    titleCell.textContent = item.title;

    if (canRespond) {
      var respondButton = document.createElement("button");
      if (item.response) {
        respondButton.textContent = "Choix enregistré";
        respondButton.disabled = true;
      } else {
        respondButton.textContent = "S'inscrire";
        respondButton.addEventListener("click", function () {
          window.location.href = "/inscriptions_utilisateurs?id=" + item.id;
        });
      }
      inscriptionCell.appendChild(respondButton);
    }

    if (canViewSummary) {
      var summaryButton = document.createElement("button");
      summaryButton.textContent = "Résumé";
      summaryButton.addEventListener("click", function () {
        window.location.href = "/inscriptions_admin?id=" + item.id;
      });
      inscriptionCell.appendChild(summaryButton);
    }

    row.appendChild(dateCell);
    row.appendChild(titleCell);
    row.appendChild(inscriptionCell);
    eventsList.appendChild(row);
  });
}
