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

  common: {
    loading: "Wird geladen…",
    backToPlanning: "← Zurück zur Planung",
    // ABBRECHEN, NICHT RÜCKGÄNGIG: Das Französische sagt für beides
    // «Annuler». Dieser Schlüssel schliesst einen Dialog, ohne etwas zu tun;
    // das Zurücknehmen einer bereits erfassten Antwort ist attendance.undo.
    cancel: "Abbrechen",
    save: "Speichern",
    busy: "Läuft…",
    edit: "Bearbeiten",
    delete: "Löschen",
    guests_one: "{{count}} Person",
    guests_other: "{{count}} Personen",
    backHome: "Zurück zur Startseite",
    bootFailed:
      "Die Website konnte nicht gestartet werden. Bitte versuchen Sie es in wenigen Augenblicken erneut.",
    typeToConfirm: "Tippen Sie «{{phrase}}», um zu bestätigen",
    // RowActions' own trigger label. für, not zu -- see fr.ts for why the
    // key moved here (M4/M5, #118 whole-branch review). The old
    // events.moreActionsAria shipped zu on the reasoning that it matched
    // registrationsAria ("Anmeldungen zu {{title}}"), which holds for an
    // event and stops holding once the same string names a person.
    moreActionsAria: "Weitere Aktionen für {{name}}",
  },

  meta: {
    // Identical to the French on purpose; see the note in fr.ts.
    title: "Guggenmusik Les Canetons de Fribourg",
    // "Freiburg", not "Fribourg": the city's German name, as everywhere else in
    // this file. The band's own name keeps its French spelling above.
    description:
      "Die Kinder-Guggenmusik aus Freiburg, gegründet 2002. Von 7 bis 18 Jahren, ohne Notenkenntnisse — Proben in der Regel am Samstagvormittag.",
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
    account: "Mein Konto",
    accountMenu: "Konto von {{name}}",
    logout: "Abmelden",
    pending: "{{n}} ausstehend",
    // Identisch zum Französischen: siehe die Notiz in fr.ts.
    switchToGerman: "Auf Deutsch wechseln",
    switchToFrench: "Passer en français",
    rights: "Alle Rechte vorbehalten.",
  },

  contactMessages: {
    heading: "Nachrichten",
    word_one: "Nachricht",
    word_other: "Nachrichten",
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

  attendance: {
    // JA UND NEIN BLEIBEN GROSSGESCHRIEBEN, auch mitten im Satz: Die Antwort
    // steht hier als Wert neben einem Namen, nicht als Satzpartikel. Das
    // Französische wechselt zwischen «Oui» und «oui», das Deutsche nicht —
    // genau darum darf keine Sprache die eine Form aus der anderen ableiten.
    answer: {
      yes: "Ja",
      no: "Nein",
      yesInline: "Ja",
      noInline: "Nein",
    },

    heading: "Wer kommt?",
    loadFailed: "Die Liste konnte nicht geladen werden.",
    counts: "{{yes}} Ja · {{no}} Nein · {{silent}} ohne Rückmeldung",
    silentHeading: "Ohne Rückmeldung",
    copyForWhatsApp: "Für WhatsApp kopieren",
    copied: "Liste kopiert. Fügen Sie sie in WhatsApp ein.",
    copyRefused: "Der Browser hat das Kopieren abgelehnt.",
    answersHeading: "Rückmeldungen",
    sectionLabel: "Register: {{name}}",
    recordedByCommittee: "Vom Vorstand erfasst.",
    nobodyAnswerable:
      "Es gehört noch niemand einem Register an, also wird von niemandem eine Rückmeldung erwartet.",
    answerFromPlanning: "Antworten Sie über die Planung.",
    editFromPlanning: "Änderbar über die Planung.",
    comingAria: "{{name}} kommt",
    notComingAria: "{{name}} kommt nicht",
    correct: "Korrigieren",
    correctFor: "Rückmeldung von {{name}} korrigieren",
    correctDescription:
      "Was {{name}} Ihnen gesagt hat. Die Begründung ist freiwillig, und die Rückmeldung bleibt als vom Vorstand erfasst markiert.",
    recordFailed: "Die Rückmeldung konnte nicht gespeichert werden.",
    // OHNE LEERZEICHEN VOR DEM DOPPELPUNKT, anders als im Französischen.
    recordedYes: "{{name}}: Ja.",
    recordedNo: "{{name}}: Nein.",

    line: "{{name}} — {{answer}}",
    // ENGE GUILLEMETS: «so», nicht « so ». {{note}} ist, was ein Mitglied
    // geschrieben hat, und wird in beiden Sprachen wörtlich wiedergegeben.
    lineWithNote: "{{name}} — {{answer}} — «{{note}}»",
    lineSilent: "{{name}} — ohne Rückmeldung",

    yesComing: "Ja, ich komme",
    comingToAria: "Ich komme zu {{title}}",
    notComingToAria: "Ich komme nicht zu {{title}}",
    answered: "Beantwortet",
    quotedNote: "«{{note}}»",
    byCommittee: "Rückmeldung vom Vorstand erfasst.",
    ownRecordFailed: "Ihre Rückmeldung konnte nicht gespeichert werden.",
    toastYes: "Sie kommen — {{title}}.",
    toastNo: "Sie kommen nicht — {{title}}.",
    // RÜCKGÄNGIG, NICHT ABBRECHEN: siehe common.cancel.
    undo: "Rückgängig",
    undoFailed: "Das Zurücknehmen ist fehlgeschlagen. Versuchen Sie es erneut.",

    reason: "Begründung",
    withdrawTitle: "Sie kommen nicht mehr zu «{{title}}»?",
    withdrawDescription:
      "Sie hatten Ihre Teilnahme zugesagt. Sagen Sie dem Vorstand, warum Sie nicht mehr kommen, damit er planen kann.",
    withdrawConfirm: "Ich komme nicht",
  },

  events: {
    // ANLASS, NICHT VERANSTALTUNG: das schweizerische Wort für einen Auftritt
    // oder eine Probe, und das, was eine Guggenmusik selber sagt.
    heading: "Planung",
    add: "Anlass hinzufügen",
    addSeries: "Serie hinzufügen",
    // 131px gegen eine 152px breite Überschrift — passt, siehe fr.ts. #182.
    addTrigger: "Hinzufügen",
    // HINZUFÜGEN ZUERST, nicht am Ende: Der sichtbare Text muss am ANFANG des
    // zugänglichen Namens stehen, sonst trifft die Spracheingabe auf
    // «Hinzufügen» nicht zu (WCAG 2.5.3) — dieselbe Regel, die ButtonLink für
    // die Zeilenaktionen festhält. Deutsche Wortstellung stellt das trennbare
    // Verb sonst nach hinten. Und PLANUNG, nicht «Programm»: das ist das Wort,
    // das dieser Katalog überall sonst verwendet.
    addTriggerAria: "Hinzufügen zur Planung",
    // ANLASS, wie überall in diesem Katalog: "Vergangene Anlässe", nicht
    // "Vergangenes". Ersetzt showPast/showPlanning — siehe fr.ts. #182.
    viewPlanning: "Planung",
    viewPast: "Vergangene Anlässe",
    viewSwitchAria: "Ansicht der Planung",
    calendar: "Kalender",
    list: "Liste",
    dayFiltered: "Nach einem Tag gefiltert.",
    showAll: "Ganze Planung anzeigen",
    loadFailed: "Die Planung konnte nicht geladen werden.",
    empty: "Keine Anlässe in der Planung.",
    emptyPast: "Keine vergangenen Anlässe.",
    // ENGE GUILLEMETS, und {{action}} ist der Wert eines anderen Schlüssels:
    // Der Hinweis zitiert die Schaltfläche daneben.
    emptyHint:
      "Fügen Sie einen Anlass hinzu, oder erzeugen Sie mit «{{action}}» gleich eine ganze Saison.",
    owedHeading: "Zu beantworten",
    allAnswered: "Alles beantwortet.",
    // DAS VERB WECHSELT MIT, «fehlt» gegen «fehlen». Genau das kann kein
    // angehängtes «s» in einer Komponente leisten.
    owedCount_one: "Es fehlt noch {{count}} Rückmeldung.",
    owedCount_other: "Es fehlen noch {{count}} Rückmeldungen.",
    pastHeading: "Vergangene Anlässe",
    restHeading: "Die übrige Planung",

    registrations: "Anmeldungen",
    registrationsAria: "Anmeldungen zu {{title}}",
    options: "Was buchbar ist",
    optionsAria: "Was zu {{title}} gebucht werden kann",
    whoComingAria: "Wer kommt zu {{title}}",
    editAria: "{{title}} bearbeiten",
    deleteAria: "{{title}} löschen",

    deleteTitle: "«{{title}}» löschen?",
    deleteDescription:
      "Der Anlass wird aus der Planung entfernt. Die Rückmeldungen zur Teilnahme und die zugehörigen Anmeldungen werden mit ihm gelöscht. Diese Aktion ist endgültig.",
    deleteFailed: "Das Löschen ist fehlgeschlagen.",

    card: {
      location: "Ort:",
      attire: "Kleidung:",
      attireUnset: "Nicht festgelegt",
    },

    meta: {
      public: "Öffentlich",
      answers: "{{answered}}/{{answerable}} Rückmeldungen",
      // NULL IST HIER PLURAL, anders als im Französischen: «0 Rückmeldungen»,
      // nicht «0 Rückmeldung». Die CLDR-Regel der aktiven Sprache entscheidet
      // das, nicht die Komponente.
      answersAria_one: "{{count}} Rückmeldung von {{total}}",
      answersAria_other: "{{count}} Rückmeldungen von {{total}}",
      noGuests: "Keine Anmeldungen",
      guests_one: "{{count}} Person",
      guests_other: "{{count}} Personen",
    },

    calendarGrid: {
      previousMonth: "Vorheriger Monat",
      nextMonth: "Nächster Monat",
      dayAria_one: "{{date}}, {{count}} Anlass",
      dayAria_other: "{{date}}, {{count}} Anlässe",
    },
  },

  eventForm: {
    newHeading: "Neuer Anlass",
    editHeading: "Anlass bearbeiten",
    saveFailed: "Das Speichern ist fehlgeschlagen.",
    loadFailed: "Dieser Anlass konnte nicht geladen werden.",
    loadFailedReload: "Dieser Anlass konnte nicht geladen werden. Laden Sie die Seite neu.",

    addTitle: "Anlass hinzufügen",
    editTitle: "{{title}} bearbeiten",
    saving: "Wird gespeichert…",

    title: "Titel",
    startDate: "Startdatum",
    startTime: "Startzeit",
    endDate: "Enddatum",
    endTime: "Endzeit",
    location: "Ort",
    attire: "Kleidung",
    // ENGE GUILLEMETS, und {{unset}} ist genau der Text, den die Karte zeigt.
    attireHint:
      "Leer lassen, wenn die Kleidung noch nicht festgelegt ist: Die Karte zeigt dann «{{unset}}».",
    isPublic: "Auf der öffentlichen Website sichtbar",
    notes: "Bemerkungen",

    registrationsLegend: "Anmeldungen des Publikums",
    registrationsHint:
      "Tragen Sie ein Schlussdatum ein, um diesen Anlass für Anmeldungen zu öffnen. Lassen Sie es leer, wenn sich niemand anmeldet: Das trifft auf fast die ganze Planung zu.",
    closesDate: "Anmeldeschluss",
    closesTime: "Uhrzeit des Anmeldeschlusses",
    opensDate: "Anmeldebeginn",
    opensTime: "Uhrzeit des Anmeldebeginns",
    opensHint:
      "Ohne Anmeldebeginn ist das Formular ab sofort online. Tragen Sie ihn ein, um einen Anlass vorzubereiten, dessen Anmeldungen noch nicht erscheinen sollen.",
    maxGuests: "Personen pro Anmeldung",
    maxGuestsHint:
      "Das Maximum, das eine einzelne Anmeldung abdecken kann, zwischen 1 und 100. Leer lassen, um nicht zu begrenzen. Der Saal selbst ist nie begrenzt: Der Vorstand beobachtet die Liste und zieht den Anmeldeschluss bei Bedarf vor.",
  },

  seriesForm: {
    newHeading: "Neue Serie",
    createFailed: "Das Erstellen der Serie ist fehlgeschlagen.",

    heading: "Eine Serie von Anlässen",
    intro:
      "Alle Termine erhalten denselben Titel, denselben Ort und dieselben Zeiten. Jeder wird ein eigenständiger Anlass: Einen später zu ändern berührt die anderen nicht.",

    weekday: "Wochentag",
    // Im Deutschen ohnehin grossgeschrieben — anders als bei Intls «lundi»,
    // weshalb das Französische diese Liste nicht aus Intl beziehen kann.
    weekdays: {
      monday: "Montag",
      tuesday: "Dienstag",
      wednesday: "Mittwoch",
      thursday: "Donnerstag",
      friday: "Freitag",
      saturday: "Samstag",
      sunday: "Sonntag",
    },

    from: "Von",
    to: "Bis",

    noDates:
      "Wählen Sie einen Tag und einen Zeitraum, um die Termine zu sehen, die erstellt werden.",
    datesLegend: "Zu erstellende Termine",
    tooMany:
      "{{n}} Termine ausgewählt: höchstens {{cap}} pro Serie. Nehmen Sie welche weg oder verkürzen Sie den Zeitraum.",

    creating: "Wird erstellt…",
    create_one: "{{count}} Anlass erstellen",
    create_other: "{{count}} Anlässe erstellen",
    createdCount_one: "{{count}} Anlass erstellt.",
    createdCount_other: "{{count}} Anlässe erstellt.",
    seePlanning: "Zur Planung",
    another: "Weitere Serie erstellen",
  },

  members: {
    heading: "Mitglieder",
    // NULL IST HIER PLURAL: «0 Mitglieder», nicht «0 Mitglied».
    count_one: "{{count}} Mitglied",
    count_other: "{{count}} Mitglieder",
    add: "Person hinzufügen",

    saveFailed: "Das Speichern ist fehlgeschlagen.",
    actionFailed: "Die Aktion ist fehlgeschlagen.",
    loadFailed: "Diese Person konnte nicht geladen werden.",
    loadFailedReload: "Diese Person konnte nicht geladen werden. Laden Sie die Seite neu.",
    incompleteSave: "Das Speichern ist unvollständig: Laden Sie die Seite neu.",
    rosterLoadFailed: "Die Mitgliederliste konnte nicht geladen werden.",

    usernameLabel: "Benutzername: {{value}}",
    sectionLabel: "Register: {{value}}",
    rolesLabel: "Rollen: {{value}}",
    noSection: "Kein Register",
    noRoles: "Keine Rolle",

    editPerson: "{{name}} bearbeiten",
    password: "Passwort",
    deleteTitle: "{{name}} löschen",
    // «DIESE PERSON» STATT DES NAMENS, wie im Französischen — dort aus
    // Gründen der Grammatik, hier, weil der Titel die Person bereits nennt.
    deleteDescription:
      "Diese Person wird aus der Liste entfernt und verliert sofort den Zugang zur Website. Ihre Rückmeldungen zur Teilnahme werden aus der Planung gelöscht. Diese Aktion ist endgültig.",
    reset: "Zurücksetzen",
    resetTitle: "Passwort von {{name}} zurücksetzen",
    resetDescription:
      "Ein neues Passwort wird erzeugt und ein einziges Mal angezeigt. Diese Person wird überall abgemeldet und muss es bei der nächsten Anmeldung ändern.",

    generatedTitle: "Passwort von {{name}}",
    generatedDescription:
      "Notieren Sie es oder lesen Sie es der Person jetzt vor: Es wird nie wieder angezeigt. Sie muss es bei der ersten Anmeldung ersetzen.",
    generatedAck: "Ich habe das Passwort notiert",

    // Im Deutschen beugt sich hier kein Partizip, anders als im
    // Französischen: «Nie benutzt» passt unabhängig davon, wer gemeint ist.
    neverUsed: "Nie benutzt",
    neverUsedName: "Konto nie benutzt",
    provisional: "Provisorisch",
    provisionalName: "Provisorisches Passwort",
    lastLogin: "Letzte Anmeldung am {{date}}",
  },

  memberForm: {
    firstName: "Vorname",
    lastName: "Name",
    username: "Benutzername",
    passwordHintNew: "Nach dem Speichern wird ein Passwort erzeugt und ein einziges Mal angezeigt.",
    passwordHintEdit: "Das Passwort wird über die Liste zurückgesetzt, nie über dieses Formular.",
    section: "Register",
    committeeFunction: "Funktion im Vorstand",
    noFunction: "Keine Funktion",
    instructorOf: "Leiter des Registers",
    notInstructor: "Kein Leiter",
    publicVisible: "Auf der öffentlichen Website sichtbar",
    rolesLegend: "Rollen",
    rolesAfterSave:
      "Rollen werden vergeben, nachdem die Person gespeichert wurde: Rechte zu erteilen ist eine eigene Aktion, die laufende Sitzungen beendet und eine Spur hinterlässt.",
    saving: "Wird gespeichert…",
  },

  booking: {
    fields: {
      lastName: "Name",
      firstName: "Vorname",
      email: "E-Mail",
      phone: "Telefon",
      address: "Adresse",
      tableName: "Tisch",
    },

    submitFailed: "Die Anmeldung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
    notOpen:
      "Für diese Adresse ist keine Anmeldung offen. Überprüfen Sie den Link, den Sie erhalten haben.",
    loadFailed: "Das Formular konnte nicht geladen werden. Laden Sie die Seite neu.",

    bookedHeading: "Anmeldung gespeichert",
    bookedBody:
      "Danke! Eine Bestätigung geht an {{email}}. Der Vorstand meldet sich bei Bedarf unter {{phone}}.",

    opensOn: "Die Anmeldung öffnet am {{date}}.",
    closed: "Die Anmeldung ist geschlossen.",
    closesOn: "Anmeldung bis am {{date}}.",
    maxGuests_one: "Eine Anmeldung deckt höchstens {{count}} Person ab.",
    maxGuests_other: "Eine Anmeldung deckt höchstens {{count}} Personen ab.",

    contactLegend: "Ihre Kontaktangaben",
    choiceLegend: "Ihre Auswahl",
    optionalHint:
      "Adresse und Tisch sind freiwillig. Der Tisch ist, neben wem Sie gerne sitzen möchten.",
    nothingOffered:
      "Für diesen Abend wird noch nichts angeboten. Schauen Sie in ein paar Tagen wieder vorbei.",

    chooseSomeone: "Wählen Sie mindestens eine Person.",
    guestsWithTotal: "{{guests}} — {{total}}",
    submit: "Anmelden",
    sending: "Wird gesendet…",
  },

  registrations: {
    amendFailed: "Die Korrektur konnte nicht gespeichert werden.",
    cancelFailed: "Das Stornieren ist fehlgeschlagen.",
    loadFailed: "Diese Anmeldung konnte nicht geladen werden.",
    loadFailedReload: "Diese Anmeldung konnte nicht geladen werden. Laden Sie die Seite neu.",
    listLoadFailed: "Die Liste konnte nicht geladen werden.",
    downloadFailed: "Die Datei konnte nicht heruntergeladen werden.",

    tableLabel: "Tisch: {{value}}",
    bookings_one: "{{count}} Anmeldung",
    bookings_other: "{{count}} Anmeldungen",
    countsSeparator: " · ",
    exportsHint:
      "Alle vier Dateien enthalten genau dieselben Zeilen. Excel ist die, die der Vorstand öffnet; CSV funktioniert überall.",
    empty: "Es hat sich noch niemand angemeldet. Das öffentliche Formular ist unter",

    // STORNIEREN, NICHT ABBRECHEN: Diese Schaltfläche storniert eine
    // Anmeldung; common.cancel schliesst ein Formular, ohne etwas zu tun. Im
    // Französischen heissen beide «Annuler».
    cancel: "Stornieren",
    cancelAria: "Anmeldung von {{name}} stornieren",
    // Ohne Leerzeichen vor dem Fragezeichen.
    cancelTitle: "Anmeldung von {{name}} stornieren?",
    cancelDescription:
      "Die Anmeldung und alles, was sie bestellt hat, werden gelöscht. Die Person wird nicht benachrichtigt. Diese Aktion ist endgültig.",
    cancelConfirm: "Anmeldung stornieren",

    amend: "Korrigieren",
    amendTitle: "Anmeldung von {{name}} korrigieren",
    orderNotHere:
      "Die Bestellung wird nicht hier geändert. Stornieren Sie dafür die Anmeldung und erfassen Sie sie neu.",
    saving: "Wird gespeichert…",
  },

  registrationOptions: {
    saveFailed: "Das Speichern ist fehlgeschlagen.",
    loadFailedReload: "Die Liste konnte nicht geladen werden. Laden Sie die Seite neu.",
    intro:
      "Was das Publikum buchen kann, und zu welchem Preis. Lassen Sie den Preis leer für eine Option, die keinen hat; schreiben Sie 0 für eine kostenlose Option. Das ist nicht dasselbe.",
    empty:
      "Zurzeit wird nichts angeboten. Das öffentliche Formular zeigt den Anlass ohne Auswahl an.",

    label: "Bezeichnung",
    description: "Beschreibung",
    up: "Nach oben",
    down: "Nach unten",
    removeShort: "Entfernen",
    optionNumber: "Option {{n}}",
    addOption: "Option hinzufügen",
    price: "Preis in Franken",

    moveUp: "{{option}} nach oben",
    moveDown: "{{option}} nach unten",
    remove: "{{option}} entfernen",
    thisOption: "diese Option",

    saved: "Gespeichert.",
    saving: "Wird gespeichert…",
  },

  auth: {
    username: "Benutzername",
    password: "Passwort",
    signIn: "Anmelden",
    signingIn: "Wird angemeldet…",
    loginFailed: "Die Anmeldung ist fehlgeschlagen.",
  },

  account: {
    heading: "Mein Konto",
    provisionalNotice:
      "Ihr Passwort wurde vom Vorstand ausgegeben und muss ersetzt werden, bevor Sie fortfahren.",
    currentPassword: "Aktuelles Passwort",
    newPassword: "Neues Passwort",
    confirmPassword: "Neues Passwort bestätigen",
    mismatch: "Die beiden Passwörter stimmen nicht überein.",
    changed: "Ihr Passwort wurde geändert.",
    change: "Passwort ändern",
    changing: "Wird geändert…",
    changeFailed: "Das Ändern des Passworts ist fehlgeschlagen.",
  },

  guards: {
    deniedHeading: "Zugriff verweigert",
    deniedBody:
      "Diese Seite ist anderen Mitgliedern vorbehalten. Wenn Sie glauben, dass es sich um einen Fehler handelt, wenden Sie sich an den Vorstand.",
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
    patrons: "Richard Hertig und Annick Bürgisser",
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
