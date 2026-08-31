# Content audit — 2026-08-31

Sub-project **C** of
`docs/superpowers/specs/2026-08-31-post-cutover-ship-and-cleanup-design.md`.

Every public page, every outbound link, every factual claim. Links were probed
live; nothing here is inferred from the code alone, and **nothing factual is
invented** — where only the band knows the answer, this asks instead of guessing.

Three sections, in the order they should be acted on:

1. **Mechanical** — provably broken, fixable without your input. 9 items.
2. **Contradictions** — the site disagrees with itself. 2 items.
3. **Questions** — only you can answer. 14 items.

---

## 1. Mechanical — no input needed

### 1.1 Five sponsor links are broken

Probed live on 2026-08-31. Note the first one answers **HTTP 200** and is still
dead in every sense that matters — a naive link checker would pass it.

| Link | Status | Action |
| --- | --- | --- |
| `carnatchaux.ch` | 200, title **"Domain For Sale"** | Domain squatted. Remove, or replace if Carna'Tchaux has a new home. |
| `3canards.ch/portal/index.php` | **404** | Band site is alive at `https://3canards.ch/` — **just fix the path.** |
| `collaud-criblet.ch/home.php` | **404** | Site is alive at `https://www.collaud-criblet.ch/` (redirects to `/fr/`) — **fix the path.** |
| `lestricounis.ch` | **DNS ENOTFOUND** | Gone. `lestricounis.com` is a Wix "ConnectYourDomain Error", so no obvious successor. |
| `13carnavaleux.com` | **DNS ENOTFOUND** | Gone, no successor found. |

The seven others are fine: Bolzes, Estavayer, Romont, Brandons de Payerne,
Gouilles Agasses, Endiablés, Décapsuleuse.

### 1.2 Every surviving link supports HTTPS — the code comment is now out of date

`web/src/pages/Sponsors.tsx` carries this reasoning:

> The URLs are `http://` because that is what the old page had and what these
> sites answer on. Upgrading them here would be guessing on twelve third-party
> hosts we do not control.

That was a fair caution and it is now **empirically resolved**: every one of the
twelve that still responds serves HTTPS, and six already 301 `http` → `https`
themselves. Upgrading is no longer guessing. The comment should be replaced with
the measurement.

### 1.3 The Werkhof map link gives directions from a stranger's house

`web/src/pages/Commencement.tsx` links to:

```
https://www.google.com/maps/dir/46.8067938,7.1370156/Association+Werkhof+Fribourg,...
```

`dir/` is a **directions** URL and the origin is a **hardcoded coordinate pair**
(somewhere west of Fribourg). So every parent who clicks "Werkhof" gets a route
from a fixed point that has nothing to do with where they are.

Fix: either a place link, or `dir//<destination>` with an empty origin, which
makes Google use the visitor's own location.

### 1.4 The France 3 article link relies on a domain migration

`france3-regions.francetvinfo.fr` → now 301s to `france3-regions.franceinfo.fr`.
It works today. Update the href so the page does not depend on a redirect that
France Télévisions may eventually drop.

### 1.5 241 KB of images are shipped and never served

Neither is referenced anywhere in `web/`, `tools/`, `config/` or `docker/`:

| File | Size |
| --- | --- |
| `NEON_SPLATTER_8x8__white__copy.jpg` | 82 KB |
| `Imagefondclean.jpg` | 159 KB |

The splatter was the old site's background; the *Scène* design uses a solid
ground instead. Both are leftovers of the previous look, uploaded on every
deploy and requested by nobody.

### 1.6 Every referenced image exists

No broken images. All ten path-referenced files and the five register
photographs resolve. `directionmusicale.jpg` (598 KB) is the largest and is used
on **two** pages — see 3.14.

### 1.7 The contact address can receive mail

`lescanetons.org` has valid MX (`smtp01-in`/`smtp02-in.easy-hebergement.net`), so
`comite@lescanetons.org` is deliverable at the domain level. Whether anyone
**reads** that mailbox is question 3.13.

---

## 2. Contradictions — the site disagrees with itself

### 2.1 Who directs the band? Three pages, two answers

This is the most serious content problem on the site, and it is load-bearing:
it is the answer to "who do I talk to".

| Page | Says |
| --- | --- |
| `Historique.tsx` | Delphine Maillard and Laura Mantel directed **from 2019**, and "après sept années… elles passent à présent le flambeau" to **Lilou Keller and Anaïs Meuwly** |
| `ComiteTeamDirection.tsx` | Direction musicale: **Laura Mantel et Delphine Maillard** |
| `Canetons.tsx` | La Direction Musicale: **Laura et Delphine** |

Two further signals that Historique is the newer text:

- 2019 + seven years = **2026**, i.e. now. The handover sentence reads as current.
- **Lilou** appears in `Canetons.tsx` as a *cloche* player. If Lilou Keller is now
  co-director, that roster entry and the Direction Musicale entry both need moving.
- **Anaïs Meuwly appears nowhere else on the site** — not in the committee, not in
  any register roster.

Nothing here can be settled from the code. See question 3.1.

### 2.2 One name, two spellings

`Marc-Jérôme` in `Canetons.tsx` (grosses-caisses roster) versus `Marc-Jerome`
without the circumflex in `Moniteurs.tsx` (grosse caisse instructors). Same
person, presumably. Which spelling is right?

