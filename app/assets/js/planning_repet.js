// using session.js

const isAdmin = Session.canManageEvents();

// Charger les événements lors du chargement de la page
window.addEventListener("load", function () {
  // Charger les événements
  loadEvents();

  // Le formulaire n'existe dans le DOM que pour les admins (rendu côté serveur).
  var adminInterface = document.getElementById("admin-interface");
  if (isAdmin && adminInterface) {
    adminInterface.style.display = "block";
  }
});

// Fonction pour trier les événements par date
function sortEventsByDate(events) {
  return events.sort(function (a, b) {
    return new Date(a.date) - new Date(b.date);
  });
}

// Appends a <p><strong>label</strong> value</p> line, or just <p><strong>value</strong></p>
// when boldValue is true and there is no label. All text goes through textContent,
// never innerHTML, so event data from the API can never inject markup.
function appendInfoLine(container, label, value, boldValue) {
  var p = document.createElement("p");
  if (label) {
    var strongLabel = document.createElement("strong");
    strongLabel.textContent = label + " ";
    p.appendChild(strongLabel);
    p.appendChild(document.createTextNode(value));
  } else if (boldValue) {
    var strongValue = document.createElement("strong");
    strongValue.textContent = value;
    p.appendChild(strongValue);
  } else {
    p.textContent = value;
  }
  container.appendChild(p);
}

// Fonction pour charger les événements depuis le stockage et les afficher dans la liste
function loadEvents() {
  var eventsList = document.getElementById("events-list");

  // Effacer la liste actuelle
  eventsList.innerHTML = "";

  fetch("/api/events", {
    method: "GET",
  })
    .then((response) => response.json())
    .then((data) => {
      var storedEvents = data;

      // Trier les événements par date
      storedEvents = sortEventsByDate(storedEvents);

      // Parcourir les événements et les ajouter à la liste
      storedEvents.forEach(function (event, _) {
        var li = document.createElement("li");
        var eventDate = new Date(event.date);

        var endDate = new Date(eventDate);
        endDate.setDate(endDate.getDate() + 1);

        var eventInfo = document.createElement("div");
        var dateLine;
        if (event.weekend) {
          dateLine = formatDateRangeText(eventDate, endDate);
        } else {
          dateLine = formatDate(eventDate);
        }

        appendInfoLine(eventInfo, null, dateLine, true);
        appendInfoLine(eventInfo, "Titre :", event.title);
        appendInfoLine(eventInfo, "Heure de début :", event.startTime.slice(0, 5));
        appendInfoLine(eventInfo, "Heure de fin :", event.endTime.slice(0, 5));
        appendInfoLine(eventInfo, "Lieu :", event.location);
        if (event.attire) {
          appendInfoLine(eventInfo, "Tenue :", event.attire);
        }

        li.appendChild(eventInfo);

        if (isAdmin) {
          li.appendChild(createDeleteElement(event));
          li.appendChild(createEditElement(event));
        }

        eventsList.appendChild(li);
      });
    })
    .catch((error) => {
      console.error("Erreur lors de l'ajout de l'événement : ", error);
    });
}

// Gérer la soumission du formulaire
// Le formulaire n'existe dans le DOM que pour les admins (rendu côté serveur).
var eventForm = document.getElementById("event-form");
if (eventForm) {
  eventForm.addEventListener("submit", function (e) {
    e.preventDefault();

    // Récupérer les valeurs du formulaire
    var eventId = document.getElementById("event-id").value;

    // Créer un objet pour l'événement
    var newEvent = {
      id: eventId,
      date: document.getElementById("event-date").value,
      title: document.getElementById("event-title").value,
      startTime: document.getElementById("event-time-start").value,
      endTime: document.getElementById("event-time-end").value,
      location: document.getElementById("event-location").value,
      attire: document.getElementById("event-attire").value,
      weekend: document.getElementById("event-weekend").checked,
    };

    clearFormError();

    // Guard against double-click / slow-network double submit: disable the
    // button for the duration of the request and always re-enable it in
    // .finally() so a legitimate retry isn't left permanently blocked.
    var submitButton = eventForm.querySelector('input[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
    }

    // POST creates, PUT updates an existing event (eventId present).
    saveEvent(eventId ? "PUT" : "POST", newEvent)
      .then(function () {
        displayResult(newEvent); // API returns {ok:true}; show what we saved
        eventForm.reset(); // Effacer les champs du formulaire
        loadEvents();
      })
      .catch(function (error) {
        // Keep the form values intact so the user can correct and resubmit.
        showFormError(error.message || "L'enregistrement a échoué. Veuillez réessayer.");
        // Only log genuinely unexpected failures (network error, invalid JSON,
        // server 5xx) — a handled validation error is normal flow, not noise.
        if (!error.handled) {
          console.error("Erreur lors de l'enregistrement de l'événement : ", error);
        }
      })
      .finally(function () {
        if (submitButton) {
          submitButton.disabled = false;
        }
      });
  });
}

