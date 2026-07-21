# Local Smoke Tests

Manual checks for the two changes on `claude/new-session-svinkj`:
**(1)** English API error wire format + frontend i18n, **(2)** the `$pageScripts`
DRY refactor. Focuses on the paths automated tests don't cover (browser display,
DB write paths, per-page script loading).

## 0. Setup

```bash
docker compose up -d --build     # site → http://localhost:8090, Adminer → http://localhost:8091
```

Seeded logins (password `demo` for all): `demo.admin`, `demo.moderator`, `demo.user`.

> **Run the `curl` commands in Git Bash**, not PowerShell/cmd — they use bash
> syntax (`$(...)`, brace expansion, cookie-jar files). In PowerShell the
> `BIG=$(printf 'a%.0s' {1..300})` string generator silently produces the wrong
> value, so an "oversized" field ends up short and the expected `too_long` error
> won't appear.

- [ ] `http://localhost:8090/` loads without errors.
- [ ] Open DevTools → Console + Network, keep them open for the browser checks below.

> The `/api/signups`, `/api/altcha`, and the supper popup only exist when the
> `souper_signup` feature flag is on in `app/config.php`. Skip those rows if it's off.

---

## 1. Script-tag refactor (regression — every page must still load its JS)

For each page below: open it, confirm **no 404s** in the Network tab for
`session.js`, `main.js`, `vendor/i18next.min.js`, `i18n.js`, or the page script,
and **no errors** in the Console.

- [ ] `/` (accueil) — common scripts only, no console errors.
- [ ] View source of `/` → the 4 shared `<script>` tags appear once, before `</body>`.
- [ ] `/planning_repet` (as `demo.admin`) — loads `planning_repet.js`; event form works.
- [ ] `/contact` — loads `contact.js`; submitting the form still redirects to `/confirmation`.
- [ ] `/authentification_inscription` — loads `authentification-inscription.js`; login works.
- [ ] `/sinscrire` (as `demo.user`) — loads `sinscrire.js`; event list + RSVP render.
- [ ] `/inscriptions_admin` (as `demo.admin`) — loads `inscriptions_admin.js`; summary renders.
- [ ] `/signup` + `/signups_admin` (if `souper_signup` on) — load their scripts, no console errors.
- [ ] Global: `window.i18next` and `translateApiError` are defined in the console on any page.

---

## 2. API error wire format (English `{error, code, fields?}`)

Use a cookie jar so authenticated calls reuse the session. Run from Git Bash.

**Login (presence + credentials):**
```bash
# empty body → validation_failed listing both fields
curl -s -i -X POST http://localhost:8090/api/login -H 'Content-Type: application/json' -d '{}'
```
- [ ] `400`, body `{"error":"Invalid form submission","code":"validation_failed","fields":[{"field":"username",...},{"field":"password",...}]}`

```bash
curl -s -i -X POST http://localhost:8090/api/login -H 'Content-Type: application/json' -d '{"username":"demo.user","password":"wrong"}'
```
- [ ] `401`, body `{"error":"Incorrect username or password","code":"invalid_credentials"}` — **no `fields` key**.

```bash
# log in as admin, save the session cookie for later steps
curl -s -i -c cookies-admin.txt -X POST http://localhost:8090/api/login -H 'Content-Type: application/json' -d '{"username":"demo.admin","password":"demo"}'
```
- [ ] `200`, body `{"role":"admin"}`.

**Auth guards:**
```bash
curl -s -i http://localhost:8090/api/responses?eventId=1          # no cookie
```
- [ ] `401`, `{"error":"Not authenticated","code":"not_authenticated"}`

```bash
# demo.user lacks manage_events
curl -s -i -c cookies-user.txt -X POST http://localhost:8090/api/login -H 'Content-Type: application/json' -d '{"username":"demo.user","password":"demo"}' >/dev/null
curl -s -i -b cookies-user.txt -X POST http://localhost:8090/api/events -H 'Content-Type: application/json' -d '{}'
```
- [ ] `403`, `{"error":"Access denied","code":"access_denied"}`

**Events (admin cookie):**
```bash
curl -s -i -b cookies-admin.txt -X POST http://localhost:8090/api/events -H 'Content-Type: application/json' -d '{"attire":"x"}'
```
- [ ] `400`, `fields` lists `date`, `title`, `startTime`, `endTime`, `location` (all `required`).

