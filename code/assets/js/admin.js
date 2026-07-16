/* exported logoutUser */
// Called from the inline onsubmit="logoutUser()" handler in admin.php.
function logoutUser() {
  fetch("api/logout.php", { method: "POST" }).finally(function () {
    window.location.href = "index.php";
  });
}
