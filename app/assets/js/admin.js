import { apiFetch } from "./api.js";

// Called from the inline onsubmit="logoutUser()" handler in admin.php.
function logoutUser() {
  apiFetch("/api/logout", { method: "POST" }).finally(function () {
    window.location.href = "/";
  });
}
window.logoutUser = logoutUser;
