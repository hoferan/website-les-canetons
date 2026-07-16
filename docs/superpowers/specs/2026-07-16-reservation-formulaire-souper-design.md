# Design: Formulaire de réservation publique (Souper – 25 ans des Canetons)

- **Date:** 2026-07-16
- **Statut:** Design validé (en attente de revue de la spec)
- **Langue du produit:** Français (UI + colonnes DB), aligné sur le reste du site.

## 1. Contexte & objectif

La Guggenmusik organise un **Souper** unique : sortie du nouveau costume et **25e
anniversaire des Canetons**. C'est un **remerciement destiné aux amis et à la famille**
de la Guggenmusik — ce n'est **pas** un événement pour les membres eux-mêmes, et c'est
donc totalement distinct du système d'inscription/présence des membres
(`events` / `responses`, `sinscrire.php`, `inscriptions_*`).

Objectif : une page publique (sans login) où une personne peut réserver pour
**plusieurs convives** en un seul formulaire, en choisissant **un menu par personne**
et en indiquant une **table** (nom de famille ou nom de table) permettant à plusieurs
réservations distinctes de se regrouper à la même table. La Team Direction (admin)
consulte les réservations et surtout les **totaux** utiles au traiteur et au plan de table.

L'anlass est **unique**, mais la mise en œuvre reste **réutilisable** pour de futurs
anlässe grâce à une colonne discriminante `event_key`.

## 2. Décisions clés (issues du brainstorming)

| Sujet | Décision |
|---|---|
| Accès | Public, sans login (comme `contact.php`). |
| Modèle de données | **Une seule table** `reservations`. Les convives/menus sont stockés comme **liste de menus** dans une colonne. |
| Réutilisation | Colonne `event_key` (discriminant) ; titre/description par clé dans une constante PHP. Pas de table d'événements, pas de CRUD admin d'événements. |
| Champs par personne | Le **nom des convives n'importe pas** — seul le **menu par personne** compte. |
| Contact | `nom` + `prenom` **conservés** = adresse de contact de la personne qui réserve (nécessaire pour les questions de suivi), avec `address` et `phone`. |
| Table (Tisch) | Champ texte libre, **partagé** au niveau de la réservation. Suggestions des tables existantes via `<datalist>`. |
| Menu | 3 choix fixes : `viande` (standard), `enfant`, `vegetarien`. |
| Confirmation | Enregistrement en DB + page de remerciement dédiée. **Aucun e-mail.** |
| Navigation | **Pas** d'entrée de menu. Un renvoi depuis la page d'accueil (`index.php`). |
| Popup | Modale affichée **une seule fois par navigateur** (localStorage) au premier chargement de n'importe quelle page, renvoyant vers le formulaire. |
| Admin | Consultation des réservations + **totaux** (menus, tables, personnes) + **export CSV**. |
| Hors périmètre (YAGNI) | Délai d'inscription, capacité max, e-mails, édition par l'utilisateur, paiement, multi-événements dans l'UI. |

## 3. Modèle de données

Une seule table, compatible MariaDB 10.3, ajoutée à
`docker/db/init/01-schema.sql` (dev) **et** fournie comme migration pour la prod.

```sql
CREATE TABLE `reservations` (
  `id`         int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_key`  varchar(64)  NOT NULL DEFAULT 'souper-25ans', -- discriminant réutilisable
  `nom`        varchar(255) NOT NULL,   -- contact : nom
  `prenom`     varchar(255) NOT NULL,   -- contact : prénom
  `address`    varchar(255) NOT NULL,   -- contact : adresse
  `phone`      varchar(64)  NOT NULL,   -- contact : téléphone (pour questions de suivi)
  `table_name` varchar(255) NOT NULL,   -- nom de table / nom de famille (regroupement)
  `menus`      text NOT NULL,           -- liste JSON, ex. ["viande","viande","enfant"]
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_reservations_event` (`event_key`),
  KEY `idx_reservations_table` (`event_key`,`table_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Notes :
- **Nombre de personnes d'une réservation** = longueur de la liste `menus`.
- `menus` contient uniquement des valeurs de l'ensemble `{viande, enfant, vegetarien}`
  (validé côté serveur avant écriture). Stocké en JSON texte ; les agrégats sont
  calculés **en PHP** (volumétrie faible), donc aucune fonction JSON SQL requise —
  portable MariaDB 10.3.
