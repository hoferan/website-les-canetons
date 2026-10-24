/**
 * The French catalogue, and the shape de.ts mirrors.
 *
 * Every key stays a bare identifier and this object stays free of
 * TypeScript-only syntax. `api/tests/Feature/ApiErrorVocabularyTest.php` finds
 * each section with a regex and brace-walks it, asserting that every `code`
 * and `fields[].reason` the API can emit has copy. A quoted key would hide a
 * token from that guard; TS syntax inside the literal could confuse the walk.
 */
export const fr = {
  /**
   * Seeded role names and help text, keyed by the role's `key`.
   *
   * A seeded role's name is system text a developer chose. A name the
   * committee typed arrives on the role itself and wins (roleName in
   * ./index.ts, ADR 0026); this covers the roles nobody has renamed.
   */
  roles: {
    direction: {
      label: "Team Direction",
      hint: "Organise les événements, gère les membres et voit les réponses.",
    },
    committee: {
      label: "Comité",
      hint: "Consulte la liste des inscriptions.",
    },
    member: {
      label: "Membre",
      hint: "Voit le planning et gère son propre mot de passe. Tous les comptes ont ce rôle.",
    },
    musician: {
      label: "Musicien·ne",
      hint: "Répond aux événements et compte parmi les personnes attendues.",
    },
  },

  /**
   * The permissions, by token with `_` for `.` (see permissionLabel), for the
   * role editor's checkboxes. Developer-defined like the token itself, so this
   * is catalogue copy rather than data, and PermissionCopyTest fails until
   * every case of App\Support\Permission has an entry in both files.
   */
  permissions: {
    events_manage: {
      label: "Gérer le planning",
      hint: "Crée, modifie, publie et supprime les événements.",
    },
    attendance_view_all: {
      label: "Voir les réponses",
      hint: "Voit qui vient à chaque événement et qui n’a pas encore répondu.",
    },
    attendance_record_for_others: {
      label: "Répondre pour quelqu’un",
      hint: "Enregistre la réponse d’un membre à sa place.",
    },
    members_manage: {
      label: "Gérer les membres",
      hint: "Ajoute et modifie les membres, leurs rôles et leurs mots de passe.",
    },
    registrations_view: {
      label: "Voir les inscriptions",
      hint: "Consulte la liste des personnes inscrites à un événement.",
    },
    registrations_manage: {
      label: "Gérer les inscriptions",
      hint: "Corrige ou annule l’inscription d’une personne.",
    },
    messages_view: {
      label: "Lire les messages",
      hint: "Lit les messages envoyés depuis le site.",
    },
    messages_manage: {
      label: "Traiter les messages",
      hint: "Marque les messages comme traités et les supprime.",
    },
    history_manage: {
      label: "Gérer l’historique",
      hint: "Ajoute, corrige et supprime les entrées de l’historique.",
    },
    images_manage: {
      label: "Gérer les photos",
      hint: "Ajoute et supprime des photos, et choisit celles du site.",
    },
    roles_manage: {
      label: "Gérer les rôles",
      hint: "Crée les rôles et choisit ce que chacun permet.",
    },
    events_view: {
      label: "Voir le planning",
      hint: "Consulte les événements à venir.",
    },
    attendance_respond: {
      label: "Répondre aux événements",
      hint: "Indique sa présence et compte parmi les personnes attendues.",
    },
    account_manage: {
      label: "Gérer son compte",
      hint: "Change son propre mot de passe.",
    },
  },

  errors: {
    // The sentence translateApiError falls back to when a code or reason has
    // no copy. Not an API token, so no server-side guard sees it, and
    // http.ts mints `unknown_error` client-side for any non-JSON error
    // response (a 502, TEST/QA's HTML Basic-Auth 401).
    generic: "Une erreur est survenue. Veuillez réessayer.",
    validation_failed: "Le formulaire contient des erreurs.",
    method_not_allowed: "Méthode non autorisée",
    not_authenticated: "Non authentifié",
    access_denied: "Accès refusé",
    invalid_credentials: "Nom d'utilisateur ou mot de passe incorrect",
    too_many_attempts: "Trop de tentatives. Veuillez réessayer plus tard.",
    reauth_failed:
      "Mot de passe incorrect. Cette action doit être confirmée par votre mot de passe.",
    cannot_delete_self: "Vous ne pouvez pas supprimer votre propre compte.",
    cannot_demote_self: "Vous ne pouvez pas retirer vos propres droits d'administration.",
    cannot_remove_last_administrator: "C'est la dernière personne pouvant administrer les membres.",
    cannot_remove_last_role_administrator: "C'est la dernière personne pouvant gérer les rôles.",
    baseline_role_is_fixed:
      "Le rôle « Membre » ne peut être ni retiré, ni modifié, ni supprimé. Tous les comptes le gardent.",
    // Says what to do without explaining the rule: a committee-issued
    // password was read out loud, so "changing" to the same one would leave
    // the account on a password somebody else has heard.
    password_unchanged: "Ce mot de passe est déjà le vôtre. Choisissez-en un autre.",

    invalid_session: "Session invalide",
    // A request that cannot open a session: unlike invalid_session, a retry
    // does not help.
    stateful_request_required: "Cette requête ne peut pas ouvrir de session.",
    rate_limited: "Trop de requêtes. Veuillez patienter avant de réessayer.",
    service_unavailable: "Service indisponible",

    // Idempotency. The first two are client bugs (a real form mints a key
    // when it renders and keeps it), so a member should never read them.
    idempotency_key_required: "Ce formulaire n'a pas pu être envoyé. Rechargez la page.",
    idempotency_key_invalid: "Ce formulaire n'a pas pu être envoyé. Rechargez la page.",
    // A double tap on Envoyer while the first attempt still runs, so it says
    // to wait.
    idempotency_key_reuse: "Envoi déjà en cours. Patientez quelques instants avant de réessayer.",

    // Conditional writes. `if_match_required` is a client bug, so it blames
    // nobody.
    if_match_required: "Cette modification n'a pas pu être vérifiée. Rechargez la page.",
    // Somebody else changed the same thing while the form was open. It says
    // what to do and does not offer to force the write.
    if_match_failed:
      "Quelqu'un a modifié cet élément entre-temps. Rechargez pour voir les changements, puis réessayez.",

    // Attendance. `not_answerable` refuses an answer entered for somebody who
    // is not asked to answer. The reader holds the right they used, so it
    // must not read like a missing one.
    not_answerable:
      "Aucune réponse n'est attendue de ce membre : on ne peut pas en saisir une à sa place.",
    cannot_record_for_self:
      "Pour vous-même, répondez depuis le planning : une réponse retirée demande une raison.",
    answer_already_settled: "Ce délai est passé. Modifiez votre réponse plutôt que de l'annuler.",
    // Registration. `spam_suspected` is vague on purpose: naming the failed
    // check tells a script how to pass, and a person only needs to retry.
    spam_suspected: "Envoi refusé. Rechargez la page et réessayez.",
    registration_not_open: "Les inscriptions ne sont pas encore ouvertes.",
    registration_closed: "Les inscriptions sont closes.",
    history_entry_empty: "Écrivez au moins un titre ou un texte, en français ou en allemand.",
    event_incomplete: "Complétez ou corrigez les champs avant de publier.",
    event_not_published: "Cet événement est encore un brouillon : il ne reçoit pas de réponses.",
    event_has_answers:
      "Des réponses ou des inscriptions existent déjà : l'événement ne peut plus repasser en brouillon.",
    option_has_registrations:
      "Impossible de supprimer une option déjà réservée. Annulez d'abord les inscriptions concernées.",
    option_shape_locked:
      "Quelqu'un a déjà répondu à ce bloc : son type et le fait qu'il compte des personnes ne peuvent plus changer. Ajoutez plutôt un nouveau bloc.",
    choice_answer_in_use:
      "Quelqu'un a choisi cette réponse : elle ne peut pas être supprimée. Vous pouvez la renommer.",
    xlsx_unavailable: "L'export Excel n'est pas disponible sur ce serveur. Utilisez le format CSV.",
    register_in_use:
      "Des membres jouent dans ce pupitre ou l'enseignent. Attribuez-leur d'abord un autre pupitre.",
    registers_changed:
      "Quelqu'un a ajouté ou supprimé un pupitre entre-temps. Rechargez la page, puis recommencez.",
    image_in_use:
      "Cette photo est encore affichée sur le site. Retirez-la d'abord des pages qui l'utilisent.",
    image_already_in_library:
      "Cette photo est déjà dans la photothèque. Utilisez celle qui s'y trouve, ou supprimez-la d'abord.",
    image_library_full:
      "La photothèque est pleine. Supprimez une photo qui n'est plus utilisée, puis réessayez.",
    image_storage_full:
      "Le serveur n'a plus de place pour cette photo. Supprimez des photos inutilisées ou prévenez l'administrateur.",
    not_found: "Introuvable",
  },
  validation: {
    // "obligatoire", not "requis": it agrees with a feminine label too,
    // where "requis" would give "Année est requis".
    required: "est obligatoire",
    too_long: "est trop long (maximum {{max}} caractères)",
    invalid_format: "n'est pas dans un format valide",
    invalid_type: "a un type invalide",
    invalid_value: "doit être l'une des valeurs suivantes : {{allowed}}",
    already_taken: "est déjà utilisé",
    too_short: "est trop court (minimum {{min}} caractères)",
    invalid_number: "n'est pas un nombre valide",
    // Specific to one field pair: it names the start because `after:startsAt`
    // on the event form is the only `after:` rule. The token carries no
    // parameters (App\Exceptions\ApiError's REASONS map says why), so a rule
    // on another pair needs its own token and copy.
    must_be_after: "doit être après le début",
    // No parameter: the per-booking cap comes from a closure validator, and
    // App\Exceptions\ApiError's closure-added branch emits `field` and
    // `reason` only, so a {{max}} would print as is.
    too_many_guests: "dépasse le nombre de personnes autorisé par inscription",
    // Against `choices`, when the blocks that count people add up to nobody.
    no_guests: "doit compter au moins une personne",
    // Against `choices.N.value`: an answer that block does not offer.
    not_an_answer: "n'est pas une réponse proposée",
    // Against `choices.N.quantity`, when an option's capacity has fewer
    // places left. No parameter, for the same reason as too_many_guests.
    not_enough_places: "dépasse les places encore libres",
    // Against `options.N.answers`, a choice with one answer.
    too_few_answers: "doit proposer au moins deux réponses",
    // The photo checks, on each size and on the set. No parameters, as with
    // too_many_guests. The browser shrinks and re-encodes a photo before
    // sending it, so only a failed or bypassed shrink reaches these.
    image_not_jpeg: "doit être une image JPEG",
    image_too_large: "est trop grand en pixels",
    image_too_heavy: "est trop lourd",
    image_has_metadata: "contient encore des métadonnées ou un commentaire",
    image_unexpected_data: "contient des données qu'une photo ne contient pas",
    image_trailing_data: "contient autre chose que l'image, ou est incomplet",
    image_set_too_many: "contient trop de tailles pour une seule photo",
    image_set_too_heavy: "est trop lourd dans son ensemble",
    image_set_widths_repeated: "contient deux fois la même taille",
    image_set_aspect_mismatch: "mélange des tailles qui n'ont pas les mêmes proportions",
  },
  fields: {
    date: "Date",
    title: "Titre",
    startsAt: "Début",
    endsAt: "Fin",
    startTime: "Heure de début",
    endTime: "Heure de fin",
    location: "Lieu",
    attire: "Tenue",
    weekend: "Week-end",
    isPublic: "Visible publiquement",
    notes: "Remarques",
    occurredOn: "Date",
    precision: "Précision de la date",
    titleFr: "Titre en français",
    bodyFr: "Texte en français",
    titleDe: "Titre en allemand",
    bodyDe: "Texte en allemand",
    labelFr: "Nom en français",
    labelDe: "Nom en allemand",
    colour: "Couleur",
    celebrate: "Confettis",
    tagIds: "Catégories",
    important: "Étape importante",
    icon: "Icône",
    files: "Fichier",
    // The library's label for a photo on /media, and a register's French name.
    name: "Nom",
    // A register's German name, on /registers.
    nameDe: "Nom en allemand",
    // The registers in their new order, on /registers.
    sectionIds: "Ordre des pupitres",
    // The photo a placement shows.
    imageId: "Photo",
    // The page a photo slot is on, sent with a placement.
    path: "Page",
    // The registration window on an event. Setting the close date is what
    // turns public registration on at all.
    registrationOpensAt: "Ouverture des inscriptions",
    registrationClosesAt: "Clôture des inscriptions",
    registrationMaxGuests: "Personnes par inscription",
    registrationEnabled: "Formulaire ouvert",
    registrationAsksAddress: "Demander l’adresse",
    registrationAsksTable: "Demander la table",
    // The six settings above, together, on the form editor's save.
    form: "Réglages du formulaire",
    sectionId: "Pupitre",
    committeeFunctionId: "Fonction au comité",
    instructorOfSectionId: "Moniteur du pupitre",
    publicVisible: "Visible publiquement",
    roleIds: "Rôles",
    permissions: "Droits",
    currentPassword: "Mot de passe actuel",
    newPassword: "Nouveau mot de passe",
    id: "Identifiant",
    lastName: "Nom",
    firstName: "Prénom",
    email: "E-mail",
    subject: "Sujet",
    message: "Message",
    handled: "Traité",
    paid: "Payé",
    first_name: "Prénom",
    last_name: "Nom",
    address: "Adresse",
    phone: "Téléphone",
    table_name: "Table",
    menus: "Menus",
    username: "Identifiant",
    password: "Mot de passe",
    eventId: "Événement",
    participation: "Participation",
    // POST /events/series: the dates a season is generated from, and the
    // event they share. `template`'s sub-fields need no entries, because
    // translateApiError falls back to the last segment; this one is for a
    // missing or malformed template.
    dates: "Dates",
    template: "Modèle",
    // Attendance. `note` carries the reason a member owes when they take
    // back a yes (ADR 0018).
    status: "Réponse",
    note: "Raison",
    // Registration. Nested paths resolve to their last segment:
    // `choices.0.optionId` to `optionId`, `options.2.priceCents` to
    // `priceCents`.
    tableName: "Table",
    choices: "Choix",
    optionId: "Option",
    quantity: "Quantité",
    options: "Options",
    label: "Intitulé",
    description: "Description",
    priceCents: "Prix",
    capacity: "Nombre de places",
    sortOrder: "Ordre",
    kind: "Type de bloc",
    required: "Obligatoire",
    countsGuests: "Compte comme personnes",
    answers: "Réponses",
    value: "Réponse",
  },

  /**
   * Chrome that belongs to no one screen, so a fix to a shared string is a
   * fix everywhere.
   *
   * `cancel` is the dialog's cancel and nothing else. French says "Annuler"
   * for closing a dialog and for undoing something done; German says
   * "Abbrechen" and "Rückgängig". The undo in a toast is `attendance.undo`,
   * and merging the two is a mistake invisible in French.
   */
  common: {
    loading: "Chargement…",
    // The key to the star beside a required label, rendered after the star:
    // "* champ obligatoire".
    requiredLegend: "champ obligatoire",
    backToPlanning: "← Retour au planning",
    cancel: "Annuler",
    save: "Enregistrer",
    busy: "En cours…",
    // The per-row actions on every list screen. The accessible name that says
    // which row is per screen; only the visible word is shared.
    edit: "Modifier",
    delete: "Supprimer",
    // "N personne(s)" on the public booking form and the committee's guest
    // list. events.meta.guests says the same words as a chip on an event card
    // and keeps its own key, so the two can diverge.
    guests_one: "{{count}} personne",
    guests_other: "{{count}} personnes",
    // The way out of a dead end, shared by NotFound and guards.tsx's
    // AccessDenied.
    backHome: "Retour à l’accueil",
    // SessionProvider's boot gate. It resolves before anything has rendered
    // because i18next is initialised at module scope (./index.ts).
    bootFailed: "Le site n’a pas pu démarrer. Veuillez réessayer dans quelques instants.",
    // ConfirmByTypingName's field. A whole sentence, guillemets included,
    // because punctuation differs per language.
    typeToConfirm: "Tapez «\u00a0{{phrase}}\u00a0» pour confirmer",
    // SearchField's clear button.
    clearSearch: "Effacer la recherche",
    // RowActions' trigger label. {{name}} is an event's title or a person's
    // name, depending on the screen.
    moreActionsAria: "Autres actions pour {{name}}",
    // FormField's reveal toggle on every password field. One fixed name, with
    // aria-pressed carrying the state: a toggle that renames itself announces
    // as a different control each time it is pressed.
    showPassword: "Afficher le mot de passe",
  },

  /**
   * The document itself: what the browser tab and a search result show,
   * applied by ./documentMeta.ts at boot.
   *
   * Both strings also exist in web/index.html, which ships them before any
   * JavaScript runs; this section corrects them for the German mount.
   * ./documentMeta.test.ts fails if the French values here and the shell's
   * drift. What is not corrected at runtime (og:*), and why, is in
   * web/index.html.
   */
  meta: {
    // Identical in both catalogues on purpose: "Les Canetons de Fribourg" is
    // the band's name, kept in German too ("Die Canetons", never "Die
    // Entlein"), and "Guggenmusik" is already German.
    title: "Guggenmusik Les Canetons de Fribourg",
    // This one translates; it is what a search result shows.
    description:
      "La guggenmusik des enfants de Fribourg, fondée en 2002. De 7 à 18 ans, sans savoir lire la musique — répétitions en général le samedi matin.",
  },

  /**
   * The chrome: the nav, its accessible names, and the footer.
   *
   * The nav arrays in Layout.tsx carry a `labelKey` into this section rather
   * than a label, since a module-level `label: t(...)` would be frozen in the
   * locale active at import (./index.ts).
   */
  nav: {
    primary: "Navigation principale",
    // The first thing a Tab reaches on every page, hidden until focused.
    skipToContent: "Aller au contenu",
    menu: "Menu",
    menuLabel: "Menu de navigation",
    join: "Nous rejoindre",
    agenda: "Où nous voir",
    band: "Les canetons",
    committee: "Comité",
    history: "Histoire",
    contact: "Contact",
    events: "Événements",
    members: "Membres",
    inbox: "Boîte de réception",
    eventTags: "Catégories",
    media: "Médias",
    registers: "Pupitres",
    roles: "Rôles",
    gallery: "Galerie",
    // The external links' whole names. Each says it opens a new tab and
    // begins with the words on screen, so voice control still finds it. The
    // networks' names are brands and stay untranslated.
    galleryLabel: "Galerie sur Flickr (nouvel onglet)",
    instagramLabel: "Instagram des Canetons (nouvel onglet)",
    facebookLabel: "Facebook des Canetons (nouvel onglet)",
    // The footer's Flickr link, which reads "Flickr" on screen.
    flickrLabel: "Flickr, la galerie des Canetons (nouvel onglet)",
    followUs: "Suivez-nous",
    footerPitch:
      "La guggen d’enfants de Fribourg, depuis 2002. De 7 à 18 ans, pas besoin de connaître la musique.",
    login: "Connexion",
    account: "Mon compte",
    // The desktop trigger shows only initials, so this is its whole name.
    accountMenu: "Compte de {{name}}",
    logout: "Déconnexion",
    // The desktop bar's overflow: the entries that do not fit fold in here.
    more: "Plus",
    // The ✕ of the phone menu's full-screen layer.
    close: "Fermer le menu",
    // The phone list's two headings, once somebody is logged in.
    groupMine: "Mon espace",
    groupBand: "Le groupe",
    // The accessible name of the FR / DE pair in the header.
    language: "Langue",
    // The inbox badge's accessible name. `n` rather than `count`: i18next
    // treats a `count` option as a plural selector and looks for
    // `pending_one` / `pending_other` first.
    pending: "{{n}} en attente",
    // The switcher's accessible names, the same in both catalogues: the
    // control names its target in the target's language, so somebody who
    // cannot read the current page recognises the way out.
    switchToGerman: "Auf Deutsch wechseln",
    switchToFrench: "Passer en français",
    rights: "Tous droits réservés.",
  },

  /**
   * The contact messages archive (/contact-messages).
   *
   * `countFiltered`, `handledBy` and `deleteConfirmDescription` carry
   * single-brace placeholders that ContactMessages.tsx fills in with a plain
   * string replace, not i18next interpolation.
   */
  contactMessages: {
    heading: "Messages",
    // A plural family, so each language applies its own rule to zero
    // ("0 message", "0 Nachrichten").
    word_one: "message",
    word_other: "messages",
    // Used once a filter other than "Tous" is active, so the heading's count
    // never claims more than the rows shown.
    countFiltered: "{visible} sur {total} {word}",
    filterAll: "Tous",
    filterOpen: "Ouverts",
    filterHandled: "Traités",
    openStatus: "Ouvert",
    handledStatus: "Traité",
    read: "Lire",
    close: "Fermer",
    // The switch in an opened message, saved as it is flipped. Off reopens it.
    handledSwitch: "Traité",
    delete: "Supprimer",
    deleteConfirmTitle: "Supprimer ce message ?",
    deleteConfirmDescription:
      "Le message de {name} sera définitivement supprimé. Cette action est irréversible.",
    handledBy: "Traité par {name}, le {date}",
    // The normal case, not an error: an empty inbox is good news.
    empty: "Aucun message pour l’instant. Le formulaire de contact est prêt à en recevoir.",
    emptyFiltered: "Aucun message ne correspond à ce filtre.",
    loadError: "La liste des messages n’a pas pu être chargée.",
    readError: "Ce message n’a pas pu être chargé. Rechargez la page.",
    // When a handle or delete fails without an API answer, e.g. a dropped connection.
    actionFailed: "L’action n’a pas pu être effectuée.",
  },

  /**
   * The inbox worklist (/inbox) and its nav badge.
   *
   * `kinds` maps the API's `kind` token to what a committee member reads;
   * never render the token. A new source adds a key here, not a branch in the
   * page.
   */
  inbox: {
    heading: "Boîte de réception",
    kinds: {
      contactMessage: "Message du site",
    },
    // The normal case: a cleared worklist, unlike contactMessages.empty, an
    // archive with nothing in it yet.
    empty: "Rien n’attend de réponse. La boîte de réception est à jour.",
    loadError: "La boîte de réception n’a pas pu être chargée.",
  },

  /**
   * Answering for an event, and chasing the people who have not.
   *
   * One section for two screens, two halves of one fact: a member answers
   * from the planning (AttendanceControls) and the committee reads and
   * corrects the answers on the chase list (EventAttendance).
   *
   * Grammar and punctuation composed in JSX cannot be translated, so:
   *
   * 1. The inline answers (`yesInline`, `noInline`) are their own strings.
   *    French lowercases "oui" mid-sentence; German keeps "Ja" as a value.
   *    A .toLowerCase() in a component would decide casing for every locale.
   *
   * 2. The guillemets around a reason are part of the string. French sets
   *    them with a space inside, « comme ça » ; Swiss Standard German sets
   *    them tight, «so».
   *
   * 3. Every space before a colon or a question mark is a no-break space
   *    (\u00a0), written as an escape because it is invisible in a diff. It is
   *    French typography and German takes none, which is why "Pupitre : {{x}}"
   *    is one string here and not a label plus ": " in the component.
   */
  attendance: {
    /**
     * The two answers, twice: as a button, and inside a sentence.
     *
     * See note 1 above: French differs between the two forms and German does
     * not.
     */
    answer: {
      yes: "Oui",
      no: "Non",
      yesInline: "oui",
      noInline: "non",
    },

    // The chase list, /events/:id/attendance.
    heading: "Qui vient\u00a0?",
    loadFailed: "La liste n’a pas pu être chargée.",
    counts: "{{yes}} oui · {{no}} non · {{silent}} sans réponse",
    silentHeading: "Sans réponse",
    answersHeading: "Réponses",
    sectionLabel: "Pupitre\u00a0: {{name}}",
    recordedByCommittee: "Saisie par le comité.",
    nobodyAnswerable:
      "Personne n’est encore inscrit dans un pupitre, donc personne n’a de réponse à donner.",
    // What the caller is told in place of buttons aimed at their own row,
    // which the on-behalf endpoint refuses (ADR 0018).
    answerFromPlanning: "Répondez depuis le planning.",
    editFromPlanning: "Modifiable depuis le planning.",
    comingAria: "{{name}} vient",
    notComingAria: "{{name}} ne vient pas",
    correct: "Corriger",
    correctFor: "Corriger la réponse de {{name}}",
    correctDescription:
      "Ce que {{name}} vous a dit. La raison est facultative, et la réponse restera marquée comme saisie par le comité.",
    recordFailed: "La réponse n’a pas pu être enregistrée.",
    // Whole sentences, one per answer (note 1), with note 3's space.
    recordedYes: "{{name}}\u00a0: oui.",
    recordedNo: "{{name}}\u00a0: non.",

    /**
     * One person's answer as one line, the reason travelling with the name.
     * {{note}} is what a member typed: content, rendered verbatim in both
     * locales; only the quotes around it change.
     */
    line: "{{name}} — {{answer}}",
    lineWithNote: "{{name}} — {{answer}} — «\u00a0{{note}}\u00a0»",
    lineSilent: "{{name}} — sans réponse",

    // AttendanceControls, on the planning: answering for oneself.
    yesComing: "Oui, je viens",
    // {{title}} is the event's own title, not translated. "Je viens" alone
    // would be the same accessible name on every card, so a mis-tap would
    // sound like the intended one.
    comingToAria: "Je viens à {{title}}",
    notComingToAria: "Je ne viens pas à {{title}}",
    answered: "Répondu",
    quotedNote: "«\u00a0{{note}}\u00a0»",
    byCommittee: "Réponse saisie par le comité.",
    ownRecordFailed: "Votre réponse n’a pas pu être enregistrée.",
    toastYes: "Vous venez — {{title}}.",
    toastNo: "Vous ne venez pas — {{title}}.",
    // Not common.cancel: this takes back a recorded answer. Both are
    // "Annuler" in French and two different words in German.
    undo: "Annuler",
    undoFailed: "L’annulation a échoué. Réessayez.",

    // WithdrawDialog, the one answer that is not a single tap (ADR 0018).
    reason: "Raison",
    withdrawTitle: "Vous ne venez plus à «\u00a0{{title}}\u00a0»\u00a0?",
    withdrawDescription:
      "Vous aviez annoncé votre présence. Dites au comité pourquoi vous ne venez plus, pour qu’il puisse s’organiser.",
    withdrawConfirm: "Je ne viens pas",
  },

  /**
   * The planning (/events), the members' area's front door.
   *
   * Plurals are `_one`/`_other` families, never `n === 1 ? a : b` in a
   * component, because the languages do not share a rule:
   *
   *   - French counts zero as singular, "0 réponse"; German does not,
   *     "0 Rückmeldungen" (`meta.answersAria`).
   *   - `owedCount` changes the verb in German, "Es fehlt" against "Es
   *     fehlen", which no suffix in a component could reach.
   *
   * i18next picks the form by the active language's CLDR rule; see
   * `Unplural` in ./index.ts for why `t()` takes only the bare key.
   *
   * Where zero says something else (`allAnswered`, `meta.noGuests`), it is a
   * separate key and the component branches on zero, which is not branching
   * on one.
   */
  events: {
    heading: "Planning",
    // A draft may have no date yet.
    dateMissing: "Date à fixer",
    // Drafts: written and editable, visible to the direction only.
    draftsHeading: "Brouillons",
    draftBadge: "Brouillon",
    publish: "Publier",
    publishAria: "Publier {{title}}",
    unpublish: "Repasser en brouillon",
    unpublishAria: "Repasser {{title}} en brouillon",
    publishFailed: "La publication a échoué.",
    add: "Ajouter un événement",
    addSeries: "Ajouter une série",
    // The trigger whose menu holds `add` and `addSeries`. One word, because at
    // 103px it fits beside the 170px heading and the full label at 175px does
    // not (the #182 phone budget). Its accessible name starts with this
    // visible word (WCAG 2.5.3).
    addTrigger: "Ajouter",
    addTriggerAria: "Ajouter au planning",
    // The two halves of the list as names, not instructions: a segment of a
    // two-option switch is labelled with what it shows (#182).
    viewPlanning: "Planning",
    viewPast: "Passés",
    // Required: Radix's type="single" renders role="radiogroup", which without
    // a name announces two radios belonging to nothing.
    viewSwitchAria: "Vue du planning",
    tagFilterAria: "Filtrer par catégorie",
    tagAll: "Tous",
    calendar: "Calendrier",
    list: "Liste",
    dayFiltered: "Filtré sur un jour.",
    showAll: "Voir tout le planning",
    loadFailed: "Le planning n’a pas pu être chargé.",
    empty: "Aucun événement au planning.",
    // A search that found nothing is not an empty planning, and must not
    // bring the committee's "add a series" hint with it.
    searchLabel: "Rechercher un événement",
    // The visible placeholder only, beside the switch on a phone.
    searchPlaceholder: "Rechercher",
    noMatch: "Aucun événement ne correspond à cette recherche.",
    noTagMatch: "Aucun événement dans cette catégorie.",
    emptyPast: "Aucun événement passé.",
    // {{action}} is another key's value: the hint quotes the button beside
    // it, so the label is not spelled out twice. The spaced guillemets are
    // French typography, which German does not take.
    emptyHint:
      "Ajoutez un événement, ou générez toute une saison d’un coup avec «\u00a0{{action}}\u00a0».",
    owedHeading: "À répondre",
    allAnswered: "Tout est répondu.",
    owedCount_one: "Il reste {{count}} événement sans réponse.",
    owedCount_other: "Il reste {{count}} événements sans réponse.",
    pastHeading: "Événements passés",
    restHeading: "Le reste du planning",

    // The per-row actions. Each accessible name carries the event, so a
    // screen-reader user hears which row they are on.
    registrations: "Inscriptions",
    registrationsAria: "Inscriptions à {{title}}",
    options: "Ce qu’on réserve",
    optionsAria: "Ce qui peut être réservé à {{title}}",
    whoComingAria: "Qui vient à {{title}}",
    editAria: "Modifier {{title}}",
    deleteAria: "Supprimer {{title}}",

    deleteTitle: "Supprimer «\u00a0{{title}}\u00a0»\u00a0?",
    deleteDescription:
      "L’événement sera retiré du planning. Les réponses de présence et les inscriptions liées seront supprimées avec lui. Cette action est définitive.",
    deleteFailed: "La suppression a échoué.",

    /** EventCard's detail list. `attireUnset` is also quoted by eventForm. */
    card: {
      location: "Lieu\u00a0:",
      locationMissing: "Lieu à fixer",
      attire: "Tenue\u00a0:",
      attireUnset: "Non précisée",
    },

    /** EventMeta's chips: what the committee sees and a player does not. */
    meta: {
      public: "Public",
      // Always the plural word: a ratio, "3/12 réponses", not a count. The
      // accessible name below is the counted sentence.
      answers: "{{answered}}/{{answerable}} réponses",
      answersAria_one: "{{count}} réponse sur {{total}}",
      answersAria_other: "{{count}} réponses sur {{total}}",
      noGuests: "Aucune inscription",
      guests_one: "{{count}} personne",
      guests_other: "{{count}} personnes",
    },

    /**
     * The month grid: an overview at a desk, never the phone's list.
     *
     * `dayAria` takes the date already formatted by the component's
     * locale-aware formatter (EventCalendar.tsx).
     */
    calendarGrid: {
      previousMonth: "Mois précédent",
      nextMonth: "Mois suivant",
      dayAria_one: "{{date}}, {{count}} événement",
      dayAria_other: "{{date}}, {{count}} événements",
    },
  },

  /**
   * The event forms, and the three pages that mount them.
   *
   * These are control labels, not `fields.*`, which translateApiError uses to
   * turn the API's `errors[].field` token into a noun. The two must be free
   * to differ:
   *
   *   - `startDate` ("Date de début") carries the problem for `startsAt`,
   *     whose noun is "Début": one instant is edited by two boxes.
   *   - `endTime` ("Heure de fin") carries `endsAt`'s refusal (see that field
   *     in EventForm.tsx); a shared key would name the box, not the thing.
   *   - `seriesForm.from`/`to` ("Du"/"Au") drive the generator and are never
   *     sent.
   *
   * So a control's label lives with its screen and a field's noun lives in
   * `fields`, even where they are the same French word ("Titre", "Lieu").
   */
  eventForm: {
    newHeading: "Nouvel événement",
    editHeading: "Modifier l’événement",
    saveFailed: "L’enregistrement a échoué.",
    // A draft is saved as it is; publishing is a second step.
    saveDraft: "Enregistrer le brouillon",
    publish: "Publier",
    draftHint:
      "Un brouillon peut rester incomplet : seule la direction le voit, jusqu’à sa publication.",
    loadFailed: "Cet événement n’a pas pu être chargé.",
    loadFailedReload: "Cet événement n’a pas pu être chargé. Rechargez la page.",
    poster: "Affiche",
    // The event is saved and its poster is not: the form stays open on the
    // saved event so the poster can be chosen again.
    posterFailed:
      "L’événement est enregistré, mais pas son affiche. Choisissez-la à nouveau, puis enregistrez.",

    addTitle: "Ajouter un événement",
    editTitle: "Modifier {{title}}",
    // Not common.busy: French says "Enregistrement…" here and "En cours…" in
    // a dialog.
    saving: "Enregistrement…",

    title: "Titre",
    startDate: "Date de début",
    startTime: "Heure de début",
    endDate: "Date de fin",
    endTime: "Heure de fin",
    location: "Lieu",
    attire: "Tenue",
    // {{unset}} is events.card.attireUnset, the string the card renders, so
    // the hint and the card cannot disagree. The spaced guillemets are French
    // typography.
    attireHint:
      "Laissez vide si la tenue n’est pas encore décidée\u00a0: la carte affichera «\u00a0{{unset}}\u00a0».",
    isPublic: "Visible sur le site public",
    tags: "Catégories",
    notes: "Remarques",

    registrationsLegend: "Inscriptions du public",
    registrationsHint:
      "Renseignez une date de clôture pour donner un formulaire d’inscription à cet événement. Laissez-la vide si personne ne s’inscrit\u00a0: c’est le cas de presque tout le planning.",
    closesDate: "Clôture des inscriptions",
    closesTime: "Heure de clôture",
    opensDate: "Ouverture des inscriptions",
    opensTime: "Heure d’ouverture",
    opensHint:
      "Une fois le formulaire ouvert, il est en ligne tout de suite s’il n’a pas de date d’ouverture. Renseignez-la pour qu’il n’apparaisse qu’à partir de ce jour-là.",
    maxGuests: "Personnes par inscription",
    maxGuestsHint:
      "Le maximum qu’une seule inscription peut couvrir, entre 1 et 100. Laissez vide pour ne pas limiter. Pour limiter la salle, donnez un nombre de places à chaque menu dans «\u00a0Ce qu’on réserve\u00a0».",
    formOpen: "Formulaire ouvert",
    asksAddress: "Demander l’adresse",
    asksTable: "Demander la table",
    formOpenHint:
      "Le formulaire n’apparaît au public que coché et entre ses dates\u00a0: vous pouvez le préparer à l’avance et ne l’ouvrir qu’ensuite.",
  },

  /**
   * The season generator (/events/new/series).
   *
   * `weekdays` are spelled out rather than asked of Intl, because
   * `Intl.DateTimeFormat("fr-CH", { weekday: "long" })` answers "lundi",
   * lowercase, and the select reads "Lundi".
   */
  seriesForm: {
    newHeading: "Nouvelle série",
    createFailed: "La création de la série a échoué.",

    heading: "Une série d’événements",
    intro:
      "Toutes les dates reçoivent le même titre, le même lieu et les mêmes horaires. Chacune devient un événement indépendant\u00a0: en modifier une plus tard ne touche pas les autres.",

    weekday: "Jour de la semaine",
    weekdays: {
      monday: "Lundi",
      tuesday: "Mardi",
      wednesday: "Mercredi",
      thursday: "Jeudi",
      friday: "Vendredi",
      saturday: "Samedi",
      sunday: "Dimanche",
    },

    from: "Du",
    to: "Au",

    noDates: "Choisissez un jour et une période pour voir les dates qui seront créées.",
    datesLegend: "Dates à créer",
    // {{n}}, not {{count}}, as in nav.pending: shown only above the cap, so
    // always plural, and a `count` option would make i18next look for forms.
    tooMany:
      "{{n}} dates sélectionnées\u00a0: {{cap}} au maximum par série. Décochez-en ou raccourcissez la période.",

    creating: "Création…",
    create_one: "Créer {{count}} événement",
    create_other: "Créer {{count}} événements",
    // The button's label while nothing is chosen yet, when there is no count
    // to name. It is inert then, and described by noDates or noneChosen.
    createNone: "Créer les événements",
    noneChosen: "Cochez au moins une date.",
    // Shown on the planning, where the generator lands after saving. A series
    // is created as drafts, so a wrong repetition does not land in
    // everybody's planning at once.
    draftsNote:
      "Les événements sont créés comme brouillons : relisez-les sur le planning, puis publiez-les.",
    createdCount_one: "{{count}} brouillon créé.",
    createdCount_other: "{{count}} brouillons créés.",
    another: "Créer une autre série",
    dismissCreated: "Fermer ce message",
  },

  /**
   * The roster (/members) and the three dialogs it opens.
   *
   * Every accessible name carries the person. `deleteTitle` and `resetTitle`
   * each serve as a button's screen-reader text and as the title of the
   * dialog it opens, so the two cannot disagree.
   *
   * "Cette personne", not the name, in both descriptions. In French an
   * interpolated name drags a participle that must agree with it, and the
   * roster holds no gender field (see the delete dialog in Members.tsx). In
   * German the title already names the person.
   */
  members: {
    heading: "Membres",
    // The count beside the heading, off the server's `meta.total`. A plural
    // family: "0 membre" in French, "0 Mitglieder" in German.
    count_one: "{{count}} membre",
    count_other: "{{count}} membres",
    add: "Ajouter une personne",

    saveFailed: "L’enregistrement a échoué.",
    actionFailed: "L’action a échoué.",
    loadFailed: "Cette personne n’a pas pu être chargée.",
    loadFailedReload: "Cette personne n’a pas pu être chargée. Rechargez la page.",
    incompleteSave: "L’enregistrement est incomplet\u00a0: rechargez la page.",
    rosterLoadFailed: "La liste des membres n’a pas pu être chargée.",

    // The card's labelled fields. The label is part of the sentence, since
    // its colon is spaced in French only.
    usernameLabel: "Identifiant\u00a0: {{value}}",
    sectionLabel: "Pupitre\u00a0: {{value}}",
    rolesLabel: "Rôles\u00a0: {{value}}",
    noSection: "Aucun pupitre",
    noRoles: "Aucun rôle",
    // A register held without any role granting attendance.respond. The label
    // is the consequence, worded like the musician role's own hint; the name
    // adds the register, for a screen reader that reaches it without the card.
    notAnswering: "Ne répond pas aux événements",
    notAnsweringName: "Dans un pupitre, mais ne répond pas aux événements",

    // Searching the roster. The label is the field's accessible name and its
    // placeholder; the two selects default to "all".
    searchLabel: "Rechercher un membre",
    sectionFilter: "Pupitre",
    roleFilter: "Rôle",
    allSections: "Tous les pupitres",
    allRoles: "Tous les rôles",
    // The matches out of the whole roster. The plural follows the roster, not
    // the matches: "1 sur 45 membres".
    filteredCount_one: "{{matches}} sur {{count}} membre",
    filteredCount_other: "{{matches}} sur {{count}} membres",
    noMatch: "Aucun membre ne correspond à cette recherche.",
    clearFilters: "Effacer les filtres",

    // Used as the button's sr-only text AND as the dialog's title.
    editPerson: "Modifier {{name}}",
    password: "Mot de passe",
    deleteTitle: "Supprimer {{name}}",
    deleteDescription:
      "Cette personne sera retirée de la liste et perdra immédiatement son accès au site. Ses réponses de présence seront effacées du planning. Cette action est définitive.",
    reset: "Réinitialiser",
    resetTitle: "Réinitialiser le mot de passe de {{name}}",
    resetDescription:
      "Un nouveau mot de passe sera généré et affiché une seule fois. Cette personne sera déconnectée partout et devra le changer à la prochaine connexion.",

    /** The one-time password reveal (ADR 0016). */
    generatedTitle: "Mot de passe de {{name}}",
    generatedDescription:
      "Notez-le ou lisez-le à la personne maintenant\u00a0: il ne sera plus jamais affiché. Elle devra le remplacer à sa première connexion.",
    generatedAck: "J’ai noté le mot de passe",

    /**
     * The account-state pills, and the date beneath them.
     *
     * `neverUsedName` and `provisionalName` are the accessible names: a screen
     * reader reaches "Provisoire" with no card around it to supply the noun.
     *
     * The French label avoids a participle agreeing with the member: "jamais
     * utilisé" agrees with `le compte`, where "jamais connecté" would need the
     * member's gender. German has no such constraint.
     */
    neverUsed: "Jamais utilisé",
    neverUsedName: "Compte jamais utilisé",
    provisional: "Provisoire",
    provisionalName: "Mot de passe provisoire",
    // {{date}} comes from the locale-aware formatLastLogin; the preposition
    // around it is language, so the whole sentence lives here.
    lastLogin: "Dernière connexion le {{date}}",
  },

  /** The roster's add/edit form. */
  memberForm: {
    firstName: "Prénom",
    lastName: "Nom",
    username: "Identifiant",
    passwordHintNew:
      "Un mot de passe sera généré et affiché une seule fois après l’enregistrement.",
    passwordHintEdit:
      "Le mot de passe se réinitialise depuis la liste, jamais depuis ce formulaire.",
    section: "Pupitre",
    committeeFunction: "Fonction au comité",
    noFunction: "Aucune fonction",
    instructorOf: "Moniteur du pupitre",
    notInstructor: "Pas moniteur",
    // Its own key, not eventForm.isPublic, though the French is the same:
    // there an event appears on the public agenda, here a person on /band.
    publicVisible: "Visible sur le site public",
    rolesLegend: "Rôles",
    rolesAfterSave:
      "Les rôles s’attribuent après avoir enregistré la personne\u00a0: donner des droits est une action à part, qui coupe les sessions en cours et laisse une trace.",
    saving: "Enregistrement…",
  },

  /**
   * The public booking form (/events/:id/book), which a stranger reaches:
   * a German speaker booking a seat at the souper, on a phone, at the hall.
   */
  booking: {
    fields: {
      lastName: "Nom",
      firstName: "Prénom",
      email: "E-mail",
      phone: "Téléphone",
      address: "Adresse",
      tableName: "Table",
    },

    submitFailed: "L’inscription n’a pas pu être enregistrée. Veuillez réessayer.",
    // Vague on purpose: a closed event and a mistyped id answer the same way,
    // so a stranger cannot enumerate what exists.
    notOpen:
      "Il n’y a pas d’inscription ouverte pour cette adresse. Vérifiez le lien qui vous a été communiqué.",
    loadFailed: "Le formulaire n’a pas pu être chargé. Rechargez la page.",

    bookedHeading: "Inscription enregistrée",
    bookedBody:
      "Merci\u00a0! Un courriel de confirmation part à {{email}}. Le comité vous contactera au {{phone}} si nécessaire.",

    opensOn: "Les inscriptions ouvrent le {{date}}.",
    closed: "Les inscriptions sont closes.",
    closesOn: "Inscriptions jusqu’au {{date}}.",
    maxGuests_one: "Une inscription couvre au maximum {{count}} personne.",
    maxGuests_other: "Une inscription couvre au maximum {{count}} personnes.",

    contactLegend: "Vos coordonnées",
    choiceLegend: "Votre choix",
    // Under the Table field. Which fields are optional is said by the star on
    // the others; what "table" means here is not said anywhere else.
    tableHint: "Avec qui vous aimeriez être placé.",
    nothingOffered: "Rien n’est encore proposé pour cette soirée. Revenez d’ici quelques jours.",
    // Only for an option with a capacity; the server counts, see `remaining`.
    placesLeft_one: "Plus qu’une place",
    placesLeft_other: "Plus que {{count}} places",
    soldOut: "Complet",

    chooseSomeone: "Choisissez au moins une personne.",
    // Under a required question the server says was left out.
    answerRequired: "Merci de répondre à cette question.",
    // A yes/no question's two answers, and how an answer reads back on the
    // confirmation. The question and the answer are what the committee typed.
    yes: "Oui",
    no: "Non",
    answered: "{{question}} : {{answer}}",
    // The running total and the confirmation, when an option carries a price. {{guests}} is
    // common.guests already counted; {{total}} is formatCents.
    guestsWithTotal: "{{guests}} — {{total}}",
    submit: "M’inscrire",
    sending: "Envoi…",
  },

  /** The committee's guest list (/events/:id/registrations). */
  registrations: {
    amendFailed: "La correction n’a pas pu être enregistrée.",
    cancelFailed: "L’annulation a échoué.",
    loadFailed: "Cette inscription n’a pas pu être chargée.",
    loadFailedReload: "Cette inscription n’a pas pu être chargée. Rechargez la page.",
    listLoadFailed: "La liste n’a pas pu être chargée.",
    downloadFailed: "Le fichier n’a pas pu être téléchargé.",

    tableLabel: "Table\u00a0: {{value}}",
    bookings_one: "{{count}} inscription",
    bookings_other: "{{count}} inscriptions",
    // The counts line joins its parts with a middot; the parts are counted
    // separately because they pluralise separately.
    countsSeparator: " · ",
    exportsHint:
      "Les quatre fichiers contiennent exactement les mêmes lignes. Excel est celui que le comité ouvre\u00a0; CSV fonctionne partout.",
    empty: "Personne ne s’est encore inscrit. Le formulaire public est à l’adresse",
    emptyClosed:
      "Personne ne s’est encore inscrit. Le formulaire n’est pas encore ouvert au public\u00a0: cochez «\u00a0Formulaire ouvert\u00a0» sur l’événement.",

    /**
     * The two "Annuler"s are not one key. `cancel` is the per-row button that
     * cancels a booking; common.cancel closes a form without doing anything.
     * German says "stornieren" and "abbrechen". In the cancel dialog the way
     * out has its own words (`keepBooking` below).
     */
    cancel: "Annuler",
    // Two keys: the dialog asks ("… de X Y ?", with French's space before
    // the question mark) and the button labels ("… de X Y").
    cancelAria: "Annuler l’inscription de {{name}}",
    cancelTitle: "Annuler l’inscription de {{name}}\u00a0?",
    cancelDescription:
      "L’inscription et tout ce qu’elle a commandé seront supprimés. La personne n’est pas prévenue. Cette action est définitive.",
    cancelConfirm: "Annuler l’inscription",
    // The dialog's way out. "Annuler" beside "Annuler l’inscription" would be
    // ambiguous where a tap cannot be taken back, so this names what
    // dismissing does.
    keepBooking: "Garder l’inscription",

    // What the kitchen is told: one entry per option, summed over every
    // booking. Same shape as the per-card order line, so the two read alike.
    optionTotalsLabel: "Au total\u00a0:",
    optionTotal: "{{count}} × {{label}}",
    // Above the tally of each question's answers.
    answerTotalsLabel: "Réponses :",
    // A question a booking left alone, counted with its answers.
    noAnswer: "sans réponse",

    // Paying. Only a booking with a price shows any of this: a free evening
    // has nothing to collect. `paid` labels a manager's switch and fills a
    // viewer's pill. `paidAria` names the switch, one per card, and starts
    // with the visible word so voice control reaches it (WCAG 2.5.3).
    paid: "Payé",
    unpaid: "Non payé",
    paidAria: "Payé : inscription de {{name}}",
    payFailed: "Le paiement n’a pas pu être enregistré.",
    // {{count}} is the number of bookings that owe something and picks the
    // plural. No-break spaces, so a phone cannot break the line inside the
    // phrase and leave "1" dangling.
    paidCount_one: "{{paid}}\u00a0sur\u00a0{{count}}\u00a0payée",
    paidCount_other: "{{paid}}\u00a0sur\u00a0{{count}}\u00a0payées",

    // Markdown and JSON are developer formats, kept behind this.
    moreFormats: "Autres formats",

    amend: "Corriger",
    // The row button's accessible name and the amend form's heading, so the
    // two cannot disagree, as with members.deleteTitle.
    amendTitle: "Corriger l’inscription de {{name}}",
    orderNotHere:
      "La commande ne se modifie pas ici. Pour la changer, annulez l’inscription et refaites-la.",
    saving: "Enregistrement…",
  },

  /** What a guest may book, and at what price (/events/:id/registration-options). */
  registrationOptions: {
    saveFailed: "L’enregistrement a échoué.",
    loadFailedReload: "La liste n’a pas pu être chargée. Rechargez la page.",
    intro:
      "Ce que le public peut réserver, et à quel prix. Laissez le prix vide pour une option qui n’en a pas\u00a0; écrivez 0 pour une option gratuite. Ce n’est pas la même chose.",
    empty:
      "Rien n’est proposé pour l’instant. Le formulaire public affichera l’événement sans rien à choisir.",

    label: "Intitulé",
    description: "Description",
    // The kind beside the number, since the fields differ from one kind to
    // the next.
    blockHeading: "Bloc {{n}} · {{kind}}",
    kinds: {
      quantity: "Quantité",
      text: "Texte libre",
      choice: "Choix unique",
      yes_no: "Oui / non",
      heading: "Titre",
      paragraph: "Paragraphe",
    },
    addBlock: "Ajouter un bloc",
    required: "Réponse obligatoire",
    countsGuests: "Compte comme personnes",
    countsGuestsHint:
      "Ce nombre s’ajoute aux personnes de l’inscription et compte pour la limite par inscription.",
    body: "Texte",
    answers: "Réponses",
    answerNumber: "Réponse {{n}}",
    addAnswer: "Ajouter une réponse",
    removeAnswer: "Retirer la réponse {{n}}",
    tooFewAnswers: "Proposez au moins deux réponses.",
    price: "Prix en francs",
    priceInvalid: "Indiquez un montant, par exemple 45 ou 45.50.",
    capacity: "Nombre de places",
    capacityHint: "Vide : pas de limite.",
    // Beside the field, so lowering the number shows what is already booked.
    capacityRemaining_one: "Vide : pas de limite. Il reste {{count}} place.",
    capacityRemaining_other: "Vide : pas de limite. Il reste {{count}} places.",
    capacityInvalid: "Indiquez un nombre entier, au moins 1.",

    // The only names these icon-only controls have. {{option}} is what the
    // committee typed, or `thisOption` for a row with no title yet.
    moveUp: "Monter {{option}}",
    moveDown: "Descendre {{option}}",
    remove: "Retirer {{option}}",
    thisOption: "ce bloc",

    saved: "Enregistré.",
    saving: "Enregistrement…",

    // The in-place editor (/events/:id/book/edit, #319). The page is the
    // booking form itself, so most of what it shows is the guest's copy.
    editing: "Vous modifiez ce formulaire. Les invités le voient comme ci-dessous.",
    settingsHeading: "Réglages du formulaire",
    enabled: "Réservations ouvertes",
    enabledOn: "Ouvertes : le formulaire est en ligne entre ses dates.",
    enabledOff: "Fermées : personne ne voit encore le formulaire.",
    closesDate: "Clôture des inscriptions",
    closesTime: "Heure de clôture",
    opensDate: "Ouverture des inscriptions",
    opensTime: "Heure d’ouverture",
    opensHint: "Vide : en ligne dès que les réservations sont ouvertes.",
    maxGuests: "Personnes par inscription",
    maxGuestsHint: "Le maximum qu’une inscription peut couvrir, de 1 à 100. Vide : pas de limite.",
    noClosingDate:
      "Sans date de clôture, personne ne peut réserver : l’événement n’a alors pas de formulaire.",
    contactHeading: "Coordonnées",
    contactLocked: "Toujours demandé",
    contactHint: "Nom, prénom, e-mail et téléphone : chaque inscription les donne.",
    asksAddress: "Demander l’adresse",
    asksTable: "Demander avec qui être à table",
    // The name of the button over a closed block. {{block}} is what the
    // committee typed, or `thisOption`.
    edit: "Modifier « {{block}} »",
    done: "Terminé",
    inUse: "A des réponses : ne peut être ni retiré ni changé de nature.",
    insertFirst: "Ajouter un bloc au début",
    insertAfter: "Ajouter un bloc après « {{block}} »",
    insertHere: "Ajouter un bloc ici",
    pickerHeading: "Que voulez-vous ajouter ?",
    kindHints: {
      quantity: "Un nombre, avec prix et places",
      text: "Ce que l’invité veut dire",
      choice: "Une réponse dans une liste",
      yes_no: "Une question fermée",
      heading: "Sépare le formulaire en parties",
      paragraph: "Une information à lire",
    },
    cancel: "Annuler",
    preview: "Voir comme un invité",
    backToEditing: "Revenir à l’édition",
    copyFrom: "Copier depuis…",
    copyHint: "Reprend les blocs d’un autre formulaire, sans ses inscriptions.",
    copyNone: "Aucun autre événement n’a de formulaire.",
    leave: "Le formulaire a des modifications non enregistrées. Quitter quand même ?",
  },

  /**
   * Signing in (/login).
   *
   * The heading is `nav.login`, so a rename cannot leave the link and its
   * destination disagreeing.
   *
   * The field labels are their own keys, not `fields.username`/`password`:
   * those are the error vocabulary, these name controls (see `eventForm`).
   */
  auth: {
    username: "Identifiant",
    password: "Mot de passe",
    signIn: "Se connecter",
    signingIn: "Connexion…",
    loginFailed: "La connexion a échoué.",
  },

  /**
   * The account screens: /account (who you are) and /account/password.
   */
  account: {
    heading: "Mon compte",
    // An empty value is spelled out, because a blank or a dash reads as data
    // that failed to load.
    identity: "Identité",
    username: "Identifiant",
    section: "Pupitre",
    // Not "Ne joue pas": a register is display only, and somebody who
    // answers for events in no register still plays.
    sectionNone: "Aucun pupitre",
    committeeFunction: "Fonction au comité",
    committeeFunctionNone: "Aucune",
    roles: "Rôles",
    rolesNone: "Aucun",
    password: "Mot de passe",
    // Explained, not only enforced: a member bounced back here by the gate
    // with no reason given would think the site was broken.
    provisionalNotice:
      "Votre mot de passe a été fourni par le comité et doit être remplacé avant de continuer.",
    currentPassword: "Mot de passe actuel",
    newPassword: "Nouveau mot de passe",
    confirmPassword: "Confirmer le nouveau mot de passe",
    // Checked in the browser before anything is sent, so it is this screen's
    // own sentence rather than one of the API's error tokens.
    mismatch: "Les deux mots de passe ne correspondent pas.",
    // The rule, stated under the field before anything is sent. `min` is
    // MIN_PASSWORD_LENGTH, so it cannot disagree with the API. `ruleMet` is
    // for a screen reader only, since the tick on screen is an icon.
    rule: "Au moins {{min}} caractères",
    ruleMet: "respecté",
    matches: "Les mots de passe correspondent.",
    changed: "Votre mot de passe a été changé.",
    change: "Changer le mot de passe",
    changing: "Changement…",
    changeFailed: "Le changement de mot de passe a échoué.",
  },

  /**
   * The refusal a route guard renders (components/guards.tsx).
   *
   * Its own keys, not `errors.access_denied`, which translateApiError renders
   * inside a form; this is a whole screen with a heading and a way out. They
   * read the same in French, as with `memberForm.publicVisible`.
   */
  guards: {
    deniedHeading: "Accès refusé",
    deniedBody:
      "Cette page est réservée à d’autres membres. Si vous pensez qu’il s’agit d’une erreur, contactez le comité.",
  },

  /**
   * The front door (/).
   *
   * `destinations` backs Home.tsx's DESTINATIONS array, which carries a
   * titleKey/descriptionKey pair per card rather than a label — see the
   * labelKey pattern on Layout.tsx's NAV.
   */
  home: {
    hero: "La guggen d’enfants de Fribourg, depuis 2002.",
    // The words of `hero` set on the yellow highlight. Must be part of `hero`.
    // The whole "children's guggen", as German highlights Kinder-Guggenmusik.
    heroHighlight: "guggen d’enfants",
    heroSub:
      "De 7 à 18 ans — et pas besoin de connaître la musique : les moniteurs apprennent les morceaux registre par registre, aux répétitions du samedi matin.",
    discover: "Découvrir les Canetons",
    brandLogoAlt: "Le logo des Canetons de Fribourg",
    destinations: {
      join: {
        title: "Nous rejoindre",
        description: "Les instruments recherchés, les horaires et les critères d’âge.",
      },
      band: {
        title: "Les canetons",
        description: "Les musiciens du groupe, registre par registre.",
      },
      history: {
        title: "Notre histoire",
        description: "Comment la guggen est née en 2002, et qui l’a dirigée depuis.",
      },
      committee: {
        title: "Le comité",
        description: "Nous écrire, réserver les Canetons, et qui fait quoi.",
      },
    },
  },

  /**
   * The photo library's upload cards: one state per card and a reason when it
   * failed. The reasons mirror the queue's failure reasons one to one.
   */
  photos: {
    state: {
      waiting: "En attente",
      shrinking: "Préparation…",
      uploading: "Envoi…",
      done: "Ajoutée",
      duplicate: "Déjà dans la bibliothèque",
      failed: "Échec",
    },
    reason: {
      unreadable: "Ce format n’est pas lisible par ce navigateur — exportez la photo en JPEG.",
      unsupported: "Ce type de fichier n’est pas une photo acceptée.",
      too_large: "La photo reste trop lourde, même réduite.",
      blank:
        "Ce navigateur a rendu la photo entièrement noire, elle n’a donc pas été envoyée. Réessayez avec un autre navigateur.",
      image_library_full: "La bibliothèque est pleine.",
      image_storage_full: "Le serveur n’a plus de place pour les photos.",
      network: "L’envoi a échoué. Réessayez.",
      rejected: "Le serveur a refusé cette photo.",
    },
    retry: "Réessayer",
    retryAll: "Tout réessayer",
    queueLabel: "Photos en cours d’ajout",
    // The name a photo is uploaded under when its file name leaves nothing.
    defaultName: "Photo",
    // The picker a form opens to choose a photo from the library.
    add: "Ajouter des photos",
    choose: "Choisir",
    remove: "Retirer",
    close: "Fermer la bibliothèque",
    pickerTitle: "Choisir une photo",
    pickerDescription:
      "Touchez une photo pour la choisir, ou ajoutez-en une depuis votre appareil.",
    // One photo, chosen as soon as it has uploaded.
    pickerAdd: "Ajouter depuis l’appareil",
    pickerEmpty: "La bibliothèque est vide. Ajoutez une première photo.",
    loadFailed: "La bibliothèque n’a pas pu être chargée.",
    removeFromSlot: "Retirer la photo",

    // The controls of a photo slot, for whoever holds images.manage: an empty
    // slot is one big add button, and a placed photo carries a pencil. The
    // pencil shows its word only from sm up. Both carry an accessible name
    // that ends with the slot's label, since /band has many of them, and that
    // name starts with the visible words.
    addOne: "Ajouter une photo",
    addFrom: "Depuis la médiathèque ou votre appareil",
    addSlot: "Ajouter une photo — {{label}}",
    change: "Changer",
    changeSlot: "Changer la photo — {{label}}",
    // A slot's label: the end of its controls' names, and what the library
    // lists under "Affichée". A register's label is its own name.
    slot: {
      band: "Photo du groupe",
      concert: "Photo en concert",
      godparents: "Parrain et marraine",
      history: "Histoire\u00a0: {{title}}",
      // Also the poster's alternative text, wherever the event shows it.
      event: "Affiche\u00a0: {{title}}",
    },
    slotSaveFailed: "La photo n’a pas pu être changée.",
    // Read out once the slot shows its new state.
    slotPlaced: "Photo placée.",
    slotRemoved: "Photo retirée.",
    // A file dragged onto a slot from the desktop.
    dropHere: "Déposer pour ajouter",
    dropOnlyOne: "Une seule photo à la fois.",
    dropNotPhoto: "Seule une photo peut être déposée ici.",

    // The library screen, /media. {{n}} rather than {{count}}: i18next reads
    // a `count` option as a plural selector (see nav.pending).
    heading: "Médias",
    summary: "{{n}} / {{capacity}} photos · {{size}}",
    consent: "Avant de publier la photo d’un enfant, assurez-vous que ses parents sont d’accord.",
    // French counts zero as singular, so 0 and 1 both take the _one form.
    placesLeft_one: "{{count}} place restante\u00a0: les photos au-delà ne seront pas ajoutées.",
    placesLeft_other:
      "{{count}} places restantes\u00a0: les photos au-delà ne seront pas ajoutées.",
    leaveWarning:
      "Des photos sont encore en cours d’envoi. Si vous quittez la page, celles qui restent ne seront pas ajoutées.",
    libraryHeading: "Bibliothèque",
    filterLabel: "Filtrer la bibliothèque",
    filterAll: "Toutes",
    filterUsed: "Utilisées",
    filterUnused: "Non utilisées",
    emptyFiltered: "Aucune photo ne correspond à cette recherche.",
    // The search box and the order of the library, both on the client.
    searchLabel: "Chercher une photo par son nom",
    searchPlaceholder: "Chercher par nom",
    sortLabel: "Ordre de la bibliothèque",
    sort: {
      newest: "Les plus récentes",
      oldest: "Les plus anciennes",
      name: "Par nom, de A à Z",
      largest: "Les plus lourdes",
    },
    unused: "Non utilisée",
    usedOn: "Affichée\u00a0:",
    addedOn: "Ajoutée le {{date}}",
    // The visible word beside the box; the accessible name says which photo.
    select: "Sélectionner",
    selectPhoto: "Sélectionner {{name}}",
    deleteSelected: "Supprimer ({{n}})",
    deleteTitle_one: "Supprimer cette photo\u00a0?",
    deleteTitle_other: "Supprimer ces {{count}} photos\u00a0?",
    deleteDescription: "Une photo supprimée ne peut pas être récupérée.",
    deleteConfirm: "Supprimer",
    deleted_one: "Photo supprimée.",
    deleted_other: "{{count}} photos supprimées.",
    deleteFailedHeading: "Ces photos n’ont pas été supprimées\u00a0:",
    deleteFailed: "Photo «\u00a0{{name}}\u00a0»\u00a0: {{message}}",
    deleteFailedFallback: "La suppression a échoué.",

    // One photo of the library, /media/:id: its sizes, where it is shown, and
    // what can be done with it. The name is the committee's own label.
    detail: {
      back: "← Retour aux médias",
      loadFailed: "La photo n’a pas pu être chargée.",
      sizesHeading: "Tailles enregistrées",
      size: "{{width}} × {{height}} px · {{size}}",
      usedOnHeading: "Utilisée sur",
      actionsLabel: "Actions sur la photo",
      rename: "Renommer",
      nameLabel: "Nom",
      renamed: "Nom enregistré.",
      renameFailed: "Le nom n’a pas pu être enregistré.",
      leaveRename:
        "Le nouveau nom n’est pas encore enregistré. Si vous quittez la page, il sera perdu.",
      rotateLeft: "Tourner à gauche",
      rotateRight: "Tourner à droite",
      replace: "Remplacer",
      download: "Télécharger",
      rotating: "Rotation de la photo…",
      preparing: "Préparation de la photo…",
      sending: "Envoi de la photo…",
      rotated: "Photo tournée.",
      replaced: "Photo remplacée.",
      unchanged: "La photo n’a pas changé\u00a0: {{message}}",
      sendFailed: "l’envoi a échoué. Réessayez.",
      deleteInUseTitle: "Cette photo est encore affichée",
      deleteInUse: "Retirez-la d’abord de chacune de ces pages, puis supprimez-la.",
      close: "Fermer",
    },
  },

  /**
   * The band's history, /history. The entries themselves are content typed by
   * the committee and rendered verbatim; these are only the page's own words.
   */
  history: {
    heading: "L’Histoire des Canetons",
    // With its article: "L’" and "Histoire" are one word in speech.
    headingHighlight: "L’Histoire",
    empty: "L’histoire n’a pas encore été écrite.",
    loadFailed: "L’histoire n’a pas pu être chargée.",
    // Under an entry shown in the other language. Which one is shown depends
    // on the entry's language, not the page's.
    inFrench: "En français",
    inGerman: "En allemand",
    // Read before the date in an important entry's heading, so its punctuation
    // is each language's own.
    importantPrefix: "Étape importante : ",
    add: "Ajouter",
    addAria: "Ajouter à l’histoire",
    edit: "Modifier",
    delete: "Supprimer",
    // The accessible names, which carry the entry, in each language's word order.
    editAria: "Modifier {{name}}",
    deleteAria: "Supprimer {{name}}",
    // Non-breaking spaces inside the guillemets and before the question mark,
    // so neither is ever left alone at the start of a line.
    deleteHeadingNamed: "Supprimer « {{title}} » ({{date}}) ?",
    deleteHeadingUntitled: "Supprimer l’entrée {{of}} ?",
    deleteDescription: "Elle disparaît de la page publique.",
    deleteFailed: "La suppression a échoué.",
    // An untitled entry is named by its date, so three of them do not have
    // three identical buttons. {{of}} is one of `of` below.
    untitledEntry: "l’entrée {{of}}",
    // "de 2007", "d’octobre 2002", "du 11.11.2023": the preposition depends on
    // the precision, and elides before a month that starts with a vowel.
    of: {
      year: "de {{date}}",
      month: "de {{date}}",
      monthVowel: "d’{{date}}",
      day: "du {{date}}",
    },
    // Announced after the timeline is back, since the save or the delete
    // leaves no visible trace where focus lands.
    saved: "Entrée enregistrée.",
    deleted: "Entrée supprimée.",
    // The entry saved and its photo did not. The form has closed, since
    // saving it again would add the entry twice.
    photoFailed:
      "L’entrée est enregistrée, mais pas sa photo. Modifiez l’entrée pour la choisir à nouveau.",
    icons: {
      none: "Aucune",
      flag: "Drapeau",
      star: "Étoile",
      music: "Musique",
      trophy: "Trophée",
      users: "Personnes",
      "party-popper": "Fête",
      "map-pin": "Lieu",
      heart: "Cœur",
    },
  },

  /** The history editor, /history/new and /history/:id/edit. Field labels are `fields.*`. */
  historyForm: {
    newHeading: "Nouvelle entrée",
    editHeading: "Modifier l’entrée",
    french: "Français",
    german: "Allemand",
    photo: "Photo",
    atLeastOne: "Au moins un titre ou un texte, dans l’une des deux langues.",
    // Worded as what the timeline will show, because "précision" alone does
    // not say that a year entry keeps no day.
    precisions: {
      year: "L’année seulement (2019)",
      month: "Le mois et l’année (octobre 2002)",
      day: "La date exacte (11.11.2023)",
    },
    year: "Année",
    month: "Mois",
    yearInvalid: "Indiquez l’année en quatre chiffres.",
    // Colons carry each language's own spacing, so they live here.
    preview: "Sur la frise :",
    labelSeparator: " : ",
    // Instead of a bare "…", which a screen reader reads as "points de
    // suspension".
    previewIncomplete: "date à compléter",
    monthPlaceholder: "Choisir le mois",
    monthMissing: "Choisissez le mois.",
    // Read as words; "8 / 120" alone is read as "huit barre oblique cent vingt".
    counter: "{{n}} caractères sur {{max}}",
    iconLegend: "Icône sur la frise",
    saveFailed: "L’enregistrement a échoué.",
    loadFailed: "L’entrée n’a pas pu être chargée.",
  },

  /**
   * The public schedule: /agenda's own heading and empty state, and
   * AgendaEntry/PublicAgenda's shared copy (the front page's block and the
   * full page render the same entries).
   */
  agenda: {
    heading: "Où nous voir",
    // The words of `heading` set on the yellow highlight. Must be part of it.
    headingHighlight: "nous voir",
    intro: "Les prochaines sorties des Canetons. Venez nous écouter !",
    emptyNotice:
      "Les prochaines dates ne sont pas encore publiées. Revenez bientôt, ou écrivez au comité pour nous réserver.",
    seeAll: "Toutes les dates",
    register: "S’inscrire",
    // {{title}} is the event's own title, not translated. Only the verb
    // changes between locales; see PublicAgenda.tsx.
    registerFor: "S’inscrire — {{title}}",
  },

  /** /band, register by register. */
  band: {
    heading: "Nos Canetons",
    headingHighlight: "Canetons",
    instructors: "Moniteurs :",
    registersNav: "Registres",
    patronsHeading: "Le parrain et la marraine",
    patronsAlt: "Le parrain et la marraine des Canetons",
    // The names are content; the "et" between them is not, so the whole
    // line is catalogue copy.
    patrons: "Richard Hertig et Annick Bürgisser",
  },

  /** /committee: who to write to, and who holds which seat. */
  committee: {
    heading: "Le comité",
    headingHighlight: "comité",
    contactHeading: "Contact des Canetons",
    writeToCommittee: "Écrire au comité",
    booking: "Pour réserver les Canetons :",
  },

  /** /join: how to join, for a parent or a curious child. */
  join: {
    heading: "Tu veux commencer la guggen ?",
    headingHighlight: "la guggen",
    intro:
      "Nous sommes constamment à la recherche de quelques souffleurs pour s’époumonner et faire « concurrence » à nos percussions !",
    facts: {
      instruments: {
        heading: "Instruments recherchés",
        trumpet: "Trompette",
        trombone: "Trombone",
        sousaphone: "Sousaphone",
        euphonium: "Euphonium",
      },
      schedule: {
        heading: "Horaires",
        day: "Les samedis matin",
        time: "De 10h à 12h",
      },
      age: {
        heading: "Critères d’âge",
        range: "Dès 7 ans dans l’année civile jusqu’à l’âge de 18 ans",
      },
    },
    location: "Lieu",
    locationArea: "Basse-Ville de Fribourg",
    contacts: "Contacts",
    contactMeanwhile: "En attendant, écrivez-nous depuis la",
    contactPageLink: "page de contact",
  },

  /** /contact, one of the two public forms that make the server do work. */
  contact: {
    heading: "Contact",
    intro:
      "Une question, une demande de prestation, ou l’envie de nous rejoindre ? Écrivez au comité.",
    memberNotice:
      "Le comité est joignable directement, par téléphone ou sur WhatsApp — souvent plus rapide qu’un message envoyé d’ici. Ce formulaire reste bien sûr à votre disposition.",
    sendFailed: "L’envoi du formulaire a échoué. Veuillez réessayer.",
    submit: "Envoyer",
    sentHeading: "Message envoyé",
    sentBody:
      "Merci ! Le comité a reçu votre message et vous répondra à l’adresse que vous avez indiquée.",
    fields: {
      lastName: "Nom",
      firstName: "Prénom",
      email: "E-mail",
      subject: "Sujet",
      message: "Message",
    },
  },

  /** The soft 404 (see NotFound.tsx for why it is one). */
  notFound: {
    heading: "Page introuvable",
    body: "Oups ! La page que vous recherchez n’existe pas ou a été déplacée.",
  },

  /**
   * The two shared placeholder components, PhotoPending and Tbd.
   *
   * PhotoPending shows one sentence for every photo slot, so no French
   * grammar is glued onto a register's name. A caller passes Tbd's `what` as
   * a translated string, never a fragment glued together outside the
   * catalogue.
   */
  placeholders: {
    tbd: "••• à compléter",
    // A whole string, punctuation included: French puts a space before a
    // colon and German does not.
    tbdWhat: "••• à compléter : {{what}}",
    photoPending: "Photo à venir",
    registerFirstNames: "prénoms du registre",
    bookingNumber: "numéro pour les prestations",
    committeeSeats: "les fonctions et les noms du comité",
    joinContact: "nom et numéro",
  },
  // The role editor, at /roles.
  rolesPage: {
    heading: "Rôles",
    intro: "Un rôle regroupe des droits. On donne les rôles aux personnes sur la page Membres.",
    baselineNote: "Tous les comptes ont ce rôle. Il ne se modifie pas.",
    grantsNothing: "Ne donne aucun droit.",
    permissionsLegend: "Droits",
    editAria: "Modifier le rôle {{name}}",
    deleteAria: "Supprimer le rôle {{name}}",
    deleteTitle: "Supprimer le rôle {{name}} ?",
    // The damage, named: who loses the role. "Seul à leur donner" because a
    // right somebody also holds through another role stays.
    deleteHolders_one: "{{names}} perdra ce rôle, et les droits qu’il est seul à lui donner.",
    deleteHolders_other:
      "{{count}} personnes perdront ce rôle, et les droits qu’il est seul à leur donner : {{names}}.",
    deleteNobody: "Personne n’a ce rôle. Il disparaîtra simplement de la liste.",
    newHeading: "Nouveau rôle",
    add: "Créer le rôle",
    saveFailed: "Le rôle n’a pas pu être enregistré.",
    deleteFailed: "Le rôle n’a pas pu être supprimé.",
  },
  // The tag editor. "Catégorie" on screen: "étiquette" or "tag" would be the
  // developer's word, and the committee sorts the planning into categories.
  eventTags: {
    heading: "Catégories",
    intro:
      "Les catégories que portent les événements du planning. Un événement peut en avoir plusieurs. Avec «\u00a0Confettis\u00a0», un membre qui répond «\u00a0Oui\u00a0» à un événement de la catégorie reçoit une pluie de confettis.",
    count_one: "{{count}} événement",
    count_other: "{{count}} événements",
    editAria: "Modifier « {{label}} »",
    deleteAria: "Supprimer « {{label}} »",
    newHeading: "Nouvelle catégorie",
    add: "Ajouter",
    colour: "Couleur",
    // The switch on each tag's row, saved as it is flipped.
    celebrate: "Confettis",
    celebrateAria: "Confettis pour «\u00a0{{label}}\u00a0»",
    colours: {
      violet: "Violet",
      teal: "Vert d'eau",
      amber: "Ambre",
      pink: "Rose",
      blue: "Bleu",
      green: "Vert",
      coral: "Corail",
      gray: "Gris",
    },
    deleteTitle: "Supprimer « {{label}} » ?",
    deleteUsed_one: "Elle sera retirée de {{count}} événement.",
    deleteUsed_other: "Elle sera retirée de {{count}} événements.",
    deleteUnused: "Aucun événement ne la porte.",
    saveFailed: "La catégorie n'a pas pu être enregistrée.",
    deleteFailed: "La catégorie n'a pas pu être supprimée.",
  },
  registers: {
    heading: "Pupitres",
    intro:
      "Les pupitres de la guggen, dans l'ordre de la page « Les canetons » et du formulaire d'un membre. Un nom en allemand est facultatif : sans lui, la page allemande affiche le nom français.",
    players_one: "{{count}} musicien",
    players_other: "{{count}} musiciens",
    instructors_one: "{{count}} moniteur",
    instructors_other: "{{count}} moniteurs",
    moveUpAria: "Monter « {{label}} »",
    moveDownAria: "Descendre « {{label}} »",
    editAria: "Modifier « {{label}} »",
    deleteAria: "Supprimer « {{label}} »",
    newHeading: "Nouveau pupitre",
    add: "Ajouter",
    deleteTitle: "Supprimer « {{label}} » ?",
    deleteUnused: "Personne ne joue dans ce pupitre ni ne l'enseigne.",
    // Shown instead of a Delete button: the server refuses it anyway.
    deleteInUse:
      "Ce pupitre compte {{players}} et {{instructors}}. Attribuez-leur d'abord un autre pupitre sur la page des membres.",
    close: "Fermer",
    saveFailed: "Le pupitre n'a pas pu être enregistré.",
    deleteFailed: "Le pupitre n'a pas pu être supprimé.",
    moveFailed: "L'ordre n'a pas pu être enregistré.",
  },
};
