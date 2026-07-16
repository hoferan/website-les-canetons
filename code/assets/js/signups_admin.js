// using session.js  (page access is enforced server-side: admin only)
document.addEventListener("DOMContentLoaded", function () {
  fetch("api/signups.php", { method: "GET" })
    .then(function (r) {
      if (!r.ok) {
        throw new Error("load-failed");
      }
      return r.json();
    })
    .then(render)
    .catch(function () {
      document.getElementById("admin-title").textContent = "Erreur de chargement des inscriptions";
    });
});

function tile(label, value, cls) {
  var d = document.createElement("div");
  d.className = "tile" + (cls ? " " + cls : "");
  var k = document.createElement("div");
  k.className = "tile-k";
  k.textContent = label;
  var v = document.createElement("div");
  v.className = "tile-v";
  v.textContent = value;
  d.appendChild(k);
  d.appendChild(v);
  return d;
}

function numCell(value, isTotal) {
  var td = document.createElement("td");
  td.className = "num" + (isTotal ? " total" : "");
  if (value === 0) {
    td.classList.add("zero");
    td.textContent = "–";
  } else {
    td.textContent = value;
  }
  return td;
}

function contactCell(signup) {
  var td = document.createElement("td");
  var strong = document.createElement("strong");
  strong.textContent = signup.first_name + " " + signup.last_name;
  var sub = document.createElement("div");
  sub.className = "contact-sub";
  sub.textContent = signup.address;
  td.appendChild(strong);
  td.appendChild(sub);
  return td;
}

function menuRow(cells) {
  var tr = document.createElement("tr");
  cells.forEach(function (c) {
    tr.appendChild(c);
  });
  return tr;
}

function textCell(text) {
  var td = document.createElement("td");
  td.textContent = text;
  return td;
}

function render(data) {
  document.getElementById("admin-title").textContent = "Inscriptions — " + data.occasion.title;

  var tiles = document.getElementById("tiles");
  tiles.appendChild(tile("Total personnes", data.totalPersons, "accent"));
  tiles.appendChild(tile("Total tables", data.totalTables, "accent"));
  tiles.appendChild(tile("Viande", data.menuTotals.meat, "menu-meat"));
  tiles.appendChild(tile("Enfant", data.menuTotals.child, "menu-child"));
  tiles.appendChild(tile("Végétarien", data.menuTotals.vegetarian, "menu-veg"));

  var body = document.getElementById("signups-body");
  data.tables.forEach(function (t) {
    var group = menuRow([
      textCell(t.name),
      textCell(""),
      numCell(t.menuCounts.meat),
      numCell(t.menuCounts.child),
      numCell(t.menuCounts.vegetarian),
      numCell(t.personCount, true),
    ]);
    group.className = "group-row";
    body.appendChild(group);

    t.signups.forEach(function (s) {
      var row = menuRow([
        contactCell(s),
        textCell(s.phone),
        numCell(s.menuCounts.meat),
        numCell(s.menuCounts.child),
        numCell(s.menuCounts.vegetarian),
        numCell(s.personCount, true),
      ]);
      row.className = "signup-row";
      body.appendChild(row);
    });
  });

  var foot = menuRow([
    textCell("Total général"),
    textCell(""),
    numCell(data.menuTotals.meat),
    numCell(data.menuTotals.child),
    numCell(data.menuTotals.vegetarian),
    numCell(data.totalPersons, true),
  ]);
  foot.className = "group-row";
  document.getElementById("signups-foot").appendChild(foot);
}
