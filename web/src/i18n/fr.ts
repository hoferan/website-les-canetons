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

    invalid_session: "Session invalide",
    service_unavailable: "Service indisponible",

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
    committeeTitle: "Fonction au comité",
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
};
