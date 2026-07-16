// using session.js

const isAdmin = Session.canManageEvents();

// Charger les événements lors du chargement de la page
window.addEventListener("load", function () {
  // Charger les événements
  loadEvents();

  // Afficher le formulaire de l'administrateur si isAdmin est vrai
  if (isAdmin) {
    document.getElementById("admin-interface").style.display = "block";
  }
});

// Fonction pour trier les événements par date
function sortEventsByDate(events) {
  return events.sort(function (a, b) {
    return new Date(a.date) - new Date(b.date);
  });
}

// Fonction pour charger les événements depuis le stockage et les afficher dans la liste
function loadEvents() {
  var eventsList = document.getElementById("events-list");

  // Effacer la liste actuelle
  eventsList.innerHTML = "";

  fetch("api/events.php", {
    method: "GET",
  })
    .then((response) => response.json())
    .then((data) => {
      storedEvents = data;

      // Trier les événements par date
      storedEvents = sortEventsByDate(storedEvents);

      // Parcourir les événements et les ajouter à la liste
      storedEvents.forEach(function (event, _) {
        var li = document.createElement("li");
        var eventDate = new Date(event.date);
        var eventTitle = event.title;
        var eventStartTime = event.startTime;
        var eventEndTime = event.endTime;
        var eventLocation = event.location;
        var eventAttire = event.attire;

        var eventInfo = document.createElement("div");
        var eventDateText = formatDate(eventDate);

        // Dans la fonction loadEvents()
        var endDate = new Date(eventDate);
        endDate.setDate(endDate.getDate() + 1);
        var formattedEndDate = formatDate(endDate);

        var dateRangeText = eventDateText;
        if (event.weekend) {
          dateRangeText += ` au ${formattedEndDate}`;
        }

        // Vérifier si l'événement est un week-end
        if (event.weekend) {
          var endDate = new Date(eventDate);
          endDate.setDate(endDate.getDate() + 1);
          var formattedEndDate = formatDate(endDate);

          var formattedDateRangeText = formatDateRangeText(eventDate, endDate);

          eventInfo.innerHTML = `
            <p><strong>${formattedDateRangeText}</strong></p>
            <p><strong>Titre :</strong> ${eventTitle}</p>
            <p><strong>Heure de début :</strong> ${eventStartTime.slice(
              0,
              5
            )}</p>
            <p><strong>Heure de fin :</strong> ${eventEndTime.slice(0, 5)}</p>
            <p><strong>Lieu :</strong> ${eventLocation}</p>
        ${eventAttire ? `<p><strong>Tenue :</strong> ${eventAttire}</p>` : ""}`;
        } else {
          eventInfo.innerHTML = `
            <p><strong>${dateRangeText}</strong></p>
            <p><strong>Titre :</strong> ${eventTitle}</p>
            <p><strong>Heure de début :</strong> ${eventStartTime.slice(
              0,
              5
            )}</p>
            <p><strong>Heure de fin :</strong> ${eventEndTime.slice(0, 5)}</p>
            <p><strong>Lieu :</strong> ${eventLocation}</p>
        ${eventAttire ? `<p><strong>Tenue :</strong> ${eventAttire}</p>` : ""}`;
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
document.getElementById("event-form").addEventListener("submit", function (e) {
  e.preventDefault();

  // Récupérer les valeurs du formulaire
  var eventId = document.getElementById("event-id").value;
  var eventDate = document.getElementById("event-date").value;
  var eventTitle = document.getElementById("event-title").value;
  var eventStartTime = document.getElementById("event-time-start").value;
  var eventEndTime = document.getElementById("event-time-end").value;
  var eventLocation = document.getElementById("event-location").value;
  var eventAttire = document.getElementById("event-attire").value;
  var eventWeekend = document.getElementById("event-weekend").checked;

  // Créer un objet pour l'événement
  var newEvent = {
    id: eventId,
    date: eventDate,
    title: eventTitle,
    startTime: eventStartTime,
    endTime: eventEndTime,
    location: eventLocation,
    attire: eventAttire,
    weekend: eventWeekend,
  };

  if (eventId) {
    // Update event
    fetch("api/events.php", {
      method: "PUT",
      body: JSON.stringify(newEvent),
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((_) => {
        displayResult(newEvent); // API returns {ok:true}; show what we saved
        document.getElementById("event-form").reset(); // Effacer les champs du formulaire
        loadEvents();
      })
      .catch((error) => {
        console.error("Erreur lors de l'actualisation de l'événement: ", error);
      });
  } else {
    // Create new event
    fetch("api/events.php", {
      method: "POST",
      body: JSON.stringify(newEvent),
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((_) => {
        displayResult(newEvent); // API returns {ok:true}; show what we saved
        document.getElementById("event-form").reset(); // Effacer les champs du formulaire
        loadEvents();
      })
      .catch((error) => {
        console.error("Erreur lors de l'ajout de l'événement : ", error);
      });
  }
});

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
  document.getElementById("result-time-start").textContent =
    event.startTime.slice(0, 5);
  document.getElementById("result-time-end").textContent = event.endTime.slice(
    0,
    5
  );
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
      fetch("api/events.php?id=" + event.id, {
        method: "DELETE",
      })
        .then((_) => {
          loadEvents();
        })
        .catch((error) => {
          console.error("Failed to delete event: ", error);
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
  return `<strong>${date.toLocaleDateString("fr-FR", options)}</strong>`;
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
