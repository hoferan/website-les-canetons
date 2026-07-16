# Comité & Team Direction Page Refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken contact data on the Comité page and replace the single-column member stack with a responsive card grid plus a warm "duck" accent, without a full makeover.

**Architecture:** Edit two files in place — the page markup (`comite_teamdirection.php`) and its page stylesheet (`comite_teamdirection.css`). No JavaScript, no PHP logic, no new dependencies. Layout uses CSS Grid `auto-fit` so it reflows 3 → 2 → 1 columns with no media query.

**Tech Stack:** PHP 8.1 (buildless, no framework), vanilla CSS (no build step, no preprocessor). Dev checks run through Dockerized tooling via `npm` wrappers.

## Global Constraints

- **Buildless** — edit CSS/JS in place; no bundler, framework, or runtime dependency. (from spec)
- **CSS in browser-compatible notation** — no CSS nesting, no modern color functions (`oklch`, etc.); CSS custom properties are permitted. (from spec + repo commit `95c4897`)
- **Match production** — PHP 8.1; no PHP behavior change on this page. (from spec)
- **Contact rule** — `comite@lescanetons.org` is the ONLY valid email; every personal `@lescanetons.org` address must be removed. Céline Cuennet's phone `079 322 12 57` (`tel:+41793221257`) is real and stays. (from spec)
- **Preserve exactly** — all committee roles and names, and all three photos with their `alt` text. (from spec)
- **Never commit** `code/config.php` or production data. (from CLAUDE.md)

**Reference spec:** `docs/superpowers/specs/2026-07-16-comite-teamdirection-refresh-design.md`

---

### Task 1: Restructure the page markup

Remove the dead personal emails, promote the single working email into a contact block, and lay the eight members out as `.member-card` articles inside a `.committee-grid`. Keep the three photo sections. This task delivers correct, lint-clean markup; the grid is styled in Task 2.

**Files:**
- Modify (full rewrite): `code/comite_teamdirection.php`

**Interfaces:**
- Consumes: `partials/head.php`, `partials/banner.php`, `partials/navigation.php`, `partials/footer.php` (unchanged); page stylesheet `assets/css/comite_teamdirection.css` (restyled in Task 2).
- Produces: CSS hooks that Task 2 styles — `.committee-photo`, `.contact-block`, `.committee-grid`, `.member-card`, `.member-role`, `.member-name`, `.member-phone`. Retains `.personne-section`, `.musical-directors`, `.sponsors`.

- [ ] **Step 1: Rewrite `code/comite_teamdirection.php` with the new markup**

