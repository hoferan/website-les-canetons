(function () {
  var KEY = "canetons_supper_popup_v1";
  if (localStorage.getItem(KEY)) {
    return;
  }
  var popup = document.getElementById("supper-popup");
  if (!popup) {
    return;
  }

  function dismiss() {
    localStorage.setItem(KEY, "1");
    popup.classList.remove("show");
  }

  popup.classList.add("show");
  popup.querySelector(".popup-close").addEventListener("click", dismiss);
  popup.querySelector(".popup-dismiss").addEventListener("click", dismiss);
  popup.querySelector(".popup-cta").addEventListener("click", dismiss);
  popup.addEventListener("click", function (e) {
    if (e.target === popup) {
      dismiss();
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      dismiss();
    }
  });
})();
