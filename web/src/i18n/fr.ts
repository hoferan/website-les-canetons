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
  errors: {
    validation_failed: "Le formulaire contient des erreurs.",
    method_not_allowed: "Méthode non autorisée",
    not_authenticated: "Non authentifié",
    access_denied: "Accès refusé",
    invalid_credentials: "Nom d'utilisateur ou mot de passe incorrect",
    too_many_attempts: "Trop de tentatives. Veuillez réessayer dans une minute.",
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
    invalid_number: "n'est pas un nombre valide",
  },
  fields: {
    date: "Date",
    title: "Titre",
    startTime: "Heure de début",
    endTime: "Heure de fin",
    location: "Lieu",
    attire: "Tenue",
    weekend: "Week-end",
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
