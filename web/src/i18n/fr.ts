/**
 * The French vocabulary for the API's machine tokens.
 *
 * Every key here must stay a BARE IDENTIFIER and this object must stay free of
 * TypeScript-only syntax. `api/tests/Feature/ApiErrorVocabularyTest.php` reads
 * this file, finds each section with a regex and then brace-walks it, asserting
 * that every `code` and `fields[].reason` the API can emit has French copy. A
 * quoted key would hide a token from that guard; TS syntax inside the literal
 * could confuse the walk.
 *
 * Ported unchanged from the old front end's app/assets/js/i18n.js.
 */
export const fr = {
  /**
   * Role names and help text, keyed by the role's `key` from the API.
   *
   * The API carries no display name: it is English without exception, and a
   * seeded role's name is system text a developer chose in a migration, not
   * something a user typed. `key` is the fixed identifier this maps from.
   *
   * When roles become editable, a committee-typed name is user input and
   * arrives on the role itself; the render then prefers it and falls back
   * here for rows nobody has renamed.
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
  },

  errors: {
    // The sentence translateApiError falls back to when a code or reason has
    // no copy. It is NOT an API token, so no server-side guard can see it:
    // web/src/api/http.ts mints `unknown_error` client-side for any non-JSON
    // error response (a 502, or TEST/QA's HTML Basic-Auth 401). The fallback
    // itself therefore has to be translatable, or a German reader gets this
    // sentence in French -- the exact failure the vocabulary guard exists to
    // prevent, arriving by the one route that guard cannot watch.
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
    // Dit quoi faire, sans expliquer pourquoi la règle existe : un mot de passe
    // transmis par le comité a été dicté de vive voix, donc le « changer » pour
    // lui-même laisserait le compte sur un mot de passe déjà entendu.
    password_unchanged: "Ce mot de passe est déjà le vôtre. Choisissez-en un autre.",

    invalid_session: "Session invalide",
    // Une requête qui ne peut pas ouvrir de session : réessayer ne sert
    // à rien, contrairement à invalid_session.
    stateful_request_required: "Cette requête ne peut pas ouvrir de session.",
    rate_limited: "Trop de requêtes. Veuillez patienter avant de réessayer.",
    service_unavailable: "Service indisponible",

    // Idempotency. All three are bugs in the client — a real form mints a key
    // when it renders and keeps it — so a member should never read any of
    // them. They exist because every code needs French, and because a token
    // with no copy prints the generic fallback.
    idempotency_key_required: "Ce formulaire n'a pas pu être envoyé. Rechargez la page.",
    idempotency_key_invalid: "Ce formulaire n'a pas pu être envoyé. Rechargez la page.",
    // The one a person can actually cause, by double-tapping Envoyer: the
    // first attempt is still running. It says to wait, not to try again.
    idempotency_key_reuse: "Envoi déjà en cours. Patientez quelques instants avant de réessayer.",

    // Conditional writes. `if_match_required` is a bug in the client, never
    // something the person at the screen did — so it says what it says without
    // blaming them, and the SPA should never let them see it.
    if_match_required: "Cette modification n'a pas pu être vérifiée. Rechargez la page.",
    // `if_match_failed` is the one a member really does meet: somebody else
    // changed the same thing while their form was open. It says what happened
    // and what to do, and deliberately does not offer to force the write.
    if_match_failed:
      "Quelqu'un a modifié cet élément entre-temps. Rechargez pour voir les changements, puis réessayez.",

    // Attendance. `not_answerable` is a 403 that is NOT about a missing
    // permission — there is none for answering — so it must not read like
    // one, or the reader goes looking for a right nobody can grant them.
    not_answerable: "Vous ne faites partie d'aucun pupitre : aucune réponse ne vous est demandée.",
    cannot_record_for_self:
      "Pour vous-même, répondez depuis le planning : une réponse retirée demande une raison.",
    answer_already_settled: "Ce délai est passé. Modifiez votre réponse plutôt que de l'annuler.",
    // Registration. `spam_suspected` is deliberately vague to the reader as
    // well as to a bot: naming which check failed tells a script how to pass
    // next time, and a real person only needs to know to try again.
    spam_suspected: "Envoi refusé. Rechargez la page et réessayez.",
    registration_not_open: "Les inscriptions ne sont pas encore ouvertes.",
    registration_closed: "Les inscriptions sont closes.",
    option_has_registrations:
      "Impossible de supprimer une option déjà réservée. Annulez d'abord les inscriptions concernées.",
    xlsx_unavailable: "L'export Excel n'est pas disponible sur ce serveur. Utilisez le format CSV.",
    not_found: "Introuvable",
  },
  validation: {
    required: "est requis",
    too_long: "est trop long (maximum {{max}} caractères)",
    invalid_format: "n'est pas dans un format valide",
    invalid_type: "a un type invalide",
    invalid_value: "doit être l'une des valeurs suivantes : {{allowed}}",
    already_taken: "est déjà utilisé",
    too_short: "est trop court (minimum {{min}} caractères)",
    invalid_number: "n'est pas un nombre valide",
    // FIELD-PAIR-SPECIFIC, unlike every other line here: it names the start
    // because `after:startsAt` on the event form is the only `after:` rule in
    // the system. A second one against a different pair — R3's registration
    // window is the obvious candidate — cannot reuse this sentence, and the
    // reason token carries no parameters to fill in the other field's name
    // (see App\Exceptions\ApiError's REASONS map for why it must not). That
    // rule needs its own token and its own copy.
    must_be_after: "doit être après le début",
    // PARAMLESS, and it has to be: the per-booking cap is raised from a
    // closure validator, and App\Exceptions\ApiError's closure-added branch
    // emits `field` and `reason` only — a token whose French interpolated
    // would print a literal {{max}} on a guest's screen.
    too_many_guests: "dépasse le nombre de personnes autorisé par inscription",
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
    // The registration window on an event. Setting the close date is what
    // turns public registration on at all.
    registrationOpensAt: "Ouverture des inscriptions",
    registrationClosesAt: "Clôture des inscriptions",
    registrationMaxGuests: "Personnes par inscription",
    sectionId: "Pupitre",
    committeeFunctionId: "Fonction au comité",
    instructorOfSectionId: "Moniteur du pupitre",
    publicVisible: "Visible publiquement",
    roleIds: "Rôles",
    currentPassword: "Mot de passe actuel",
    newPassword: "Nouveau mot de passe",
    id: "Identifiant",
    lastName: "Nom",
    firstName: "Prénom",
    email: "E-mail",
    subject: "Sujet",
    message: "Message",
    handled: "Traité",
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
    // POST /api/events/series: the list of dates a season is generated from,
    // and the event those dates all share. `template`'s own SUB-fields need no
    // entries — Laravel reports them as `template.endTime` and
    // translateApiError falls back to the last segment, which is already
    // here. This entry is for the parent itself, reachable only if the SPA
    // sends no template at all or sends something that is not an object.
    dates: "Dates",
    template: "Modèle",
    // Attendance. `note` carries the reason a member owes when they take
    // back a yes (C11), so it is the field a validation failure lands on in
    // that dialog.
    status: "Réponse",
    note: "Raison",
    // Registration. The nested paths cost one entry each rather than one
    // per level: translateApiError falls back to a path's last segment, so
    // `choices.0.optionId` resolves to `optionId` and
    // `options.2.priceCents` to `priceCents`.
    tableName: "Table",
    choices: "Choix",
    optionId: "Option",
    quantity: "Quantité",
    options: "Options",
    label: "Intitulé",
    description: "Description",
    priceCents: "Prix",
    sortOrder: "Ordre",
  },

  /**
   * Words that live inside date helpers rather than on a screen.
   *
   * `rangeSeparator` joins the two days of a weekend event in
   * formatEventDateRange. It was a hard-coded " au " inside web/src/lib/date.ts
   * — a translatable string hiding in a formatter, which is exactly where one
   * gets missed.
   */
  dates: {
    rangeSeparator: " au ",
  },

  /**
   * Chrome that belongs to no one screen.
   *
   * "Chargement…" is written out on seven screens and "← Retour au planning"
   * on three. They are here so that the slices still to come (#154, #157)
   * reuse one string rather than adding a seventh copy of it, and so that a
   * fix to one of them is a fix to all.
   *
   * `cancel` IS THE DIALOG'S CANCEL AND NOTHING ELSE. French says "Annuler"
   * for closing a dialog and for undoing something already done; German does
   * not — "Abbrechen" against "Rückgängig". The undo that lives in a toast is
   * `attendance.undo`, deliberately not this key, and merging the two is a
   * mistake that is invisible in French.
   */
  common: {
    loading: "Chargement…",
    backToPlanning: "← Retour au planning",
    cancel: "Annuler",
    save: "Enregistrer",
    busy: "En cours…",
    // The two per-row actions that recur on every list screen — the planning
    // here, the roster and the message archive in #156 and #158. The
    // accessible name that carries WHICH row is per screen and belongs with
    // it; only the visible word is shared.
    edit: "Modifier",
    delete: "Supprimer",
    // "N personne(s)", counted, on the public booking form and on the
    // committee's guest list. events.meta.guests says the same words as a
    // CHIP on an event card and keeps its own key: if a chip ever wants to
    // read "6 Gäste" while a sentence still says "6 Personen", this is the
    // seam that lets it.
    guests_one: "{{count}} personne",
    guests_other: "{{count}} personnes",
    // THE WAY OUT OF A DEAD END, shared by the two screens that are one shape:
    // NotFound and guards.tsx's AccessDenied. It was notFound.backHome until
    // #153, when AccessDenied turned out to have the same link hardcoded —
    // same words, same destination, same job.
    backHome: "Retour à l’accueil",
    // The app failing to start, from SessionProvider's boot gate. i18next is
    // initialised at module scope, so this resolves even though nothing else
    // has rendered yet — see the note at the top of ./index.ts.
    bootFailed: "Le site n’a pas pu démarrer. Veuillez réessayer dans quelques instants.",
    // ConfirmByTypingName's field, which only the roster arms today. Whole
    // sentence, guillemets included, for the reason the whole file repeats.
    typeToConfirm: "Tapez «\u00a0{{phrase}}\u00a0» pour confirmer",
  },

  /**
   * THE DOCUMENT ITSELF: what the browser tab says, and what a search result
   * shows. Applied by ./documentMeta.ts at boot, not rendered by any component.
   *
   * THESE TWO STRINGS ALSO EXIST IN web/index.html, and have to. The shell is
   * one static document serving every path, so it ships a title and a
   * description before any JavaScript runs; this section is what corrects them
   * for the German mount. ./documentMeta.test.ts reads the shell and fails if
   * the French values here and the ones it ships ever drift — without that, a
   * French visitor gets a flash of one title being replaced by a different one
   * and nothing else in the suite notices, because both values are separately
   * valid.
   *
   * WHAT IS *NOT* CORRECTED AT RUNTIME, and why, is written up in the comment
   * block in web/index.html. The short version: og:* is read by crawlers that
   * execute no JavaScript, so rewriting it here would read as fixed without
   * being fixed.
   */
  meta: {
    // DELIBERATELY IDENTICAL IN BOTH CATALOGUES, and this comment is the reason
    // it must not be "translated" later. "Les Canetons de Fribourg" is the
    // band's name — the rest of this file keeps it untouched in German too
    // (band: "Die Canetons", never "Die Entlein") — and "Guggenmusik" is
    // already a German word. There is nothing French left in it to render.
    title: "Guggenmusik Les Canetons de Fribourg",
    // This one does translate, and it is the string a search result shows.
    description:
      "La guggenmusik des enfants de Fribourg, fondée en 2002. De 7 à 18 ans, sans savoir lire la musique — répétitions en général le samedi matin.",
  },

  /**
   * The chrome: the nav, its accessible names, and the footer.
   *
   * The nav arrays in Layout.tsx carry a `labelKey` into this section rather
   * than a label. A module-level `label: t(...)` would be frozen in whatever
   * locale was active when that module was imported — see the initialisation
   * note in ./index.ts.
   */
  nav: {
    primary: "Navigation principale",
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
    gallery: "Galerie",
    login: "Connexion",
    logout: "Déconnexion",
    // The inbox badge's accessible name. {{n}} is i18next interpolation,
    // unlike contactMessages' {name}, which the component replaces by hand.
    //
    // `n` RATHER THAN `count`, and that is not a style choice: i18next treats a
    // `count` option as a PLURAL SELECTOR and looks for `pending_one` /
    // `pending_other` before falling back. Naming the variable anything else
    // keeps it a plain interpolation.
    pending: "{{n}} en attente",
    // THE SWITCHER'S ACCESSIBLE NAMES, and both catalogues carry the SAME
    // value for each. The control always names its target in the TARGET's
    // language, so that somebody who cannot read the current page recognises
    // the way out — which means neither string changes with the page.
    switchToGerman: "Auf Deutsch wechseln",
    switchToFrench: "Passer en français",
    rights: "Tous droits réservés.",
  },

  /**
   * The contact messages archive (/contact-messages).
   *
   * Chrome for the screen the committee reads the public's messages on — not
   * looked up through translateApiError(), so these are read as plain
   * `fr.contactMessages.*` values rather than i18next keys. `handledBy` and
   * `deleteConfirmDescription` carry `{name}`/`{date}` placeholders the
   * component fills in with a plain string replace.
   */
  contactMessages: {
    heading: "Messages",
    // A PLURAL FAMILY, not two keys chosen by a ternary. This was
    // `total > 1 ? messagesWord : messageWord` in ContactMessages.tsx — the
    // French rule, which gives the right "0 message" here and the wrong
    // "0 Nachricht" in German. Eighth of these; see events.owedCount.
    word_one: "message",
    word_other: "messages",
    // {visible} and {total}, filled in by the component. Used once a filter
    // button other than "Tous" is active, so the heading's count never claims
    // more than the rows shown beneath it.
    countFiltered: "{visible} sur {total} {word}",
    filterAll: "Tous",
    filterOpen: "Ouverts",
    filterHandled: "Traités",
    openStatus: "Ouvert",
    handledStatus: "Traité",
    read: "Lire",
    close: "Fermer",
    handle: "Marquer comme traité",
    reopen: "Rouvrir",
    delete: "Supprimer",
    deleteConfirmTitle: "Supprimer ce message ?",
    deleteConfirmDescription:
      "Le message de {name} sera définitivement supprimé. Cette action est irréversible.",
    // {name} and {date}, filled in by the component — the only member the
    // resource itself carries who handled a message and when.
    handledBy: "Traité par {name}, le {date}",
    // THE NORMAL CASE, NOT AN ERROR: an inbox with nothing in it is good news.
    empty: "Aucun message pour l’instant. Le formulaire de contact est prêt à en recevoir.",
    emptyFiltered: "Aucun message ne correspond à ce filtre.",
    loadError: "La liste des messages n’a pas pu être chargée.",
    readError: "Ce message n’a pas pu être chargé. Rechargez la page.",
  },

  /**
   * The inbox worklist (/inbox) and its nav badge.
   *
   * `kinds` maps the API's machine `kind` token to what a committee member
   * reads — never render the token itself. Today there is one source,
   * `contactMessage`; a second source adds a key here, not a branch in the
   * page.
   */
  inbox: {
    heading: "Boîte de réception",
    kinds: {
      contactMessage: "Message du site",
    },
    // THE NORMAL CASE, NOT AN ERROR: nothing waiting means the committee is
    // caught up. Distinct wording from contactMessages.empty on purpose — that
    // one describes an archive with nothing in it yet, this one a worklist
    // that has been cleared.
    empty: "Rien n’attend de réponse. La boîte de réception est à jour.",
    loadError: "La boîte de réception n’a pas pu être chargée.",
  },

  /**
   * Answering for an event, and chasing the people who have not.
   *
   * ONE SECTION FOR TWO SCREENS, because they are two halves of one fact: a
   * member answers from the planning (AttendanceControls) and the committee
   * reads and corrects those answers on the chase list (EventAttendance).
   * `answer.yes` is the same word on both, and a second section is where the
   * two would drift apart.
   *
   * THREE THINGS HERE USED TO LIVE IN THE COMPONENTS, and all three are the
   * lesson placeholders.tbdWhat already carries: grammar and punctuation
   * composed in JSX cannot be translated.
   *
   * 1. `answerInline` exists because the chase list used to lowercase the
   *    button label — `answerLabel(status).toLowerCase()` — to drop it into a
   *    sentence. That is right in French, where "oui" is lowercase
   *    mid-sentence, and wrong in German, where the answer reads as a value
   *    and stays "Ja". Casing is a property of a language, so a locale has to
   *    be able to decide it; a .toLowerCase() in a component decides it for
   *    every locale at once.
   *
   * 2. The guillemets around a reason are PART of the string rather than
   *    wrapped around it. French sets them with a space inside, « comme ça » ;
   *    Swiss Standard German sets them tight, «so». The French form was
   *    hardcoded, so a German reader got French spacing.
   *
   * 3. Every space before a colon or a question mark is a NO-BREAK SPACE
   *    (\u00a0), written as an escape because it is invisible in a diff. It is
   *    French typography and German takes none, which is why "Pupitre : {{x}}"
   *    is one string here and not a label plus ": " in the component.
   */
  attendance: {
    /**
     * The two answers, twice: as a button, and inside a sentence.
     *
     * See note 1 above. French differs between the two forms and German does
     * not, which is precisely why neither language may derive one from the
     * other.
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
    copyForWhatsApp: "Copier pour WhatsApp",
    copied: "Liste copiée. Collez-la dans WhatsApp.",
    copyRefused: "La copie a été refusée par le navigateur.",
    answersHeading: "Réponses",
    sectionLabel: "Pupitre\u00a0: {{name}}",
    recordedByCommittee: "Saisie par le comité.",
    nobodyAnswerable:
      "Personne n’est encore inscrit dans un pupitre, donc personne n’a de réponse à donner.",
    // C14 on screen: what the caller is told in place of buttons aimed at
    // their own row, which the on-behalf endpoint would refuse.
    answerFromPlanning: "Répondez depuis le planning.",
    editFromPlanning: "Modifiable depuis le planning.",
    comingAria: "{{name}} vient",
    notComingAria: "{{name}} ne vient pas",
    correct: "Corriger",
    correctFor: "Corriger la réponse de {{name}}",
    correctDescription:
      "Ce que {{name}} vous a dit. La raison est facultative, et la réponse restera marquée comme saisie par le comité.",
    recordFailed: "La réponse n’a pas pu être enregistrée.",
    // WHOLE SENTENCES, one per answer, rather than one with the answer
    // interpolated: see note 1. The French space before the colon is note 3.
    recordedYes: "{{name}}\u00a0: oui.",
    recordedNo: "{{name}}\u00a0: non.",

    /**
     * One person's answer as one line — the chase list's whole argument.
     *
     * The reason travels WITH the name, which is the difference between a
     * chase list and a headcount. {{note}} is what a member typed: content,
     * rendered verbatim in both locales, and only the quotes around it move.
     */
    line: "{{name}} — {{answer}}",
    lineWithNote: "{{name}} — {{answer}} — «\u00a0{{note}}\u00a0»",
    lineSilent: "{{name}} — sans réponse",

    // AttendanceControls, on the planning: answering for oneself.
    yesComing: "Oui, je viens",
    // {{title}} is the event's own title — content, not translated. Named on
    // purpose: "Je viens" alone is the same accessible name on every card, so
    // a mis-tap sounds exactly like the intended one.
    comingToAria: "Je viens à {{title}}",
    notComingToAria: "Je ne viens pas à {{title}}",
    answered: "Répondu",
    quotedNote: "«\u00a0{{note}}\u00a0»",
    byCommittee: "Réponse saisie par le comité.",
    ownRecordFailed: "Votre réponse n’a pas pu être enregistrée.",
    toastYes: "Vous venez — {{title}}.",
    toastNo: "Vous ne venez pas — {{title}}.",
    // NOT common.cancel: this one takes back an answer already recorded. Both
    // are "Annuler" in French and they are two different German words.
    undo: "Annuler",
    undoFailed: "L’annulation a échoué. Réessayez.",

    // WithdrawDialog — the one answer that is not a single tap (C11).
    reason: "Raison",
    withdrawTitle: "Vous ne venez plus à «\u00a0{{title}}\u00a0»\u00a0?",
    withdrawDescription:
      "Vous aviez annoncé votre présence. Dites au comité pourquoi vous ne venez plus, pour qu’il puisse s’organiser.",
    withdrawConfirm: "Je ne viens pas",
  },

  /**
   * The planning (/events) — the members' area's front door.
   *
   * THREE PLURALS HERE ARE THE POINT OF THE SLICE, not decoration. Each was a
   * `n === 1 ? a : b` in a component, which is a plural RULE written in
   * JavaScript, and the two languages do not share one:
   *
   *   - `meta.answersAria` was `answered === 0 || answered === 1`, which is
   *     the FRENCH rule exactly. French counts zero as singular, "0 réponse";
   *     German does not, "0 Rückmeldungen". That ternary renders correct
   *     French and wrong German, and the obvious "fix" of `=== 1` renders
   *     correct German and wrong French.
   *   - `owedCount` changes the VERB in German — "Es fehlt" against "Es
   *     fehlen" — which no suffix-splicing in a component could reach.
   *   - `calendarGrid.dayAria` and `meta.guests` are the ordinary case, and
   *     they are here rather than in JSX so all four read the same way.
   *
   * i18next resolves `_one`/`_other` from `count` using the ACTIVE language's
   * CLDR rule, so each locale gets its own. See `Unplural` in ./index.ts for
   * why `t()` takes the bare key and refuses the suffixed ones.
   *
   * ZERO IS NOT A PLURAL FORM in either language, so where zero says something
   * ELSE — `allAnswered`, `meta.noGuests` — it is a separate key and the
   * component branches on it. That is not the same as branching on one.
   */
  events: {
    heading: "Planning",
    add: "Ajouter un événement",
    addSeries: "Ajouter une série",
    showPast: "Voir les événements passés",
    showPlanning: "Voir le planning",
    calendar: "Calendrier",
    list: "Liste",
    dayFiltered: "Filtré sur un jour.",
    showAll: "Voir tout le planning",
    loadFailed: "Le planning n’a pas pu être chargé.",
    empty: "Aucun événement au planning.",
    emptyPast: "Aucun événement passé.",
    // {{action}} IS ANOTHER KEY'S VALUE, not this sentence's own copy of it.
    // The hint quotes the button beside it, so spelling the label out twice
    // is how the two come to disagree — and the guillemets are French
    // typography, which German does not take.
    emptyHint:
      "Ajoutez un événement, ou générez toute une saison d’un coup avec «\u00a0{{action}}\u00a0».",
    owedHeading: "À répondre",
    allAnswered: "Tout est répondu.",
    owedCount_one: "Il reste {{count}} événement sans réponse.",
    owedCount_other: "Il reste {{count}} événements sans réponse.",
    pastHeading: "Événements passés",
    restHeading: "Le reste du planning",

    // The per-row actions. Each visible word is paired with an accessible
    // name carrying the event, so a screen-reader user hears which row they
    // are on rather than the eleventh "Modifier" of the page.
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

    /** EventCard's detail list. `attireUnset` is also quoted by #166's form. */
    card: {
      location: "Lieu\u00a0:",
      attire: "Tenue\u00a0:",
      attireUnset: "Non précisée",
    },

    /** EventMeta's chips — what the committee sees and a player does not. */
    meta: {
      public: "Public",
      // Always the plural word: it is a RATIO, "3/12 réponses", not a count
      // of one thing. The accessible name below is the counted sentence.
      answers: "{{answered}}/{{answerable}} réponses",
      answersAria_one: "{{count}} réponse sur {{total}}",
      answersAria_other: "{{count}} réponses sur {{total}}",
      noGuests: "Aucune inscription",
      guests_one: "{{count}} personne",
      guests_other: "{{count}} personnes",
    },

    /**
     * The month grid (C8: an overview at a desk, never the phone's list).
     *
     * `dayAria` takes the date ALREADY FORMATTED, because the formatter is
     * locale-aware and lives in the component — see EventCalendar.tsx.
     */
    calendarGrid: {
      previousMonth: "Mois précédent",
      nextMonth: "Mois suivant",
      dayAria_one: "{{date}}, {{count}} événement",
      dayAria_other: "{{date}}, {{count}} événements",
    },
  },

  /**
   * The event forms, and the three pages that mount them (#166).
   *
   * THESE ARE CONTROL LABELS AND THEY ARE NOT `fields.*`. That section exists
   * for translateApiError: it turns the API's `errors[].field` token into a
   * noun so a refusal reads "Début doit être après la fin". The labels here
   * name CONTROLS, and the code already proves the two must be free to
   * differ:
   *
   *   - `startDate` is labelled "Date de début" and carries the problem for
   *     `startsAt`, whose field noun is "Début". One instant is edited by two
   *     boxes, so no label can be the field's own name without lying about
   *     which box it is.
   *   - `endTime` is labelled "Heure de fin" and carries `endsAt`'s refusal,
   *     deliberately — see the comment at that field in EventForm.tsx. Under
   *     a shared key that message would become "Heure de fin doit être après
   *     le début", which names the box rather than the thing.
   *   - `seriesForm.from`/`to` ("Du"/"Au") are not fields at all: they drive
   *     the generator and are never sent.
   *
   * So the rule, which #156, #157 and #153 all meet again: A CONTROL'S LABEL
   * LIVES WITH ITS SCREEN, a field's noun lives in `fields`. Where the two
   * happen to be the same word today — "Titre", "Lieu" — that is a
   * coincidence of French, not a shared meaning, and coupling them buys
   * nothing a rename would not take back.
   */
  eventForm: {
    newHeading: "Nouvel événement",
    editHeading: "Modifier l’événement",
    saveFailed: "L’enregistrement a échoué.",
    loadFailed: "Cet événement n’a pas pu être chargé.",
    loadFailedReload: "Cet événement n’a pas pu être chargé. Rechargez la page.",

    addTitle: "Ajouter un événement",
    editTitle: "Modifier {{title}}",
    // NOT common.busy. French says "Enregistrement…" here and "En cours…" in
    // a dialog, and keeping one key would change the other screen's wording.
    saving: "Enregistrement…",

    title: "Titre",
    startDate: "Date de début",
    startTime: "Heure de début",
    endDate: "Date de fin",
    endTime: "Heure de fin",
    location: "Lieu",
    attire: "Tenue",
    // {{unset}} IS events.card.attireUnset, the very string the card renders.
    // Spelled out here as well, the hint and the card could come to disagree
    // about what an empty field looks like — and the guillemets are French
    // typography, which German does not take.
    attireHint:
      "Laissez vide si la tenue n’est pas encore décidée\u00a0: la carte affichera «\u00a0{{unset}}\u00a0».",
    isPublic: "Visible sur le site public",
    notes: "Remarques",

    registrationsLegend: "Inscriptions du public",
    registrationsHint:
      "Renseignez une date de clôture pour ouvrir cet événement aux inscriptions. Laissez-la vide si personne ne s’inscrit\u00a0: c’est le cas de presque tout le planning.",
    closesDate: "Clôture des inscriptions",
    closesTime: "Heure de clôture",
    opensDate: "Ouverture des inscriptions",
    opensTime: "Heure d’ouverture",
    opensHint:
      "Sans date d’ouverture, le formulaire est en ligne dès maintenant. Renseignez-la pour préparer un événement dont les inscriptions ne doivent pas encore apparaître.",
    maxGuests: "Personnes par inscription",
    maxGuestsHint:
      "Le maximum qu’une seule inscription peut couvrir, entre 1 et 100. Laissez vide pour ne pas limiter. La salle, elle, n’est jamais limitée\u00a0: le comité surveille la liste et avance la clôture si nécessaire.",
  },

  /**
   * The season generator (/events/new/series).
   *
   * `weekdays` REPLACES A MODULE-SCOPE ARRAY OF FRENCH LABELS in
   * SeriesForm.tsx — the `labelKey`-not-`label` rule, which Layout.tsx's NAV
   * already follows and this file did not. They are spelled out rather than
   * asked of Intl because `Intl.DateTimeFormat("fr-CH", { weekday: "long" })`
   * answers "lundi", lowercase, and the select has always read "Lundi";
   * deriving them would change French output to fix a German bug.
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
    // {{n}}, NOT {{count}}: a `count` option makes i18next look for a plural
    // form, and this sentence has none to find — it is shown only above the
    // cap, so it is always plural. Same reason nav.pending uses {{n}}.
    tooMany:
      "{{n}} dates sélectionnées\u00a0: {{cap}} au maximum par série. Décochez-en ou raccourcissez la période.",

    creating: "Création…",
    create_one: "Créer {{count}} événement",
    create_other: "Créer {{count}} événements",
    createdCount_one: "{{count}} événement créé.",
    createdCount_other: "{{count}} événements créés.",
    // ITS OWN KEY, not events.showPlanning. That one toggles a list between
    // upcoming and past; this one navigates to the planning after a series
    // was created. Same three words in French, two different jobs.
    seePlanning: "Voir le planning",
    another: "Créer une autre série",
  },

  /**
   * The roster (/members) and the three dialogs it opens.
   *
   * EVERY ACCESSIBLE NAME CARRIES THE PERSON. `deleteTitle` and `resetTitle`
   * are each used TWICE — once as a button's screen-reader text and once as
   * the title of the dialog it opens — so the two cannot come to disagree,
   * and a screen-reader user hears which row they are on rather than the
   * twelfth bare "Supprimer" on the page. Members.tsx's MemberActions
   * docblock is where that requirement is argued.
   *
   * "CETTE PERSONNE", NOT THE NAME, in both descriptions. The French reason is
   * grammatical and recorded at the delete dialog in Members.tsx (#91): an
   * interpolated name drags a participle that must agree with it, and the
   * roster holds no gender field to agree from. German inflects no participle
   * here, so it could have interpolated the name — it does not, because the
   * title already names the person and saying it twice in one dialog is worse
   * in both languages. Same sentence, same shape, two different reasons.
   */
  members: {
    heading: "Membres",
    // The count beside the heading, off the server's `meta.total`. It was
    // `rosterCount > 1 ? "s" : ""` in the component — the FRENCH plural rule
    // again, which gives the correct "0 membre" here and the wrong
    // "0 Mitglied" in German. Fourth one of these; see events.owedCount.
    count_one: "{{count}} membre",
    count_other: "{{count}} membres",
    add: "Ajouter une personne",

    saveFailed: "L’enregistrement a échoué.",
    actionFailed: "L’action a échoué.",
    loadFailed: "Cette personne n’a pas pu être chargée.",
    loadFailedReload: "Cette personne n’a pas pu être chargée. Rechargez la page.",
    incompleteSave: "L’enregistrement est incomplet\u00a0: rechargez la page.",
    rosterLoadFailed: "La liste des membres n’a pas pu être chargée.",

    // The card's labelled fields. The label is what the column head used to
    // do before #130 made the card the only layout, so it is part of the
    // sentence rather than chrome — and its colon is spaced in French only.
    usernameLabel: "Identifiant\u00a0: {{value}}",
    sectionLabel: "Pupitre\u00a0: {{value}}",
    rolesLabel: "Rôles\u00a0: {{value}}",
    noSection: "Aucun pupitre",
    noRoles: "Aucun rôle",

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

    /** The one-time password reveal (§4.4). */
    generatedTitle: "Mot de passe de {{name}}",
    generatedDescription:
      "Notez-le ou lisez-le à la personne maintenant\u00a0: il ne sera plus jamais affiché. Elle devra le remplacer à sa première connexion.",
    generatedAck: "J’ai noté le mot de passe",

    /**
     * The account-state pills (#94), and the date beneath them.
     *
     * `neverUsedName` and `provisionalName` are the accessible names: a screen
     * reader reaches "Provisoire" with no card around it to supply the noun.
     *
     * THE FRENCH LABEL AVOIDS A PARTICIPLE THAT WOULD HAVE TO AGREE — "jamais
     * utilisé" agrees with `le compte`, where "jamais connecté" would have to
     * agree with the member. German has no such constraint, which is worth
     * knowing before somebody "simplifies" the French to match it.
     */
    neverUsed: "Jamais utilisé",
    neverUsedName: "Compte jamais utilisé",
    provisional: "Provisoire",
    provisionalName: "Mot de passe provisoire",
    // {{date}} comes from formatLastLogin, which is already locale-aware
    // (#151). The preposition around it is not, which is why the whole
    // sentence is here and not glued together in loginStatus.ts.
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
    // ITS OWN KEY, not eventForm.isPublic, though the French is word for word
    // the same. There it is an EVENT appearing on the public agenda; here it
    // is a PERSON appearing on /band. Two facts that share a sentence in
    // French today and have no reason to stay married.
    publicVisible: "Visible sur le site public",
    rolesLegend: "Rôles",
    rolesAfterSave:
      "Les rôles s’attribuent après avoir enregistré la personne\u00a0: donner des droits est une action à part, qui coupe les sessions en cours et laisse une trace.",
    saving: "Enregistrement…",
  },

  /**
   * The PUBLIC booking form (/events/:id/book).
   *
   * THE ONE SCREEN IN THIS SLICE A STRANGER REACHES, and the reason the whole
   * effort exists: a German speaker in Fribourg booking a seat at the souper,
   * on a phone, at the hall. It carries the same weight as the slice-2 public
   * pages.
   *
   * `fields` REPLACES A MODULE-SCOPE ARRAY OF FRENCH LABELS in
   * EventBooking.tsx — `label`, not `labelKey`, frozen at import. Third time:
   * Layout's NAV (#151), SeriesForm's WEEKDAYS (#166), this.
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
    // DELIBERATELY VAGUE, as the French is: a closed event and a mistyped id
    // answer the same way, so a stranger cannot enumerate what exists.
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
    optionalHint:
      "L’adresse et la table sont facultatives. La table, c’est avec qui vous aimeriez être placé.",
    nothingOffered: "Rien n’est encore proposé pour cette soirée. Revenez d’ici quelques jours.",

    chooseSomeone: "Choisissez au moins une personne.",
    // The running total, when any chosen option carries a price. {{guests}} is
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

    /**
     * THE TWO "ANNULER"S, and they are not one key.
     *
     * `cancel` is the per-row button that CANCELS A BOOKING; common.cancel
     * closes a form without doing anything. Identical in French, which is why
     * #115 wants the French half renamed — and why German cannot wait for
     * that: "stornieren" against "abbrechen". Keeping them apart here leaves
     * #115 free to rename the French whenever it lands, without deciding
     * anything twice. Third instance of this shape, after
     * attendance.undo/common.cancel.
     */
    cancel: "Annuler",
    // TWO KEYS, NOT ONE: the dialog ASKS ("… de X Y ?", with the space
    // French puts before a question mark) and the button LABELS ("… de X Y").
    // They read as the same sentence and are not the same string — which the
    // first attempt at this slice got wrong by sharing a key.
    cancelAria: "Annuler l’inscription de {{name}}",
    cancelTitle: "Annuler l’inscription de {{name}}\u00a0?",
    cancelDescription:
      "L’inscription et tout ce qu’elle a commandé seront supprimés. La personne n’est pas prévenue. Cette action est définitive.",
    cancelConfirm: "Annuler l’inscription",

    amend: "Corriger",
    // Used as the row button's accessible name AND as the amend form's
    // heading, so the two cannot disagree — the members.deleteTitle trick.
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
    // The visible button words. Their accessible names are moveUp/moveDown/
    // remove above, which carry the option — the two are not the same string.
    up: "Monter",
    down: "Descendre",
    removeShort: "Retirer",
    optionNumber: "Option {{n}}",
    addOption: "Ajouter une option",
    price: "Prix en francs",

    // {{option}} is what the committee typed, or `thisOption` for a row that
    // has no title yet — content either way, rendered verbatim.
    moveUp: "Monter {{option}}",
    moveDown: "Descendre {{option}}",
    remove: "Retirer {{option}}",
    thisOption: "cette option",

    saved: "Enregistré.",
    saving: "Enregistrement…",
  },

  /**
   * Signing in (/login).
   *
   * THE HEADING IS `nav.login`, NOT A KEY OF ITS OWN. The nav item and the
   * page it opens are the same word, and this file already pairs them that
   * way for the chase list, the guest list and the options screen — one key,
   * so a rename cannot leave the link and its destination disagreeing.
   *
   * The field labels ARE their own keys, not `fields.username`/`password`.
   * That section is the error vocabulary translateApiError reads; these name
   * controls. The rule and the evidence for it are at `eventForm` (#166).
   */
  auth: {
    username: "Identifiant",
    password: "Mot de passe",
    signIn: "Se connecter",
    signingIn: "Connexion…",
    loginFailed: "La connexion a échoué.",
  },

  /**
   * The account screen (/account), which today is a password form.
   *
   * #100 and #125 are about to make it an actual account page and move the
   * password change to its own route. These keys move with it — the cheaper
   * direction, and the reason this slice did not wait: a restructure that
   * moves KEYS beats one that moves literals and then has to translate them.
   */
  account: {
    heading: "Mon compte",
    // EXPLAINED, NOT MERELY ENFORCED: a member bounced back here by the gate
    // with no reason given would think the site was broken.
    provisionalNotice:
      "Votre mot de passe a été fourni par le comité et doit être remplacé avant de continuer.",
    currentPassword: "Mot de passe actuel",
    newPassword: "Nouveau mot de passe",
    confirmPassword: "Confirmer le nouveau mot de passe",
    // Checked in the browser before anything is sent, so it is this screen's
    // own sentence rather than one of the API's error tokens.
    mismatch: "Les deux mots de passe ne correspondent pas.",
    changed: "Votre mot de passe a été changé.",
    change: "Changer le mot de passe",
    changing: "Changement…",
    changeFailed: "Le changement de mot de passe a échoué.",
  },

  /**
   * The refusal a route guard renders (components/guards.tsx).
   *
   * ITS OWN KEYS, NOT `errors.access_denied`. That token is what the API
   * sends and translateApiError renders inside a form; this is a whole screen
   * with a heading and a way out. They read the same in French today and have
   * no reason to stay married — the same call `memberForm.publicVisible`
   * makes.
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
    heroSub:
      "De 7 à 18 ans — et pas besoin de connaître la musique : les moniteurs apprennent les morceaux registre par registre, aux répétitions du samedi matin.",
    discover: "Découvrir les Canetons",
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
   * The public schedule — /agenda's own heading and empty state, and
   * AgendaEntry/PublicAgenda's shared copy (the front page's block and the
   * full page render the same entries).
   */
  agenda: {
    heading: "Où nous voir",
    intro: "Les prochaines sorties des Canetons. Venez nous écouter !",
    emptyNotice:
      "Les prochaines dates ne sont pas encore publiées. Revenez bientôt, ou écrivez au comité pour nous réserver.",
    seeAll: "Toutes les dates",
    register: "S’inscrire",
    // {{title}} is the event's own title — content, not translated. Only the
    // verb moves between locales; see PublicAgenda.tsx.
    registerFor: "S’inscrire — {{title}}",
  },

  /** /band, register by register. */
  band: {
    heading: "Nos Canetons",
    instructors: "Moniteurs :",
    registersNav: "Registres",
    patronsHeading: "Le parrain et la marraine",
    patronsAlt: "Le parrain et la marraine des Canetons",
    // THE NAMES ARE CONTENT; THE "et" BETWEEN THEM IS NOT. Left hardcoded
    // in Band.tsx by #152, so /de/band read "Richard Hertig et Annick
    // Bürgisser" — no accent in "et", so no grep over that file found it.
    patrons: "Richard Hertig et Annick Bürgisser",
  },

  /** /committee — who to write to, and who holds which seat. */
  committee: {
    heading: "Le comité",
    contactHeading: "Contact des Canetons",
    writeToCommittee: "Écrire au comité",
    booking: "Pour réserver les Canetons :",
  },

  /** /join — how to join, for a parent or a curious child. */
  join: {
    heading: "Tu veux commencer la guggen ?",
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

  /** /contact — the only screen a stranger can make the server do work with. */
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
      lastName: "Nom:",
      firstName: "Prénom:",
      email: "E-mail:",
      subject: "Sujet:",
      message: "Contenu du message:",
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
   * PhotoPending takes a WHOLE SENTENCE, not a fragment: "Nouvelle photo {what}
   * à venir" glued a French preposition to a database value, which cannot be
   * translated once German needs a genitive instead of a preposition. Each
   * screen picks the sentence that fits what it is missing; `photoRegister`
   * carries the one dynamic value, a register's own name, which is content and
   * renders verbatim in both locales.
   *
   * Tbd's `what` is the same fix applied to the same trap: a caller passes a
   * translated string, never a fragment glued together outside the catalogue.
   */
  placeholders: {
    tbd: "••• à compléter",
    // The "with a subject" form is a WHOLE string, not the bare one plus
    // punctuation glued on in the component. French puts a space before a
    // colon and German does not, so a hardcoded " : " renders as
    // "noch zu ergänzen : Name" on a German page -- French typography on
    // German text. Same lesson as formatEventWhen: punctuation is part of
    // the sentence, so it belongs in the catalogue.
    tbdWhat: "••• à compléter : {{what}}",
    photoBand: "Nouvelle photo des Canetons au complet à venir !",
    photoConcert: "Nouvelle photo des Canetons en concert à venir !",
    photoRegister: "Nouvelle photo du registre {{name}} à venir !",
    registerFirstNames: "prénoms du registre",
    bookingNumber: "numéro pour les prestations",
    committeeSeats: "les fonctions et les noms du comité",
    joinContact: "nom et numéro",
  },
};
