// using session.js  (page access is enforced server-side: committee only)
document.addEventListener("DOMContentLoaded", function () {
  var urlParams = new URLSearchParams(window.location.search);
  var eventId = urlParams.get("id");

  var usersTableBody = document.getElementById("users-table-body");
  var instrumentTableBody = document.getElementById("instruments-table-body");
  var summaryContainer = document.getElementById("participation-summary");

  function renderSummary(rows) {
    var participate = rows.filter(function (r) { return r.response === "participate"; }).length;
    var notParticipate = rows.filter(function (r) { return r.response === "notparticipate"; }).length;
    var pending = rows.length - participate - notParticipate;
    var tiles = [
      { label: "Convoqués", value: rows.length, kind: "total" },
      { label: "Participe", value: participate, kind: "participate" },
      { label: "Ne participe pas", value: notParticipate, kind: "not-participate" },
      { label: "Pas de réponse", value: pending, kind: "no-response" },
    ];
    summaryContainer.innerHTML = "";
    tiles.forEach(function (tile) {
      var card = document.createElement("div");
      card.className = "summary-tile " + tile.kind;
      var value = document.createElement("span");
      value.className = "summary-value";
      value.textContent = tile.value;
      var label = document.createElement("span");
      label.className = "summary-label";
      label.textContent = tile.label;
      card.appendChild(value);
      card.appendChild(label);
      summaryContainer.appendChild(card);
    });
  }

  fetch("api/responses.php?eventId=" + encodeURIComponent(eventId), { method: "GET" })
    .then((response) => response.json())
    .then((data) => {
      const instrumentNames = ["Trompette", "Trombone", "Sousaphone", "Cloches", "Batterie", "Lyre", "Grosses-Caisse", "Maquillage"];
      const instrumentCounts = {};
      instrumentNames.sort().forEach((instrument) => {
        instrumentCounts[instrument] = data.filter((item) => item.response === "participate" && item.instrument === instrument).length;
      });

      for (const instrument in instrumentCounts) {
        if (instrumentCounts.hasOwnProperty(instrument)) {
          var row = document.createElement("tr");
          var instrumentCell = document.createElement("td");
          var countCell = document.createElement("td");

          instrumentCell.textContent = instrument;
          countCell.textContent = instrumentCounts[instrument];

          row.appendChild(instrumentCell);
          row.appendChild(countCell);
          instrumentTableBody.appendChild(row);
        }
      }

      //if data is array then foreach
      if (Array.isArray(data)) {
        renderSummary(data);
        data.forEach(function (item) {
          var row = document.createElement("tr");
          var usernameCell = document.createElement("td");
          var instrumentCell = document.createElement("td");
          var participationCell = document.createElement("td");

          usernameCell.textContent = item.username;
          instrumentCell.textContent = item.instrument;

          switch (item.response) {
            case "participate":
              row.classList.add("participate");
              participationCell.textContent = "Participe";
              break;
            case "notparticipate":
              row.classList.add("not-participate");
              participationCell.textContent = "Ne participe pas";
              break;
            default:
              row.classList.add("no-response");
              participationCell.textContent = "Pas de réponse";
              break;
          }

          row.appendChild(usernameCell);
          row.appendChild(instrumentCell);
          row.appendChild(participationCell);

          usersTableBody.appendChild(row);
        });
      }
    })
    .catch((error) => {
      console.error("Erreur lors du chargement du résumé : ", error);
      alert("Le résumé des inscriptions n'a pas pu être chargé!");
    });
});
