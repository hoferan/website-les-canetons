// using session.js
var urlParams = new URLSearchParams(window.location.search);
var returnToPage = urlParams.get("returnTo");
returnToPage = returnToPage ? returnToPage + ".php" : "index.php";

document.getElementById("login-form").addEventListener("submit", function (event) {
  event.preventDefault();
  var username = document.getElementById("username").value;
  var password = document.getElementById("password").value;

  fetch("api/login.php", {
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