// Envoie l'événement au serveur (création ou modification) et rejette si la
// réponse n'est pas OK, pour que l'appelant sache distinguer succès et échec.
// fetch() does NOT reject on HTTP 4xx/5xx, so inspect response.ok explicitly —
// otherwise an error would fall into the success path and wrongly report
// success. Parse the JSON body regardless (it carries the server's error
// message on failure), then branch on response.ok.
function saveEvent(method, event) {
  return fetch("/api/events", {
    method: method,
    body: JSON.stringify(event),
    headers: {
      "Content-Type": "application/json",
    },
  }).then(function (response) {
    return response.json().then(function (body) {
      if (!response.ok) {
        // Expected, server-validated failure: surface the message to the
        // user but flag it as handled so it is not logged as a fault above.
        var message = (body && body.error) || "L'enregistrement a échoué. Veuillez réessayer.";
        var handled = new Error(message);
        handled.handled = true;
        throw handled;
      }
      return body;
    });
  });
}

// Show/clear a validation or network error above nothing destructive — the form
// keeps its values so the admin can fix the issue and resubmit.
function showFormError(message) {
  var el = document.getElementById("event-error");
  if (!el) {
    return;
  }
  el.textContent = message;
  el.style.display = "block";
}

function clearFormError() {
  var el = document.getElementById("event-error");
  if (!el) {
    return;
  }
  el.textContent = "";
  el.style.display = "none";
}

// Fonction pour afficher le résultat de l'ajout d'événement
function displayResult(event) {
  var eventResult = document.getElementById("event-result");
  eventResult.style.display = "block";

  var eventDate = new Date(event.date);
  var formattedDate = eventDate.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  document.getElementById("result-date").textContent = formattedDate;
  document.getElementById("result-title").textContent = event.title;
  document.getElementById("result-time-start").textContent = event.startTime.slice(0, 5);
  document.getElementById("result-time-end").textContent = event.endTime.slice(0, 5);
  document.getElementById("result-location").textContent = event.location;
  var resultAttireLabel = document.getElementById("result-attire-label");
  var resultAttire = document.getElementById("result-attire");
  if (event.attire) {
    resultAttireLabel.style.display = "inline";
    resultAttire.textContent = event.attire;
  } else {
    resultAttireLabel.style.display = "none";
    resultAttire.textContent = "";
  }

  // Affichage des dates pour le week-end
  var resultDatesLabel = document.getElementById("result-dates-label");
  var resultDates = document.getElementById("result-dates");
  if (event.weekend) {
    var endDate = new Date(eventDate);
    endDate.setDate(endDate.getDate() + 1);
    var formattedEndDate = endDate.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    resultDatesLabel.style.display = "inline";
    resultDates.textContent = formattedDate + " au " + formattedEndDate;
  } else {
    resultDatesLabel.style.display = "none";
    resultDates.textContent = "";
  }
}

// Fonction pour créer un élément de suppression
function createDeleteElement(event) {
  var deleteElement = document.createElement("span");
  deleteElement.classList.add("delete-event");
  deleteElement.classList.add("delete-icon");
  deleteElement.innerHTML = "&times;";
  deleteElement.addEventListener("click", function () {
    if (confirm("Êtes-vous sûr de vouloir supprimer cet événement?")) {
      fetch("/api/events?id=" + event.id, {
        method: "DELETE",
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error("Échec de la suppression (HTTP " + response.status + ")");
          }
          loadEvents();
        })
        .catch(function (error) {
          console.error("Failed to delete event: ", error);
          alert("La suppression de l'événement a échoué. Veuillez réessayer.");
        });
    }
  });

  return deleteElement;
}

// Fonction pour créer un élément de suppression
function createEditElement(event) {
  var editElement = document.createElement("span");
  editElement.classList.add("edit-event");
  editElement.classList.add("edit-icon");
  editElement.innerHTML = "&#x270E;";
  editElement.addEventListener("click", function () {
    document.getElementById("event-id").value = event.id;
    document.getElementById("event-date").value = event.date;
    document.getElementById("event-title").value = event.title;
    document.getElementById("event-time-start").value = event.startTime.slice(0, 5);
    document.getElementById("event-time-end").value = event.endTime.slice(0, 5);
    document.getElementById("event-location").value = event.location;
    document.getElementById("event-attire").value = event.attire;
    document.getElementById("event-weekend").checked = event.weekend;

    document.getElementById("event-form").scrollIntoView({
      behavior: "smooth",
      block: "start",
      inline: "start",
    });
  });

  return editElement;
}

// Fonction pour formater la date en "jour mois année"
function formatDate(date) {
  var options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return date.toLocaleDateString("fr-FR", options);
}

// Fonction pour formater la plage de dates en "du jour mois année au jour mois année"
function formatDateRangeText(startDate, endDate) {
  var options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  var formattedStartDate = startDate.toLocaleDateString("fr-FR", options);
  var formattedEndDate = endDate.toLocaleDateString("fr-FR", options);

  // Vérifiez si les dates sont de la même année
  if (startDate.getFullYear() === endDate.getFullYear()) {
    formattedStartDate = startDate.toLocaleDateString("fr-FR", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  return `du ${formattedStartDate} au ${formattedEndDate}`;
}
