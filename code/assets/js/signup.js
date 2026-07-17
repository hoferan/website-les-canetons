(function () {
  var MENUS = [
    ["meat", "Viande (standard)"],
    ["child", "Enfant"],
    ["vegetarian", "Végétarien"],
  ];
  var guests = document.getElementById("guests");
  var tally = document.getElementById("tally");
  var form = document.getElementById("signup-form");

  function makeRow() {
    var row = document.createElement("div");
    row.className = "guest-row";

    var num = document.createElement("span");
    num.className = "guest-num";

    var select = document.createElement("select");
    select.className = "guest-menu";
    MENUS.forEach(function (m) {
      var opt = document.createElement("option");
      opt.value = m[0];
      opt.textContent = m[1];
      select.appendChild(opt);
    });
    select.addEventListener("change", renumber);

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "guest-remove";
    remove.setAttribute("aria-label", "Retirer cette personne");
    remove.textContent = "✕";
    remove.addEventListener("click", function () {
      row.remove();
      renumber();
    });

    row.appendChild(num);
    row.appendChild(select);
    row.appendChild(remove);
    return row;
  }

  function renumber() {
    var rows = guests.querySelectorAll(".guest-row");
    var counts = { meat: 0, child: 0, vegetarian: 0 };
    rows.forEach(function (row, i) {
      row.querySelector(".guest-num").textContent = "Personne " + (i + 1);
      row.classList.toggle("solo", rows.length === 1);
      counts[row.querySelector(".guest-menu").value]++;
    });
    tally.textContent =
      rows.length +
      " personne(s) — Viande " +
      counts.meat +
      ", Enfant " +
      counts.child +
      ", Végétarien " +
      counts.vegetarian;
  }

  function addGuest() {
    guests.appendChild(makeRow());
    renumber();
  }

  document.getElementById("add-guest").addEventListener("click", addGuest);
  addGuest(); // start with one row

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var menus = [];
    guests.querySelectorAll(".guest-menu").forEach(function (s) {
      menus.push(s.value);
    });
    var payload = {
      first_name: form.first_name.value.trim(),
      last_name: form.last_name.value.trim(),
      address: form.address.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      table_name: form.table_name.value.trim(),
      menus: menus,
    };
    fetch("api/signups.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        if (!r.ok) {
          throw new Error("signup-failed");
        }
        window.location.href = "signup_thanks.php";
      })
      .catch(function () {
        alert("Échec de l'envoi du formulaire. Veuillez vérifier les champs et réessayer.");
      });
  });
})();