---

## 3. Questions — only the band can answer

### Direction and people

**3.1 Who is the current direction musicale?** If the handover in `Historique.tsx`
has happened, `ComiteTeamDirection.tsx` and `Canetons.tsx` are both wrong, the
`directionmusicale.jpg` photograph is of the outgoing pair, and Lilou Keller
needs moving out of the cloches roster.

**3.2 Is the committee list current?** Eight members, listed by office:
Delphine Maillard (Présidente), Amanda Portmann (Vice-présidente–secrétaire),
Céline Cuennet (Responsable prestations), Marc Rossier (caisse),
Tiago Garces Cardoso (intendance), Martine Jutzet (costumes),
Laura Mantel (Responsable Team Direction), Patrice Bersier (Membre).

**3.3 Are the parrain and marraine still Richard Hertig and Annick Bürgisser?**

**3.4 Are the register rosters current?** 28 first names across seven registers
in `Canetons.tsx`. A youth band turns over every year, and this is the page a
parent checks for their own child.

**3.5 Is the instructor list current?** 17 names across six registers in
`Moniteurs.tsx`.

### Phone numbers — three are published

**3.6 Are these still right, and still the right people to publish?**

| Number | Page | Attributed to |
| --- | --- | --- |
| 079 322 12 57 | `ComiteTeamDirection.tsx` | Céline Cuennet — booking the band |
| 075 417 71 91 | `Commencement.tsx` | Delphine Maillard — joining |
| 079 280 77 67 | `Commencement.tsx` | Laura Mantel — joining |

Note both *joining* contacts are the pair that `Historique.tsx` says have handed
over the direction. If that handover happened, should these change too?

### Stale pages

**3.7 The `/cd` page is dated 2022 and still written as news.** Its heading is
"2022 - Les Canetons ont 20 ans !!!", the subtitle is "Notre nouveau CD vient de
sortir !!", and the body says "N'hésitez pas à le commander au plus vite !!".
In 2026 that reads as an abandoned site. Also: the nav calls it "CD" while the
heading is about the anniversary. Is the CD still sold? At 20.– on CD and USB
key? If yes it needs rewriting as an evergreen page; if no it should go.

**3.8 `/multimedia` is a single reportage from 2016** — France 3 Alsace at the
Carnaval de Colmar, now ten years old. The embed still works. Is there anything
from the last decade to put there? The nav also has a separate "Galerie" link
going to Flickr, which is current and works.

**3.9 Is the recruitment flyer current?** `Flyer.jpeg` is shown and offered as a
download on `/commencement`. A flyer naming an old season would actively
mislead a parent.

**3.10 The photo under "Le comité" is stock ducklings, not the committee.** The
file is `comite.jpg` but the image is ducklings on a log. The alt text says what
is actually there rather than what the filename claims. Is there a real
committee photograph?

**3.11 The instructors' photo is missing more than half its subjects.**
`Moniteurs.tsx` lists nine people as absent from the picture — Cassandra,
Adeline, Fabio, Théo, Elodie, Baptiste, Nolan, Kevin, Marc-Jérome — out of
seventeen. Worth a new photo?

### Content that may be wrong rather than stale

**3.12 You recruit for two instruments the band does not appear to have.**
`Commencement.tsx` seeks Trompette, Trombone, **Sousaphone** and **Euphonium**.
But `Canetons.tsx` has no sousaphone or euphonium register, and `Moniteurs.tsx`
lists no instructor for either. Is that aspiration, or out of date?

**3.13 Does anyone read `comite@lescanetons.org`?** The domain accepts mail. It is
published on two pages and is the only address on the site.

**3.14 Redundancy — is any of this deliberate?**

- `directionmusicale.jpg` appears on **both** `/canetons` and
  `/comite_teamdirection`, with the same two names under it.
- The **lead paragraph of `/historique` is a near-duplicate of its own third
  paragraph** — both say the band began with a dozen musicians and quickly grew
  to forty children. The lead is also in all-caps in the source, accents
  stripped ("CREEE", "DEBUTANT"), inherited verbatim from the PHP page.
- Rehearsal time appears on `/commencement` ("Les samedis matin, de 10h à 12h")
  and again inside the `/historique` narrative ("le samedi matin").
- `comite@lescanetons.org` is on `/cd` and `/comite_teamdirection`.

---

## What is NOT in this audit

- **Events on `/planning_repet`** are database rows managed by the admin, not
  page copy. Whatever is on TEST is seed data.
- **The souper pages** are flag-gated and describe an event dated
  **13 November 2027**, which is in the future and consistent with an October
  2002 founding. Nothing stale there.
- **Typography, spacing and mobile layout** belong to sub-project E, deliberately
  after this one, so pages are not styled twice.
- **French copy quality** beyond factual accuracy. The site's inconsistencies in
  punctuation (`Nom:` versus `Nom :`) and title casing were reproduced from the
  old site on purpose and are an E question if they are anyone's question.

## How to answer

Answer by number. Anything you skip stays as it is — nothing in section 3 will
be changed on a guess. Sections 1 and 2 can proceed on your word alone, except
2.1 and 2.2, which need a fact only you have.