```php
<?php $pageTitle = 'Comité et team direction';
$pageCss = 'comite_teamdirection.css';
require 'partials/head.php'; ?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>

<section class="personne-section">
  <h2>Le comité</h2>
  <div class="committee-photo">
    <img src="assets/img/comite.jpg" alt="Le comité" />
  </div>

  <div class="contact-block">
    <h3>Contact des Canetons</h3>
    <p><a href="mailto:comite@lescanetons.org">comite@lescanetons.org</a></p>
  </div>

  <div class="committee-grid">
    <article class="member-card">
      <p class="member-role">Présidente</p>
      <p class="member-name">Delphine Maillard</p>
    </article>

    <article class="member-card">
      <p class="member-role">Vice-présidente - secrétaire</p>
      <p class="member-name">Amanda Portmann</p>
    </article>

    <article class="member-card">
      <p class="member-role">Responsable prestations</p>
      <p class="member-name">Céline Cuennet</p>
      <p class="member-phone"><a href="tel:+41793221257">079 322 12 57</a></p>
    </article>

    <article class="member-card">
      <p class="member-role">Responsable caisse</p>
      <p class="member-name">Marc Rossier</p>
    </article>

    <article class="member-card">
      <p class="member-role">Responsable intendance</p>
      <p class="member-name">Tiago Garces Cardoso</p>
    </article>

    <article class="member-card">
      <p class="member-role">Responsable costumes</p>
      <p class="member-name">Martine Jutzet</p>
    </article>

    <article class="member-card">
      <p class="member-role">Responsable Team Direction</p>
      <p class="member-name">Laura Mantel</p>
    </article>

    <article class="member-card">
      <p class="member-role">Membre</p>
      <p class="member-name">Patrice Bersier</p>
    </article>
  </div>

  <h2>Direction musicale</h2>
  <div class="musical-directors">
    <img src="assets/img/directionmusicale.jpg" alt="La Direction musicale" />
    <p>Laura Mantel et Delphine Maillard</p>
  </div>

  <h2>Le parrain et la marraine</h2>
  <div class="sponsors">
    <img src="assets/img/parrainmarraine.jpg" alt="Le parrain et la marraine" />
    <p>Richard Hertig et Annick Bürgisser</p>
  </div>
</section>

<?php require 'partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify `comite@` is the only email left**

Run (from repo root):
```bash
grep -o '[a-z]*@lescanetons\.org' code/comite_teamdirection.php | sort -u
```
Expected output — exactly one line:
```
comite@lescanetons.org
```
If any other address (e.g. `delphine@lescanetons.org`) appears, remove it before continuing.

- [ ] **Step 3: Verify the eight roles/names and the phone are all present**

Run:
```bash
grep -c 'member-card' code/comite_teamdirection.php   # expected: 8
grep -c 'tel:+41793221257' code/comite_teamdirection.php   # expected: 1
```
Expected: `8` then `1`.

- [ ] **Step 4: Verify PHP lints clean**

Run (Docker must be running):
```bash
npm run lint:php
```
Expected: PASS — `No syntax errors detected` for the sweep, and phpcs reports no errors for `code/comite_teamdirection.php`. (This file is plain HTML+includes, so phpcs has nothing to flag.)

- [ ] **Step 5: Commit**

```bash
git add code/comite_teamdirection.php
git commit -m "feat(comite): rebuild page markup as card grid, drop dead emails"
```

---

### Task 2: Grid, card, and accent styles

Replace the page stylesheet: define the duck-accent tokens, style the contact block, build the responsive grid and member cards with a hover lift, and tidy the two remaining photo sections. This task delivers the visible refresh and is verified by lint + a manual visual check.

**Files:**
- Modify (full rewrite): `code/assets/css/comite_teamdirection.css`

**Interfaces:**
- Consumes: the CSS hooks produced by Task 1 (`.committee-photo`, `.contact-block`, `.committee-grid`, `.member-card`, `.member-role`, `.member-name`, `.member-phone`, `.musical-directors`, `.sponsors`, `.personne-section`), and `@import url("main.css")` for the shared shell.
- Produces: final rendered styling. Nothing downstream consumes it.

- [ ] **Step 1: Rewrite `code/assets/css/comite_teamdirection.css`**

```css
@import url("main.css");

:root {
  --accent: #f2b705;
  --accent-ink: #8a6100;
  --card-border: #e5e5e5;
}

.personne-section h2 {
  margin-top: 40px;
  margin-bottom: 20px;
  font-size: 30px;
  color: #000000f1;
  text-align: center;
}

.personne-section h2:first-child {
  margin-top: 0;
}

/* -- Le comité photo ----------------------------- */

.committee-photo {
  text-align: center;
  margin-bottom: 30px;
}

.committee-photo img {
  max-width: 700px;
  width: 100%;
  height: auto;
  border-radius: 10px;
}

/* -- Contact block ----------------------------- */

.contact-block {
  max-width: 420px;
  margin: 0 auto 40px;
  padding: 16px 24px;
  background-color: #fff;
  border: 1px solid var(--card-border);
  border-left: 4px solid var(--accent);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  text-align: center;
}

.contact-block h3 {
  margin-bottom: 8px;
  font-size: 18px;
  color: #222;
}

.contact-block a {
  font-size: 18px;
  color: var(--accent-ink);
  text-decoration: none;
}

