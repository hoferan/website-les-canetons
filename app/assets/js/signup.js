(function () {
  var MENUS = [
    ["meat", "Viande (standard)"],
    ["child", "Enfant"],
    ["vegetarian", "Végétarien"],
  ];
  var guests = document.getElementById("guests");
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
  }

  function addGuest() {
    guests.appendChild(makeRow());
    renumber();
  }

  document.getElementById("add-guest").addEventListener("click", addGuest);
  addGuest(); // start with one row

  function toHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = "";
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
  }

  // Fetch a fresh challenge and brute-force the proof-of-work. Returns the
  // base64 solution payload, or null if it can't be solved.
  function solveAltcha() {
    return fetch("/api/altcha", { headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) {
          return null;
        }
        return r.json();
      })
      .then(function (ch) {
        if (
          !ch ||
          typeof ch.maxnumber !== "number" ||
          typeof ch.challenge !== "string" ||
          typeof ch.salt !== "string"
        ) {
          return null;
        }
        var enc = new TextEncoder();

        function tryNumber(n) {
          if (n > ch.maxnumber) {
            return null;
          }
          return crypto.subtle.digest("SHA-256", enc.encode(ch.salt + n)).then(function (digest) {
            if (toHex(digest) === ch.challenge) {
              return btoa(
                JSON.stringify({
                  algorithm: ch.algorithm,
                  challenge: ch.challenge,
                  number: n,
                  salt: ch.salt,
                  signature: ch.signature,
                }),
              );
            }
            return tryNumber(n + 1);
          });
        }

        return tryNumber(0);
      });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var menus = [];
    guests.querySelectorAll(".guest-menu").forEach(function (s) {
      menus.push(s.value);
    });

    var submitBtn = form.querySelector('button[type="submit"]');
    var submitLabel = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Vérification…";
    }

    function restoreButton() {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
      }
    }

    solveAltcha()
      .then(function (altcha) {
        if (!altcha) {
          throw new Error("altcha-failed");
        }
        var payload = {
          first_name: form.first_name.value.trim(),
          last_name: form.last_name.value.trim(),
          address: form.address.value.trim(),
          phone: form.phone.value.trim(),
          email: form.email.value.trim(),
          table_name: form.table_name.value.trim(),
          menus: menus,
          hp: form.website.value,
          altcha: altcha,
        };
        return fetch("/api/signups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      })
      .then(function (r) {
        if (!r.ok) {
          throw new Error("signup-failed");
        }
        window.location.href = "/signup_thanks";
      })
      .catch(function () {
        restoreButton();
        alert("Échec de l'envoi du formulaire. Veuillez vérifier les champs et réessayer.");
      });
  });
})();
