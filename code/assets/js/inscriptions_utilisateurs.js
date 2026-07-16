// using session.js  (page access is enforced server-side)
document.addEventListener("DOMContentLoaded", function () {
  var participationSelect = document.getElementById("participant-participation");
  var submitButton = document.querySelector('button[type="submit"]');

  var urlParams = new URLSearchParams(window.location.search);
  var eventId = urlParams.get("id");
  document.getElementById("event-id").value = eventId;

  document.getElementById("event-registration-form").addEventListener("submit", function (event) {
    event.preventDefault();

    var participation = document.getElementById("participant-participation").value;
    participationSelect.disabled = true;
    submitButton.disabled = true;

    // The server records the response for the logged-in user (username from session).
    fetch("api/responses.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: eventId, participation: participation }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error("save-failed");
        alert("Votre choix pour cet événement a été enregistré avec succès!");
        window.location.href = "sinscrire.php";
      })
      .catch(function (error) {
        participationSelect.disabled = false;
        submitButton.disabled = false;
        alert("Votre choix pour cet événement n'a pas pu être enregistré!");
        console.error("Erreur lors de l'enregistrement de la réponse : ", error);
      });
  });
});
