(function () {
  var SESSION_KEY = "canetons_supper_popup_session";
  var OPTOUT_KEY = "canetons_supper_popup_optout";

  // Permanent opt-out (localStorage) or already seen this session -> stay hidden.
  if (localStorage.getItem(OPTOUT_KEY) || sessionStorage.getItem(SESSION_KEY)) {
    return;
  }
  var popup = document.getElementById("supper-popup");
  if (!popup) {
    return;
  }

  function closeForSession() {
    sessionStorage.setItem(SESSION_KEY, "1");
    popup.classList.remove("show");
  }

  function optOutForever() {
    localStorage.setItem(OPTOUT_KEY, "1");
    popup.classList.remove("show");
  }

  popup.classList.add("show");
  popup.querySelector(".popup-close").addEventListener("click", closeForSession);
  popup.querySelector(".popup-cta").addEventListener("click", closeForSession);
  popup.querySelector(".popup-dismiss").addEventListener("click", optOutForever);
  popup.addEventListener("click", function (e) {
    if (e.target === popup) {
      closeForSession();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeForSession();
    }
  });
})();
