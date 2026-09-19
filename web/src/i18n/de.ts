import { fr } from "./fr";

/**
 * The Swiss Standard German vocabulary, mirroring fr.ts key for key.
 *
 * TYPED `typeof fr` ON PURPOSE. A missing or extra key is then a build error,
 * which is the cheapest parity guarantee available and costs nothing to
 * maintain. web/src/i18n/catalogues.test.ts prints the offending paths, because
 * a deep structural TS error on this shape is close to unreadable.
 *
 * THE SAME PARSING RULES AS fr.ts APPLY. api/tests/Feature/
 * ApiErrorVocabularyTest.php reads this file too: keys must stay BARE
 * IDENTIFIERS and the object literal must stay free of TypeScript syntax. The
 * `: typeof fr` annotation sits outside the braces and is fine.
 *
 * SWISS STANDARD GERMAN: `ss` and never `ß`. Formal `Sie` throughout, mirroring
 * the French, which is `vous` even in the members' area — so every string here
 * is a 1:1 translation of its French counterpart and the two stay mechanically
 * comparable.
 */
export const de: typeof fr = {
  roles: {
    direction: {
      // Not translated: the band's own name for the group, as in the French.
      label: "Team Direction",
      hint: "Organisiert die Anlässe, verwaltet die Mitglieder und sieht die Rückmeldungen ein.",
    },
    committee: {
      label: "Vorstand",
      hint: "Sieht die Anmeldeliste ein.",
    },
  },

  errors: {
    generic: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
    validation_failed: "Das Formular enthält Fehler.",
    method_not_allowed: "Methode nicht erlaubt",
    not_authenticated: "Nicht angemeldet",
    access_denied: "Zugriff verweigert",
    invalid_credentials: "Benutzername oder Passwort ist falsch",
    too_many_attempts: "Zu viele Versuche. Bitte versuchen Sie es später erneut.",
    reauth_failed: "Falsches Passwort. Diese Aktion muss mit Ihrem Passwort bestätigt werden.",
    cannot_delete_self: "Sie können Ihr eigenes Konto nicht löschen.",
    cannot_demote_self: "Sie können sich Ihre eigenen Administrationsrechte nicht entziehen.",
    cannot_remove_last_administrator: "Das ist die letzte Person, die Mitglieder verwalten kann.",
    // Sagt, was zu tun ist, ohne die Regel zu erklären: ein vom Vorstand
    // ausgegebenes Passwort wurde mündlich mitgeteilt, ein «Wechsel» auf
    // dasselbe Passwort liesse das Konto also auf einem bereits gehörten.
    password_unchanged: "Das ist bereits Ihr aktuelles Passwort. Wählen Sie ein anderes.",

    invalid_session: "Ungültige Sitzung",
    // Eine Anfrage, die keine Sitzung eröffnen kann: ein erneuter Versuch
    // bringt nichts, anders als bei invalid_session.
    stateful_request_required: "Diese Anfrage kann keine Sitzung eröffnen.",
    rate_limited: "Zu viele Anfragen. Bitte warten Sie, bevor Sie es erneut versuchen.",
    service_unavailable: "Dienst nicht verfügbar",

    idempotency_key_required:
      "Dieses Formular konnte nicht gesendet werden. Laden Sie die Seite neu.",
    idempotency_key_invalid:
      "Dieses Formular konnte nicht gesendet werden. Laden Sie die Seite neu.",
    idempotency_key_reuse:
      "Das Senden läuft bereits. Warten Sie einen Moment, bevor Sie es erneut versuchen.",

    if_match_required: "Diese Änderung konnte nicht überprüft werden. Laden Sie die Seite neu.",
    if_match_failed:
      "Jemand hat diesen Eintrag inzwischen geändert. Laden Sie neu, um die Änderungen zu sehen, und versuchen Sie es dann erneut.",

    not_answerable: "Sie gehören keinem Register an: Von Ihnen wird keine Rückmeldung erwartet.",
    cannot_record_for_self:
      "Für sich selbst antworten Sie über die Planung: Eine zurückgezogene Zusage benötigt eine Begründung.",
    answer_already_settled:
      "Diese Frist ist abgelaufen. Ändern Sie Ihre Antwort, statt sie zurückzuziehen.",
    spam_suspected: "Senden abgelehnt. Laden Sie die Seite neu und versuchen Sie es erneut.",
    registration_not_open: "Die Anmeldung ist noch nicht geöffnet.",
    registration_closed: "Die Anmeldung ist geschlossen.",
    option_has_registrations:
      "Eine bereits gebuchte Option kann nicht gelöscht werden. Stornieren Sie zuerst die betroffenen Anmeldungen.",
    xlsx_unavailable:
      "Der Excel-Export ist auf diesem Server nicht verfügbar. Verwenden Sie das CSV-Format.",
    not_found: "Nicht gefunden",
  },

  validation: {
    required: "ist erforderlich",
    too_long: "ist zu lang (maximal {{max}} Zeichen)",
    invalid_format: "hat kein gültiges Format",
    invalid_type: "hat einen ungültigen Typ",
    invalid_value: "muss einer der folgenden Werte sein: {{allowed}}",
    already_taken: "ist bereits vergeben",
    too_short: "ist zu kurz (mindestens {{min}} Zeichen)",
    invalid_number: "ist keine gültige Zahl",
    must_be_after: "muss nach dem Beginn liegen",
    // PARAMETERLOS, wie im Französischen: die Obergrenze kommt aus einem
    // Closure-Validator, der nur `field` und `reason` liefert — ein
    // interpoliertes {{max}} würde wörtlich auf dem Bildschirm stehen.
    too_many_guests: "überschreitet die pro Anmeldung zulässige Personenzahl",
  },

  fields: {
    date: "Datum",
    title: "Titel",
    startsAt: "Beginn",
    endsAt: "Ende",
    startTime: "Startzeit",
    endTime: "Endzeit",
    location: "Ort",
    attire: "Kleidung",
    weekend: "Wochenende",
    isPublic: "Öffentlich sichtbar",
    notes: "Bemerkungen",
    registrationOpensAt: "Anmeldebeginn",
    registrationClosesAt: "Anmeldeschluss",
    registrationMaxGuests: "Personen pro Anmeldung",
    sectionId: "Register",
    committeeFunctionId: "Funktion im Vorstand",
    instructorOfSectionId: "Registerleitung",
    publicVisible: "Öffentlich sichtbar",
    roleIds: "Rollen",
    currentPassword: "Aktuelles Passwort",
    newPassword: "Neues Passwort",
    id: "Benutzername",
    lastName: "Nachname",
    firstName: "Vorname",
    email: "E-Mail",
    subject: "Betreff",
    message: "Nachricht",
    handled: "Erledigt",
    first_name: "Vorname",
    last_name: "Nachname",
    address: "Adresse",
    phone: "Telefon",
    table_name: "Tisch",
    menus: "Menüs",
    username: "Benutzername",
    password: "Passwort",
    eventId: "Anlass",
    participation: "Teilnahme",
    dates: "Termine",
    template: "Vorlage",
    status: "Antwort",
    note: "Begründung",
    tableName: "Tisch",
    choices: "Auswahl",
    optionId: "Option",
    quantity: "Anzahl",
    options: "Optionen",
    label: "Bezeichnung",
    description: "Beschreibung",
    priceCents: "Preis",
    sortOrder: "Reihenfolge",
  },

  dates: {
    rangeSeparator: " bis ",
  },

  nav: {
    primary: "Hauptnavigation",
    menu: "Menü",
    menuLabel: "Navigationsmenü",
    join: "Mitmachen",
    agenda: "Wo Sie uns sehen",
    band: "Die Canetons",
    committee: "Vorstand",
    history: "Geschichte",
    contact: "Kontakt",
    events: "Anlässe",
    members: "Mitglieder",
    inbox: "Posteingang",
    gallery: "Galerie",
    login: "Anmelden",
    logout: "Abmelden",
    pending: "{{n}} ausstehend",
    rights: "Alle Rechte vorbehalten.",
  },

  contactMessages: {
    heading: "Nachrichten",
    messageWord: "Nachricht",
    messagesWord: "Nachrichten",
    countFiltered: "{visible} von {total} {word}",
    filterAll: "Alle",
    filterOpen: "Offen",
    filterHandled: "Erledigt",
    openStatus: "Offen",
    handledStatus: "Erledigt",
    read: "Lesen",
    close: "Schliessen",
    handle: "Als erledigt markieren",
    reopen: "Wieder öffnen",
    delete: "Löschen",
    deleteConfirmTitle: "Diese Nachricht löschen?",
    deleteConfirmDescription:
      "Die Nachricht von {name} wird endgültig gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.",
    handledBy: "Erledigt von {name} am {date}",
    // DER NORMALFALL, KEIN FEHLER: ein leerer Posteingang ist eine gute
    // Nachricht.
    empty: "Noch keine Nachrichten. Das Kontaktformular ist bereit.",
    emptyFiltered: "Keine Nachricht entspricht diesem Filter.",
    loadError: "Die Nachrichtenliste konnte nicht geladen werden.",
    readError: "Diese Nachricht konnte nicht geladen werden. Laden Sie die Seite neu.",
  },

  inbox: {
    heading: "Posteingang",
    kinds: {
      contactMessage: "Nachricht von der Website",
    },
    empty: "Nichts wartet auf eine Antwort. Der Posteingang ist auf dem neuesten Stand.",
    loadError: "Der Posteingang konnte nicht geladen werden.",
  },

  home: {
    hero: "Die Kinder-Guggenmusik aus Freiburg, seit 2002.",
    heroSub:
      "Von 7 bis 18 Jahren — und ganz ohne Musikkenntnisse: Die Leiter bringen die Stücke Register für Register bei, an den Proben am Samstagvormittag.",
    discover: "Die Canetons entdecken",
    destinations: {
      join: {
        title: "Mitmachen",
        description: "Die gesuchten Instrumente, die Zeiten und die Alterskriterien.",
      },
      band: {
        title: "Die Canetons",
        description: "Die Musizierenden der Band, Register für Register.",
      },
      history: {
        title: "Unsere Geschichte",
        description: "Wie die Gugge 2002 entstanden ist, und wer sie seither geleitet hat.",
      },
      committee: {
        title: "Der Vorstand",
        description: "Uns schreiben, die Canetons buchen, und wer was macht.",
      },
    },
  },

  agenda: {
    heading: "Wo Sie uns sehen",
    intro: "Die nächsten Auftritte der Canetons. Kommen Sie uns zuhören!",
    emptyNotice:
      "Die nächsten Termine sind noch nicht veröffentlicht. Schauen Sie bald wieder vorbei, oder schreiben Sie dem Vorstand, um uns zu buchen.",
    seeAll: "Alle Termine",
    // "Jetzt anmelden", not the bare "Anmelden": German uses that one word
    // for BOTH logging in and signing up for something, and nav.login is
    // already "Anmelden" -- on /agenda the two would sit on the same screen
    // meaning different things. French has no such collision ("Se connecter"
    // against "S'inscrire"), so this is a place the mirror deliberately is
    // not word-for-word.
    register: "Jetzt anmelden",
    registerFor: "Jetzt anmelden — {{title}}",
  },

  band: {
    heading: "Unsere Canetons",
    instructors: "Leiter:",
    registersNav: "Register",
    patronsHeading: "Der Götti und die Gotte",
    patronsAlt: "Der Götti und die Gotte der Canetons",
  },

  committee: {
    heading: "Der Vorstand",
    contactHeading: "Kontakt der Canetons",
    writeToCommittee: "Dem Vorstand schreiben",
    booking: "Um die Canetons zu buchen:",
  },

  join: {
    // "du", NOT "Sie", and that is deliberate on BOTH sides. The French
    // reads "Tu veux commencer la guggen ?" because this page addresses
    // children directly -- the band takes players from 7 to 18. The rule is
    // written up at web/src/pages/Home.tsx:65, which explains why the front
    // page stays impersonal rather than following suit. It is the only
    // informal address in either catalogue; do not "fix" it.
    heading: "Willst du mit der Gugge anfangen?",
    intro:
      "Wir suchen laufend ein paar Bläser, die sich die Lunge aus dem Leib blasen und unseren Perkussionen «Konkurrenz» machen!",
    facts: {
      instruments: {
        heading: "Gesuchte Instrumente",
        trumpet: "Trompete",
        trombone: "Posaune",
        sousaphone: "Sousaphon",
        euphonium: "Euphonium",
      },
      schedule: {
        heading: "Zeiten",
        day: "Samstagvormittags",
        time: "Von 10 bis 12 Uhr",
      },
      age: {
        heading: "Alterskriterien",
        range: "Ab 7 Jahren im Kalenderjahr bis zum Alter von 18 Jahren",
      },
    },
    location: "Ort",
    locationArea: "Freiburger Unterstadt",
    contacts: "Kontakte",
    contactMeanwhile: "In der Zwischenzeit schreiben Sie uns über die",
    contactPageLink: "Kontaktseite",
  },

  contact: {
    heading: "Kontakt",
    intro:
      "Eine Frage, eine Anfrage für einen Auftritt, oder Lust, uns beizutreten? Schreiben Sie dem Vorstand.",
    memberNotice:
      "Der Vorstand ist direkt erreichbar, per Telefon oder WhatsApp — oft schneller als eine von hier gesendete Nachricht. Dieses Formular steht Ihnen natürlich weiterhin zur Verfügung.",
    sendFailed: "Das Senden des Formulars ist fehlgeschlagen. Bitte versuchen Sie es erneut.",
    submit: "Senden",
    sentHeading: "Nachricht gesendet",
    sentBody:
      "Danke! Der Vorstand hat Ihre Nachricht erhalten und wird Ihnen an die angegebene Adresse antworten.",
    fields: {
      lastName: "Name:",
      firstName: "Vorname:",
      email: "E-Mail:",
      subject: "Betreff:",
      message: "Inhalt der Nachricht:",
    },
  },

  notFound: {
    heading: "Seite nicht gefunden",
    body: "Hoppla! Die gesuchte Seite existiert nicht oder wurde verschoben.",
    backHome: "Zurück zur Startseite",
  },

  placeholders: {
    tbd: "••• noch zu ergänzen",
    tbdWhat: "••• noch zu ergänzen: {{what}}",
    photoBand: "Neues Foto der ganzen Canetons folgt!",
    photoConcert: "Neues Foto der Canetons im Konzert folgt!",
    photoRegister: "Neues Foto des Registers {{name}} folgt!",
    registerFirstNames: "Vornamen des Registers",
    bookingNumber: "Nummer für Auftritte",
    committeeSeats: "die Ämter und Namen des Vorstands",
    joinContact: "Name und Nummer",
  },
};