- On stocke la donnée brute et on échappe **à l'affichage** (même règle que `contact.php`).

### Constante des anlässe (PHP)

Petit tableau associatif (dans le repository ou un fichier de config léger) mappant
`event_key` → libellés, pour piloter titre/description sans table dédiée :

```php
const RESERVATION_EVENTS = [
    'souper-25ans' => [
        'title'       => 'Souper – 25 ans des Canetons',
        'subtitle'    => 'Sortie du nouveau costume',
        'description' => "Un grand merci à nos amis et à nos familles : ...",
    ],
];
```

Le formulaire et la page admin utilisent une `event_key` active (constante
`ACTIVE_EVENT_KEY = 'souper-25ans'`).

## 4. Composants

### 4.1 Formulaire public — `code/reservation.php`
- Pas de login. Rend le titre/description de l'anlass actif.
- **Bloc contact** (une fois) : Nom, Prénom, Adresse, Téléphone.
- **Table** : `<input list="tables">` + `<datalist id="tables">` rempli côté serveur via
  `SELECT DISTINCT table_name FROM reservations WHERE event_key = ? ORDER BY table_name`.
- **Convives** : lignes dynamiques « + Ajouter une personne », chaque ligne = un
  `<select>` de menu (Viande / Enfant / Végétarien). Minimum 1 ligne. Suppression de
  ligne possible. JS vanilla (buildless), un fichier `assets/js/reservation.js`.
- Soumission via `fetch` POST → `api/reservations.php`, puis redirection vers
  `reservation_merci.php` (schéma identique au handler de `contact.php`).
- CSS dédié : `assets/css/reservation.css`.

### 4.2 Page de remerciement — `code/reservation_merci.php`
- Page statique « Merci pour votre réservation ! » **sans** promesse d'e-mail
  (ne pas réutiliser `confirmation.php`, qui annonce un e-mail).

