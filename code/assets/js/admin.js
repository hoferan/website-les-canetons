function logoutUser() {
  fetch("api/logout.php", { method: "POST" }).finally(function () {
    window.location.href = "index.php";
  });
}