```bash
BIG=$(printf 'a%.0s' {1..300}); echo "len=${#BIG}"   # must print len=300
BASE='"date":"2026-08-01","startTime":"10:00:00","endTime":"11:00:00","weekend":false'
# Over-255 in each varchar(255) field must be a clean 400 (NOT a PHP fatal / non-JSON):
for FIELD in title location attire; do
  echo "--- oversized $FIELD ---"
  curl -s -b cookies-admin.txt -X POST http://localhost:8090/api/events -H 'Content-Type: application/json' \
    -d "{$BASE,\"title\":\"x\",\"location\":\"x\",\"attire\":\"x\",\"$FIELD\":\"$BIG\"}"; echo
done
```
- [ ] Each returns `400`, `fields:[{"field":"<field>","reason":"too_long","params":{"max":255}}]` — **all three JSON**, none an HTML error page.

```bash
curl -s -i -b cookies-admin.txt -X DELETE http://localhost:8090/api/events
```
- [ ] `400`, `fields:[{"field":"id","reason":"required"}]`

**Contact (public):**
```bash
curl -s -i -X POST http://localhost:8090/api/contact -d "email=not-an-email"
```
- [ ] `400`, `fields` lists `lastName`/`firstName`/`subject`/`message` (`required`) + `email` (`invalid_format`).

```bash
curl -s -i -X POST http://localhost:8090/api/contact \
  -d "lastName=Dupont&firstName=Jean&email=jean@example.com&subject=Bonjour&message=Test"
```
- [ ] `200`, `{"ok":true}` — and the row appears in Adminer (`contact_messages`, English columns).

**Responses (user cookie):**
```bash
curl -s -i -b cookies-user.txt -X POST http://localhost:8090/api/responses -H 'Content-Type: application/json' -d '{"eventId":1,"participation":"maybe"}'
```
- [ ] `400`, `fields:[{"field":"participation","reason":"invalid_value","params":{"allowed":["participate","notparticipate"]}}]`

```bash
curl -s -i -b cookies-user.txt -X POST http://localhost:8090/api/responses -H 'Content-Type: application/json' -d '{"eventId":999999,"participation":"participate"}'
```
- [ ] `404`, `{"error":"Event not found","code":"event_not_found"}` — no `fields`.

**Signups (only if `souper_signup` on):**
```bash
curl -s -i -X POST http://localhost:8090/api/signups -H 'Content-Type: application/json' -d '{"menus":"bad"}'
```
- [ ] `400`, every missing field listed + `{"field":"menus","reason":"invalid_value"}`.
- [ ] A submission that passes validation but fails the PoW gate → `403`, `{"error":"Anti-bot verification failed, please try again","code":"captcha_failed"}`.

Cleanup: `rm cookies-admin.txt cookies-user.txt`

---

## 3. Frontend i18n display — the one wired path (`/planning_repet`)

Log in as `demo.admin`, open `/planning_repet`.

- [ ] Submit the create-event form **completely empty** → red summary message in French
      ("Le formulaire contient des erreurs.") above the form.
- [ ] Every empty field gets a red outline (`.field-error`), including **Heure de début**
      and **Heure de fin** (the `event-time-start` / `event-time-end` mapping fix).
- [ ] Keyboard focus lands on the **Date** field (first invalid).
- [ ] Fill one field, resubmit → that field's red outline clears; the rest stay highlighted.
- [ ] Enter a value over 255 chars in **Titre**, **Lieu**, or **Tenue** → message reads
      "… maximum 255 caractères" (real number, not a raw `{{max}}` placeholder), the field is
      highlighted, and there is **no** `SyntaxError`/JSON.parse error in the console (the server
      returns a clean 400 JSON, not a PHP error page).
- [ ] Submit a fully valid event → success panel shows, form resets, list refreshes (happy path unchanged).
- [ ] Edit and delete an existing event still work (unchanged paths).

---

## 4. Un-wired forms still show their own French messages (no English leak)

These endpoints now return English on the wire, but their JS shows its own French
alert (they don't read `body.error`) — confirm the user still sees French:

- [ ] `/contact`: submit with a bad email → French alert "Échec de l'envoi du formulaire…", not English.
- [ ] `/authentification_inscription`: wrong password → French alert "Nom d'utilisateur ou mot de passe incorrect".
- [ ] `/signup` (if flag on): trigger a failure → French alert, not English.
