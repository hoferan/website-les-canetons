import i18next from 'i18next';

i18next.init({
  lng: "fr",
  fallbackLng: "fr",
  resources: {
    fr: {
      translation: {
        errors: {
          validation_failed: "Le formulaire contient des erreurs.",
          method_not_allowed: "Méthode non autorisée",
          not_authenticated: "Non authentifié",
          access_denied: "Accès refusé",
          invalid_credentials: "Nom d'utilisateur ou mot de passe incorrect",
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
        },
        fields: {
          date: "Date",
          title: "Titre",
          startTime: "Heure de début",
          endTime: "Heure de fin",
          location: "Lieu",
          attire: "Tenue",
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
      },
    },
  },
});

var API_ERROR_FALLBACK = "Une erreur est survenue. Veuillez réessayer.";

// Translates a parsed API error response body ({error, code, fields?}) into
// French for display. The frontend's own data stays English throughout —
// this is the only place French text is computed. Any unknown code/reason/
// field falls back to a generic message rather than leaking an English or
// raw i18next key to the user (i18next's own miss behavior is to return the
// key itself, which this function never lets reach the UI).
export function translateApiError(body) {
  var code = body && body.code;
  var rawFields = (body && body.fields) || [];

  var fields = rawFields.map(function (entry) {
    var fieldKey = "fields." + entry.field;
    var fieldLabel = i18next.exists(fieldKey) ? i18next.t(fieldKey) : entry.field;
    var reasonKey = "validation." + entry.reason;
    var reasonText = i18next.exists(reasonKey)
      ? i18next.t(reasonKey, entry.params || {})
      : API_ERROR_FALLBACK;
    return { field: entry.field, message: fieldLabel + " " + reasonText };
  });

  var errorKey = "errors." + code;
  var message = i18next.exists(errorKey) ? i18next.t(errorKey) : API_ERROR_FALLBACK;

  return { message: message, fields: fields };
}