### 4.3 API — `code/api/reservations.php`
- `POST` (public) : lit les champs, valide, écrit **une** ligne.
  - Validation : `nom`, `prenom`, `address`, `phone`, `table_name` non vides ;
    `menus` = tableau de 1..N valeurs ∈ `{viande, enfant, vegetarien}`
    (N borné, p.ex. ≤ 30, pour éviter les abus) ; `event_key` fixé côté serveur
    (non piloté par le client au-delà d'une valeur autorisée).
  - Requête préparée `mysqli`, `menus` encodé en JSON. Réponses JSON `{ok:true}` / erreurs
    `400`/`405` comme les endpoints existants.
- `GET` (guard `Auth::requireCanViewSummary`) : renvoie les données agrégées + la liste
  pour l'admin (JSON).
- `GET ?format=csv` (guard `view_summary`) : renvoie un CSV (`Content-Type: text/csv`,
  `Content-Disposition: attachment`).

### 4.4 Repository — `code/src/repositories/ReservationRepository.php`
- Câblé via `require` dans `bootstrap.php` (pas d'autoloader).
- Méthodes :
  - `create(array $data): void` — insert (menus → JSON).
  - `distinctTables(string $eventKey): array` — pour le `<datalist>`.
  - `allForEvent(string $eventKey): array` — réservations décodées (menus → array).
  - `stats(string $eventKey): array` — agrégats calculés en PHP (voir §5).

### 4.5 Admin — `code/reservations_admin.php`
- Guard page : `Auth::requireLoginPage(...)` + `Auth::canViewSummary()` (comme
  `inscriptions_admin.php`).
- Affiche (via `assets/js/reservations_admin.js` consommant l'API `GET`) :
  - **Totaux menus** par type (Viande / Enfant / Végétarien).
  - **Nombre de tables** et **personnes par table**.
  - **Total personnes** (= total menus) et **total tables**.
  - Liste des réservations **groupées par table** (contact + détail des menus).
  - Bouton **Export CSV** (lien vers `api/reservations.php?format=csv`).
- CSS dédié : `assets/css/reservations_admin.css`.

### 4.6 Renvoi depuis l'accueil — `code/index.php`
- Ajout d'un encart/bouton « Souper 25 ans – Réservez votre place » pointant vers
  `reservation.php`. Pas d'entrée dans `partials/navigation.php`.

### 4.7 Popup site-wide (une fois par navigateur)
- Snippet HTML + JS partagé, inclus globalement (via `partials/footer.php` pour être
  présent sur toutes les pages).
- Au chargement : si `localStorage.getItem('canetons_souper_popup_v1')` est absent,
  afficher la modale (titre de l'anlass + bouton « Réserver » → `reservation.php` +
  fermeture). À la fermeture **ou** au clic, poser le flag → plus jamais réaffichée
  sur ce navigateur.
- Accessible : fermable au clavier (Échap), focus piégé basique, `aria-modal`.
- Fichiers : `assets/js/souper-popup.js` + styles (dans `main.css` ou un petit
  `souper-popup.css`).

## 5. Calcul des statistiques (PHP)

À partir de `allForEvent(eventKey)` (chaque réservation a `menus` = array) :

- `menuTotals` : compte par type sur l'ensemble des `menus` aplatis.
- `totalPersons` = somme des longueurs de `menus` = somme de `menuTotals`.
- `tables` : regroupement par `table_name` → pour chaque table, `personCount`
  (somme des menus des réservations de cette table) et détail par menu.
- `totalTables` = nombre de tables distinctes.

## 6. Flux de données

**Réservation (public)**
```
reservation.php (form) --fetch POST--> api/reservations.php
  -> validation -> ReservationRepository::create (menus JSON)
  -> {ok:true} -> redirection reservation_merci.php
```

**Consultation (admin)**
```
reservations_admin.php --fetch GET--> api/reservations.php (guard view_summary)
  -> ReservationRepository::allForEvent + stats -> JSON -> rendu tableaux
Export: lien api/reservations.php?format=csv -> CSV téléchargé
```

**Popup** : footer global -> souper-popup.js -> localStorage (1×/navigateur).

## 7. Gestion des erreurs

- API `POST` invalide → `400` + `{error:...}` ; mauvaise méthode → `405`.
- Front : en cas d'échec `fetch`, `alert(...)` + maintien des données saisies
  (même comportement que `contact.php`).
- Admin non autorisé → `403` (page) / guard API `view_summary`.
- Écriture DB en requête préparée ; `menus` toujours re-validé serveur avant insert.

## 8. Tests / vérification

- `npm run check` (php -l, phpcs PSR-12, eslint, stylelint, prettier, secret-guard) vert.
- Manuel (Docker) :
  1. Soumettre une réservation à 3 convives (menus mixtes) → ligne créée, `menus` JSON correct, redirection merci.
  2. Deuxième réservation même `table_name` → suggestion `<datalist>` propose la table ; admin regroupe les deux.
  3. Admin : totaux menus/tables/personnes cohérents avec les données saisies ; export CSV ouvrable dans Excel.
  4. Popup : apparaît une fois, ne réapparaît plus après fermeture (localStorage) ; testé sur ≥ 2 pages.
  5. Validation : soumission sans convive / menu invalide → `400`.

## 9. Fichiers touchés / créés

**Créés**
- `code/reservation.php`
- `code/reservation_merci.php`
- `code/reservations_admin.php`
- `code/api/reservations.php`
- `code/src/repositories/ReservationRepository.php`
- `code/assets/js/reservation.js`
- `code/assets/js/reservations_admin.js`
- `code/assets/js/souper-popup.js`
- `code/assets/css/reservation.css`
- `code/assets/css/reservations_admin.css`
- migration SQL prod pour la table `reservations`

**Modifiés**
- `docker/db/init/01-schema.sql` (table `reservations`)
- `code/src/bootstrap.php` (require du nouveau repository)
- `code/index.php` (encart de renvoi)
- `code/partials/footer.php` (inclusion du snippet popup)
- `code/assets/css/main.css` (styles popup, si non externalisés)

## 10. Hors périmètre (rappel)

Délai/clôture des inscriptions, capacité maximale, e-mails (au réservant ou à l'admin),
compte/édition par l'utilisateur, paiement, gestion multi-événements via UI admin
(la réutilisation passe uniquement par `event_key` + constante PHP).