.contact-block a:hover {
  text-decoration: underline;
}

/* -- Committee grid ----------------------------- */

.committee-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.member-card {
  padding: 20px 16px;
  background-color: #fff;
  border: 1px solid var(--card-border);
  border-top: 3px solid transparent;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  text-align: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-top-color 0.2s ease;
}

.member-card:hover {
  transform: translateY(-3px);
  border-top-color: var(--accent);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
}

.member-role {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--accent-ink);
}

.member-name {
  margin-bottom: 6px;
  font-size: 19px;
  font-weight: bold;
  color: #222;
}

.member-phone a {
  font-size: 16px;
  color: #555;
  text-decoration: none;
}

.member-phone a:hover {
  text-decoration: underline;
}

/* -- Photo sections (direction musicale, parrain/marraine) ----- */

.musical-directors,
.sponsors {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  text-align: center;
}

.musical-directors img,
.sponsors img {
  max-width: 700px;
  width: 100%;
  height: auto;
  border-radius: 10px;
}

.musical-directors p,
.sponsors p {
  font-size: 20px;
  color: #555;
}
```

- [ ] **Step 2: Auto-format, then run all checks**

Run (from repo root, Docker running):
```bash
npm run fix
npm run check
```
Expected: `npm run fix` may reformat whitespace (e.g. wrap the `transition` value) — that is fine. `npm run check` then exits `0` with Stylelint, Prettier, ESLint, secret-guard, and `php -l` all passing. If Stylelint flags a rule, fix it in the CSS and re-run `npm run check` until green.

- [ ] **Step 3: Manual visual check in Docker**

Run:
```bash
docker compose up -d --build
```
Open `http://localhost:8090/comite_teamdirection.php` and confirm:
- The eight member cards render in a grid (~3 columns at desktop width).
- Narrowing the browser reflows the grid to 2 then 1 column with no horizontal scroll.
- Hovering a card lifts it and shows the duck-yellow top border.
- The contact block shows `comite@lescanetons.org` with an accent left-border; clicking it opens a `mailto:`.
- Céline's card shows her phone; clicking it triggers a `tel:` link.
- No personal `@lescanetons.org` email is visible anywhere on the page.
- Both photo sections (Direction musicale, Parrain & marraine) render with rounded images.

- [ ] **Step 4: Commit**

```bash
git add code/assets/css/comite_teamdirection.css
git commit -m "feat(comite): responsive card grid styling with duck accent"
```

---

## Self-Review

**1. Spec coverage:**
- Remove 8 dead emails → Task 1 Step 1 + Step 2 grep gate. ✓
- Keep `comite@lescanetons.org` as prominent contact block → Task 1 markup, Task 2 `.contact-block` styling. ✓
- Keep Céline's phone → Task 1 Step 1 + Step 3 grep gate. ✓
- Preserve all roles/names → Task 1 markup (all 8 present). ✓
- Responsive card grid, 3→2→1, no JS → Task 2 `.committee-grid` `auto-fit`. ✓
- Cards + hover lift + accent → Task 2 `.member-card` / `:hover`. ✓
- Duck accent split into `--accent` (decorative) + `--accent-ink` (text, AA) → Task 2 `:root`. ✓
- Photo sections kept/restyled → Task 1 markup + Task 2 `.musical-directors`/`.sponsors`. ✓
- Buildless, browser-compatible CSS, no PHP logic change → Global Constraints + no JS/PHP edits. ✓
- Testing (npm run check, visual, grep) → Task 1 Steps 2–4, Task 2 Steps 2–3. ✓

**2. Placeholder scan:** No TBD/TODO; all code shown in full; all commands have expected output. ✓

**3. Type consistency:** CSS class names used in Task 2 (`.committee-photo`, `.contact-block`, `.committee-grid`, `.member-card`, `.member-role`, `.member-name`, `.member-phone`) all match the markup produced in Task 1. ✓
