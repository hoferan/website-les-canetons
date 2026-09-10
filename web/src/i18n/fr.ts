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
    event_not_found: "Événement introuvable",
    invalid_session: "Session invalide",
    service_unavailable: "Service indisponible",
    captcha_failed: "Vérification anti-robot échouée, veuillez réessayer.",
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
    must_be_after: "doit être après le début",
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
  },
};
