import { createIcons } from "lucide";
import { icons } from "./icons.js";
import { translateApiError } from "./i18n.js";
import { formatFrenchDate } from "./main.js";
import { Session } from "./session.js";

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

      // main.js's DOMContentLoaded-time lucide.createIcons() call only ever
      // sees the page's initial markup. The delete/edit <i data-lucide>
      // placeholders above are created fresh every time loadEvents() runs
      // (first load, and again after every create/edit/delete), so each
      // run needs its own conversion pass to turn them into <svg>.
      createIcons({ icons });
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
        var translated = error.body
          ? translateApiError(error.body)
          : { message: "L'enregistrement a échoué. Veuillez réessayer.", fields: [] };
        showFormError(translated.message, translated.fields);
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
// code/fields on failure), then branch on response.ok.
function saveEvent(method, event) {
  return fetch("/api/events", {
    method: method,
    body: JSON.stringify(event),
    headers: {
      "Content-Type": "application/json",
    },
  }).then(function (response) {
    // Read the body as text and parse defensively: an unexpected server error
    // (e.g. a PHP fatal or a maintenance page) can return non-JSON even with a
    // JSON content-type, and response.json() would throw an opaque SyntaxError.
    return response.text().then(function (text) {
      var body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      if (!response.ok || body === null) {
        // Failure. When we have a parsed JSON body, carry it through so the
        // caller can translate/highlight fields, and flag it handled so it is
        // not logged as a fault. A non-JSON body is genuinely unexpected —
        // leave it unhandled so it is logged, and let the caller fall back to
        // a generic message.
        var handled = new Error((body && body.error) || "save-failed");
        handled.handled = body !== null;
        handled.body = body;
        throw handled;
      }
      return body;
    });
  });
}

// Maps an API validation field name (fields[].field) to its form input id.
// The ids don't uniformly follow `event-<field>` — startTime/endTime map to
// event-time-start/event-time-end — so the mapping is explicit.
var EVENT_FIELD_INPUT_IDS = {
  date: "event-date",
  title: "event-title",
  startTime: "event-time-start",
  endTime: "event-time-end",
  location: "event-location",
  attire: "event-attire",
};

// Show a validation or network error above the form (keeps the form's
// values intact so the admin can fix the issue and resubmit) and, when
// per-field detail is available, highlight each invalid field and focus
// the first one.
function showFormError(message, fields) {
  var el = document.getElementById("event-error");
  if (el) {
    el.textContent = message;
    el.style.display = "block";
  }

  var invalidFields = fields || [];
  var firstInput = null;
  invalidFields.forEach(function (entry) {
    var inputId = EVENT_FIELD_INPUT_IDS[entry.field];
    var input = inputId ? document.getElementById(inputId) : null;
    if (!input) {
      return;
    }
    input.classList.add("field-error");
    if (!firstInput) {
      firstInput = input;
    }
  });
  if (firstInput) {
    firstInput.focus();
  }
}

function clearFormError() {
  var el = document.getElementById("event-error");
  if (el) {
    el.textContent = "";
    el.style.display = "none";
  }
  Object.keys(EVENT_FIELD_INPUT_IDS).forEach(function (field) {
    var input = document.getElementById(EVENT_FIELD_INPUT_IDS[field]);
    if (input) {
      input.classList.remove("field-error");
    }
  });
}

// Fonction pour afficher le résultat de l'ajout d'événement
function displayResult(event) {
  var eventResult = document.getElementById("event-result");
  eventResult.style.display = "block";

  var eventDate = new Date(event.date);
  var formattedDate = formatFrenchDate(eventDate);

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
    var formattedEndDate = formatFrenchDate(endDate);
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
  deleteElement.innerHTML = '<i data-lucide="trash-2" class="icon-md icon-block"></i>';
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
  editElement.innerHTML = '<i data-lucide="pencil" class="icon-md icon-block"></i>';
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
  return formatFrenchDate(date, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Fonction pour formater la plage de dates en "du jour mois année au jour mois année"
function formatDateRangeText(startDate, endDate) {
  var formattedStartDate = formatFrenchDate(startDate, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  var formattedEndDate = formatFrenchDate(endDate, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Vérifiez si les dates sont de la même année
  if (startDate.getFullYear() === endDate.getFullYear()) {
    formattedStartDate = formatFrenchDate(startDate, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  return `du ${formattedStartDate} au ${formattedEndDate}`;
}
