// The contact endpoint returns JSON; submit via fetch and redirect to the
// confirmation page on success (a small handler).
document.getElementById("contact-form").addEventListener("submit", function (e) {
  e.preventDefault();
  fetch("/api/contact", { method: "POST", body: new FormData(this) })
    .then(function (r) {
      if (!r.ok) throw new Error("contact-failed");
      window.location.href = "/confirmation";
    })
    .catch(function () {
      alert("Échec de l’envoi du formulaire. Veuillez réessayer.");
    });
});
