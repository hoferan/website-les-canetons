import { fr } from "./fr";

/**
 * The Swiss Standard German vocabulary, mirroring fr.ts key for key.
 *
 * Typed `typeof fr`, so a missing or extra key is a build error.
 * catalogues.test.ts prints the offending paths, since a deep structural TS
 * error on this shape is close to unreadable.
 *
 * The same parsing rules as fr.ts apply, because
 * api/tests/Feature/ApiErrorVocabularyTest.php reads this file too: keys stay
 * bare identifiers and the object literal stays free of TypeScript syntax.
 * The `: typeof fr` annotation sits outside the braces and is fine.
 *
 * Swiss Standard German: `ss`, never `ß`. Formal `Sie` throughout, mirroring
 * the French `vous` (the one exception is `join`), so every string is a 1:1
 * translation of its French counterpart.
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
    member: {
      label: "Mitglied",
      hint: "Sieht den Plan und verwaltet das eigene Passwort. Alle Konten haben diese Rolle.",
    },
    musician: {
      label: "Musiker·in",
      hint: "Antwortet auf Anlässe und gehört zu den erwarteten Personen.",
    },
  },

  permissions: {
    events_manage: {
      label: "Planung verwalten",
      hint: "Erstellt, ändert, veröffentlicht und löscht Anlässe.",
    },
    attendance_view_all: {
      label: "Rückmeldungen sehen",
      hint: "Sieht, wer an jeden Anlass kommt und wer noch nicht geantwortet hat.",
    },
    attendance_record_for_others: {
      label: "Für andere antworten",
      hint: "Erfasst die Rückmeldung eines Mitglieds an dessen Stelle.",
    },
    members_manage: {
      label: "Mitglieder verwalten",
      hint: "Erfasst und ändert Mitglieder, ihre Rollen und ihre Passwörter.",
    },
    registrations_view: {
      label: "Anmeldungen sehen",
      hint: "Sieht die Liste der Angemeldeten eines Anlasses.",
    },
    registrations_manage: {
      label: "Anmeldungen verwalten",
      hint: "Korrigiert oder storniert eine Anmeldung.",
    },
    messages_view: {
      label: "Nachrichten lesen",
      hint: "Liest die über die Website gesendeten Nachrichten.",
    },
    messages_manage: {
      label: "Nachrichten bearbeiten",
      hint: "Markiert Nachrichten als erledigt und löscht sie.",
    },
    history_manage: {
      label: "Geschichte verwalten",
      hint: "Erfasst, korrigiert und löscht Einträge der Geschichte.",
    },
    images_manage: {
      label: "Fotos verwalten",
      hint: "Lädt Fotos hoch, löscht sie und wählt jene der Website.",
    },
    roles_manage: {
      label: "Rollen verwalten",
      hint: "Erstellt Rollen und legt fest, was jede erlaubt.",
    },
    events_view: {
      label: "Planung sehen",
      hint: "Sieht die kommenden Anlässe.",
    },
    attendance_respond: {
      label: "Auf Anlässe antworten",
      hint: "Meldet die eigene Teilnahme und zählt zu den erwarteten Personen.",
    },
    account_manage: {
      label: "Eigenes Konto verwalten",
      hint: "Ändert das eigene Passwort.",
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
    cannot_remove_last_role_administrator: "Das ist die letzte Person, die Rollen verwalten kann.",
    baseline_role_is_fixed:
      "Die Rolle «Mitglied» kann weder entzogen noch geändert noch gelöscht werden. Alle Konten behalten sie.",
    // Says what to do without explaining the rule: a committee-issued
    // password was read out loud, so "changing" to the same one would leave
    // the account on a password somebody else has heard.
    password_unchanged: "Das ist bereits Ihr aktuelles Passwort. Wählen Sie ein anderes.",

    invalid_session: "Ungültige Sitzung",
    // A request that cannot open a session: unlike invalid_session, a retry
    // does not help.
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

    not_answerable:
      "Von diesem Mitglied wird keine Rückmeldung erwartet: Sie können keine an seiner Stelle erfassen.",
    cannot_record_for_self:
      "Für sich selbst antworten Sie über die Planung: Eine zurückgezogene Zusage benötigt eine Begründung.",
    answer_already_settled:
      "Diese Frist ist abgelaufen. Ändern Sie Ihre Antwort, statt sie zurückzuziehen.",
    spam_suspected: "Senden abgelehnt. Laden Sie die Seite neu und versuchen Sie es erneut.",
    registration_not_open: "Die Anmeldung ist noch nicht geöffnet.",
    registration_closed: "Die Anmeldung ist geschlossen.",
    history_entry_empty:
      "Schreiben Sie mindestens einen Titel oder einen Text, auf Französisch oder Deutsch.",
    event_incomplete: "Ergänzen oder korrigieren Sie die Felder, bevor Sie veröffentlichen.",
    event_not_published:
      "Diese Veranstaltung ist noch ein Entwurf: Sie nimmt keine Antworten entgegen.",
    event_has_answers:
      "Es liegen bereits Antworten oder Anmeldungen vor: Die Veranstaltung kann nicht mehr zum Entwurf werden.",
    option_has_registrations:
      "Eine bereits gebuchte Option kann nicht gelöscht werden. Stornieren Sie zuerst die betroffenen Anmeldungen.",
    option_shape_locked:
      "Jemand hat diesen Block bereits beantwortet: Seine Art und ob er Personen zählt, lassen sich nicht mehr ändern. Fügen Sie stattdessen einen neuen Block hinzu.",
    choice_answer_in_use:
      "Jemand hat diese Antwort gewählt: Sie kann nicht gelöscht werden. Sie können sie umbenennen.",
    xlsx_unavailable:
      "Der Excel-Export ist auf diesem Server nicht verfügbar. Verwenden Sie das CSV-Format.",
    register_in_use:
      "In diesem Register spielen oder unterrichten noch Mitglieder. Teilen Sie sie zuerst einem anderen Register zu.",
    registers_changed:
      "Jemand hat inzwischen ein Register hinzugefügt oder gelöscht. Laden Sie die Seite neu und versuchen Sie es noch einmal.",
    image_in_use:
      "Dieses Foto wird noch auf der Website angezeigt. Entfernen Sie es zuerst von den Seiten, die es verwenden.",
    image_already_in_library:
      "Dieses Foto ist schon in der Fotothek. Verwenden Sie das vorhandene, oder löschen Sie es zuerst.",
    image_library_full:
      "Die Fotothek ist voll. Löschen Sie ein Foto, das nicht mehr verwendet wird, und versuchen Sie es erneut.",
    image_storage_full:
      "Der Server hat keinen Platz mehr für dieses Foto. Löschen Sie unbenutzte Fotos oder benachrichtigen Sie den Administrator.",
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
    // No parameter, as in French: the limit comes from a closure validator
    // that sends only `field` and `reason`, so a {{max}} would print as is.
    too_many_guests: "überschreitet die pro Anmeldung zulässige Personenzahl",
    not_enough_places: "übersteigt die noch freien Plätze",
    too_few_answers: "muss mindestens zwei Antworten anbieten",
    image_not_jpeg: "muss ein JPEG-Bild sein",
    image_too_large: "hat zu viele Pixel",
    image_too_heavy: "ist zu gross",
    image_has_metadata: "enthält noch Metadaten oder einen Kommentar",
    image_unexpected_data: "enthält Daten, die ein Foto nicht enthält",
    image_trailing_data: "enthält mehr als das Bild oder ist unvollständig",
    image_set_too_many: "enthält zu viele Grössen für ein einziges Foto",
    image_set_too_heavy: "ist insgesamt zu gross",
    image_set_widths_repeated: "enthält dieselbe Grösse zweimal",
    image_set_aspect_mismatch: "mischt Grössen mit unterschiedlichen Seitenverhältnissen",
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
    occurredOn: "Datum",
    precision: "Genauigkeit des Datums",
    titleFr: "Titel auf Französisch",
    bodyFr: "Text auf Französisch",
    titleDe: "Titel auf Deutsch",
    bodyDe: "Text auf Deutsch",
    labelFr: "Name auf Französisch",
    labelDe: "Name auf Deutsch",
    colour: "Farbe",
    celebrate: "Konfetti",
    tagIds: "Kategorien",
    important: "Wichtiger Meilenstein",
    icon: "Symbol",
    files: "Datei",
    // The library's label for a photo on /media, and a register's French name.
    name: "Name",
    // A register's German name, on /registers.
    nameDe: "Name auf Deutsch",
    // The registers in their new order, on /registers.
    sectionIds: "Reihenfolge der Register",
    imageId: "Foto",
    path: "Seite",
    registrationOpensAt: "Anmeldebeginn",
    registrationClosesAt: "Anmeldeschluss",
    registrationMaxGuests: "Personen pro Anmeldung",
    sectionId: "Register",
    committeeFunctionId: "Funktion im Vorstand",
    instructorOfSectionId: "Registerleitung",
    publicVisible: "Öffentlich sichtbar",
    roleIds: "Rollen",
    permissions: "Rechte",
    currentPassword: "Aktuelles Passwort",
    newPassword: "Neues Passwort",
    id: "Benutzername",
    lastName: "Nachname",
    firstName: "Vorname",
    email: "E-Mail",
    subject: "Betreff",
    message: "Nachricht",
    handled: "Erledigt",
    paid: "Bezahlt",
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
    capacity: "Anzahl Plätze",
    sortOrder: "Reihenfolge",
    kind: "Art des Blocks",
    required: "Pflichtfeld",
    countsGuests: "Zählt als Personen",
    answers: "Antworten",
    key: "Antwort",
  },

  common: {
    loading: "Wird geladen…",
    requiredLegend: "Pflichtfeld",
    backToPlanning: "← Zurück zur Planung",
    // "Abbrechen", not "Rückgängig", though French says "Annuler" for both.
    // This closes a dialog without doing anything; taking back a recorded
    // answer is attendance.undo.
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
    clearSearch: "Suche löschen",
    // RowActions' trigger label. "für", not "zu": registrationsAria's "zu"
    // fits an event, and this string also names a person.
    moreActionsAria: "Weitere Aktionen für {{name}}",
    showPassword: "Passwort anzeigen",
  },

  meta: {
    // Identical to the French on purpose; see the note in fr.ts.
    title: "Guggenmusik Les Canetons de Fribourg",
    // "Freiburg", the city's German name, as everywhere else in this file.
    // The band's own name keeps its French spelling above.
    description:
      "Die Kinder-Guggenmusik aus Freiburg, gegründet 2002. Von 7 bis 18 Jahren, ohne Notenkenntnisse — Proben in der Regel am Samstagvormittag.",
  },

  nav: {
    primary: "Hauptnavigation",
    skipToContent: "Zum Inhalt springen",
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
    eventTags: "Kategorien",
    media: "Medien",
    registers: "Register",
    roles: "Rollen",
    gallery: "Galerie",
    galleryLabel: "Galerie auf Flickr (neuer Tab)",
    instagramLabel: "Instagram der Canetons (neuer Tab)",
    facebookLabel: "Facebook der Canetons (neuer Tab)",
    flickrLabel: "Flickr, die Galerie der Canetons (neuer Tab)",
    followUs: "Folgen Sie uns",
    footerPitch:
      "Die Kinder-Guggenmusik aus Freiburg, seit 2002. Von 7 bis 18 Jahren, ganz ohne Musikkenntnisse.",
    login: "Anmelden",
    account: "Mein Konto",
    accountMenu: "Konto von {{name}}",
    logout: "Abmelden",
    more: "Mehr",
    close: "Menü schliessen",
    groupMine: "Mein Bereich",
    groupBand: "Die Gugge",
    language: "Sprache",
    pending: "{{n}} ausstehend",
    // Identical to the French; see the note in fr.ts.
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
    handledSwitch: "Erledigt",
    delete: "Löschen",
    deleteConfirmTitle: "Diese Nachricht löschen?",
    deleteConfirmDescription:
      "Die Nachricht von {name} wird endgültig gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.",
    handledBy: "Erledigt von {name} am {date}",
    // The normal case, not an error: an empty inbox is good news.
    empty: "Noch keine Nachrichten. Das Kontaktformular ist bereit.",
    emptyFiltered: "Keine Nachricht entspricht diesem Filter.",
    loadError: "Die Nachrichtenliste konnte nicht geladen werden.",
    readError: "Diese Nachricht konnte nicht geladen werden. Laden Sie die Seite neu.",
    actionFailed: "Die Aktion konnte nicht ausgeführt werden.",
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
    // "Ja" and "Nein" stay capitalised mid-sentence: the answer is a value
    // beside a name. French switches between "Oui" and "oui" and German does
    // not, so neither language may derive one form from the other.
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
    // No space before the colon, unlike French.
    recordedYes: "{{name}}: Ja.",
    recordedNo: "{{name}}: Nein.",

    line: "{{name}} — {{answer}}",
    // Tight guillemets: «so», not « so ». {{note}} is what a member wrote,
    // quoted verbatim in both languages.
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
    // "Rückgängig", not "Abbrechen": see common.cancel.
    undo: "Rückgängig",
    undoFailed: "Das Zurücknehmen ist fehlgeschlagen. Versuchen Sie es erneut.",

    reason: "Begründung",
    withdrawTitle: "Sie kommen nicht mehr zu «{{title}}»?",
    withdrawDescription:
      "Sie hatten Ihre Teilnahme zugesagt. Sagen Sie dem Vorstand, warum Sie nicht mehr kommen, damit er planen kann.",
    withdrawConfirm: "Ich komme nicht",
  },

  events: {
    // "Anlass", not "Veranstaltung": the Swiss word for a performance or a
    // rehearsal, and what a Guggenmusik says itself.
    heading: "Planung",
    // A draft may have no date yet.
    dateMissing: "Datum noch offen",
    // Drafts: written and editable, visible to the direction only.
    draftsHeading: "Entwürfe",
    draftBadge: "Entwurf",
    publish: "Veröffentlichen",
    publishAria: "{{title}} veröffentlichen",
    unpublish: "Zurück zum Entwurf",
    unpublishAria: "{{title}} zurück zum Entwurf",
    publishFailed: "Die Veröffentlichung ist fehlgeschlagen.",
    add: "Anlass hinzufügen",
    addSeries: "Serie hinzufügen",
    // 131px beside a 152px heading: it fits (#182 phone budget, see fr.ts).
    addTrigger: "Hinzufügen",
    // "Hinzufügen" first: the visible text must start the accessible name, or
    // voice control on "Hinzufügen" misses it (WCAG 2.5.3), the rule
    // ButtonLink keeps for row actions. German word order would otherwise
    // push the separable verb to the end. "Planung", as everywhere else here.
    addTriggerAria: "Hinzufügen zur Planung",
    // "Anlässe", as everywhere in this catalogue, not "Vergangenes".
    viewPlanning: "Planung",
    viewPast: "Vergangene Anlässe",
    viewSwitchAria: "Ansicht der Planung",
    tagFilterAria: "Nach Kategorie filtern",
    tagAll: "Alle",
    calendar: "Kalender",
    list: "Liste",
    dayFiltered: "Nach einem Tag gefiltert.",
    showAll: "Ganze Planung anzeigen",
    loadFailed: "Die Planung konnte nicht geladen werden.",
    empty: "Keine Anlässe in der Planung.",
    searchLabel: "Anlass suchen",
    searchPlaceholder: "Suchen",
    noMatch: "Kein Anlass entspricht dieser Suche.",
    noTagMatch: "Kein Anlass in dieser Kategorie.",
    emptyPast: "Keine vergangenen Anlässe.",
    // Tight guillemets, and {{action}} is another key's value: the hint quotes
    // the button beside it.
    emptyHint:
      "Fügen Sie einen Anlass hinzu, oder erzeugen Sie mit «{{action}}» gleich eine ganze Saison.",
    owedHeading: "Zu beantworten",
    allAnswered: "Alles beantwortet.",
    // The verb changes too, "fehlt" against "fehlen", which no "s" appended
    // in a component can do.
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
      locationMissing: "Ort noch offen",
      attire: "Kleidung:",
      attireUnset: "Nicht festgelegt",
    },

    meta: {
      public: "Öffentlich",
      answers: "{{answered}}/{{answerable}} Rückmeldungen",
      // Zero is plural here, unlike French: "0 Rückmeldungen". The active
      // language's CLDR rule decides, not the component.
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
    // A draft is saved as it is; publishing is a second step.
    saveDraft: "Entwurf speichern",
    publish: "Veröffentlichen",
    draftHint:
      "Ein Entwurf darf unvollständig bleiben: Nur die Leitung sieht ihn, bis er veröffentlicht wird.",
    loadFailed: "Dieser Anlass konnte nicht geladen werden.",
    loadFailedReload: "Dieser Anlass konnte nicht geladen werden. Laden Sie die Seite neu.",
    poster: "Plakat",
    // The event is saved and its poster is not: the form stays open on the
    // saved event so the poster can be chosen again.
    posterFailed:
      "Der Anlass ist gespeichert, sein Plakat aber nicht. Wählen Sie es erneut und speichern Sie.",

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
    // Tight guillemets, and {{unset}} is exactly the text the card shows.
    attireHint:
      "Leer lassen, wenn die Kleidung noch nicht festgelegt ist: Die Karte zeigt dann «{{unset}}».",
    isPublic: "Auf der öffentlichen Website sichtbar",
    tags: "Kategorien",
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
    // Capitalised in German anyway. French cannot take this list from Intl,
    // which gives "lundi".
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
    createNone: "Anlässe erstellen",
    noneChosen: "Wählen Sie mindestens einen Termin aus.",
    // A series is created as drafts, so a wrong repetition does not land in
    // everybody's planning at once.
    draftsNote:
      "Die Anlässe werden als Entwürfe erstellt: Lesen Sie sie in der Planung durch und veröffentlichen Sie sie dann.",
    createdCount_one: "{{count}} Entwurf erstellt.",
    createdCount_other: "{{count}} Entwürfe erstellt.",
    another: "Weitere Serie erstellen",
    dismissCreated: "Meldung schliessen",
  },

  members: {
    heading: "Mitglieder",
    // Zero is plural here: "0 Mitglieder", not "0 Mitglied".
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
    notAnswering: "Antwortet nicht auf Anlässe",
    notAnsweringName: "In einem Register, antwortet aber nicht auf Anlässe",

    searchLabel: "Mitglied suchen",
    sectionFilter: "Register",
    roleFilter: "Rolle",
    allSections: "Alle Register",
    allRoles: "Alle Rollen",
    // Dative after "von": "3 von 45 Mitgliedern".
    filteredCount_one: "{{matches}} von {{count}} Mitglied",
    filteredCount_other: "{{matches}} von {{count}} Mitgliedern",
    noMatch: "Kein Mitglied entspricht dieser Suche.",
    clearFilters: "Filter zurücksetzen",

    editPerson: "{{name}} bearbeiten",
    password: "Passwort",
    deleteTitle: "{{name}} löschen",
    // "Diese Person" rather than the name, as in French (there for grammar),
    // because the title already names the person.
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

    // No participle agrees here, unlike French: "Nie benutzt" fits whoever
    // is meant.
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
    tableHint: "Neben wem Sie gerne sitzen möchten.",
    nothingOffered:
      "Für diesen Abend wird noch nichts angeboten. Schauen Sie in ein paar Tagen wieder vorbei.",
    placesLeft_one: "Noch {{count}} Platz frei",
    placesLeft_other: "Noch {{count}} Plätze frei",
    soldOut: "Ausgebucht",

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

    // "Stornieren", not "Abbrechen": this cancels a booking, while
    // common.cancel closes a form without doing anything. French says
    // "Annuler" for both.
    cancel: "Stornieren",
    cancelAria: "Anmeldung von {{name}} stornieren",
    // No space before the question mark.
    cancelTitle: "Anmeldung von {{name}} stornieren?",
    cancelDescription:
      "Die Anmeldung und alles, was sie bestellt hat, werden gelöscht. Die Person wird nicht benachrichtigt. Diese Aktion ist endgültig.",
    cancelConfirm: "Anmeldung stornieren",
    keepBooking: "Anmeldung behalten",

    optionTotalsLabel: "Insgesamt:",
    optionTotal: "{{count}} × {{label}}",

    paid: "Bezahlt",
    unpaid: "Nicht bezahlt",
    paidAria: "Bezahlt: Anmeldung von {{name}}",
    payFailed: "Die Zahlung konnte nicht gespeichert werden.",
    paidCount_one: "{{paid}}\u00a0von\u00a0{{count}}\u00a0bezahlt",
    paidCount_other: "{{paid}}\u00a0von\u00a0{{count}}\u00a0bezahlt",

    moreFormats: "Weitere Formate",

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
    optionNumber: "Option {{n}}",
    addOption: "Option hinzufügen",
    price: "Preis in Franken",
    priceInvalid: "Geben Sie einen Betrag ein, zum Beispiel 45 oder 45.50.",
    capacity: "Anzahl Plätze",
    capacityHint: "Leer: keine Begrenzung.",
    capacityRemaining_one: "Leer: keine Begrenzung. Noch {{count}} Platz frei.",
    capacityRemaining_other: "Leer: keine Begrenzung. Noch {{count}} Plätze frei.",
    capacityInvalid: "Geben Sie eine ganze Zahl ein, mindestens 1.",

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
    identity: "Identität",
    username: "Benutzername",
    section: "Register",
    sectionNone: "Kein Register",
    committeeFunction: "Funktion im Vorstand",
    committeeFunctionNone: "Keine",
    roles: "Rollen",
    rolesNone: "Keine",
    password: "Passwort",
    provisionalNotice:
      "Ihr Passwort wurde vom Vorstand ausgegeben und muss ersetzt werden, bevor Sie fortfahren.",
    currentPassword: "Aktuelles Passwort",
    newPassword: "Neues Passwort",
    confirmPassword: "Neues Passwort bestätigen",
    mismatch: "Die beiden Passwörter stimmen nicht überein.",
    rule: "Mindestens {{min}} Zeichen",
    ruleMet: "erfüllt",
    matches: "Die Passwörter stimmen überein.",
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
    heroHighlight: "Kinder-Guggenmusik",
    heroSub:
      "Von 7 bis 18 Jahren — und ganz ohne Musikkenntnisse: Die Leiter bringen die Stücke Register für Register bei, an den Proben am Samstagvormittag.",
    discover: "Die Canetons entdecken",
    brandLogoAlt: "Das Logo der Canetons de Fribourg",
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

  photos: {
    state: {
      waiting: "Wartet",
      shrinking: "Wird vorbereitet…",
      uploading: "Wird gesendet…",
      done: "Hinzugefügt",
      duplicate: "Bereits in der Bibliothek",
      failed: "Fehlgeschlagen",
    },
    reason: {
      unreadable:
        "Dieses Format kann dieser Browser nicht lesen — exportieren Sie das Foto als JPEG.",
      unsupported: "Dieser Dateityp ist kein akzeptiertes Foto.",
      too_large: "Das Foto bleibt auch verkleinert zu gross.",
      blank:
        "Dieser Browser hat das Foto ganz schwarz dargestellt, deshalb wurde es nicht gesendet. Versuchen Sie es mit einem anderen Browser.",
      image_library_full: "Die Bibliothek ist voll.",
      image_storage_full: "Der Server hat keinen Platz mehr für Fotos.",
      network: "Das Senden ist fehlgeschlagen. Versuchen Sie es erneut.",
      rejected: "Der Server hat dieses Foto abgelehnt.",
    },
    retry: "Erneut versuchen",
    retryAll: "Alle erneut versuchen",
    queueLabel: "Fotos, die hinzugefügt werden",
    // The name a photo is uploaded under when its file name leaves nothing.
    defaultName: "Foto",
    add: "Fotos hinzufügen",
    choose: "Auswählen",
    remove: "Entfernen",
    close: "Bibliothek schliessen",
    pickerTitle: "Foto auswählen",
    pickerDescription:
      "Tippen Sie auf ein Foto, um es auszuwählen, oder fügen Sie eines von Ihrem Gerät hinzu.",
    pickerAdd: "Vom Gerät hinzufügen",
    pickerEmpty: "Die Bibliothek ist leer. Fügen Sie ein erstes Foto hinzu.",
    loadFailed: "Die Bibliothek konnte nicht geladen werden.",
    removeFromSlot: "Foto entfernen",

    addOne: "Foto hinzufügen",
    addFrom: "Aus der Mediathek oder von Ihrem Gerät",
    addSlot: "Foto hinzufügen – {{label}}",
    change: "Ändern",
    changeSlot: "Foto ändern – {{label}}",
    slot: {
      band: "Gruppenfoto",
      concert: "Konzertfoto",
      godparents: "Götti und Gotte",
      history: "Geschichte: {{title}}",
      // Also the poster's alt text wherever the event shows it.
      event: "Plakat: {{title}}",
    },
    slotSaveFailed: "Das Foto konnte nicht geändert werden.",
    slotPlaced: "Foto platziert.",
    slotRemoved: "Foto entfernt.",
    dropHere: "Zum Hinzufügen ablegen",
    dropOnlyOne: "Nur ein Foto auf einmal.",
    dropNotPhoto: "Hier kann nur ein Foto abgelegt werden.",

    heading: "Medien",
    summary: "{{n}} / {{capacity}} Fotos · {{size}}",
    consent:
      "Bevor Sie das Foto eines Kindes veröffentlichen, vergewissern Sie sich, dass seine Eltern einverstanden sind.",
    placesLeft_one: "{{count}} Platz frei: Die weiteren Fotos werden nicht hinzugefügt.",
    placesLeft_other: "{{count}} Plätze frei: Die weiteren Fotos werden nicht hinzugefügt.",
    leaveWarning:
      "Es werden noch Fotos gesendet. Wenn Sie die Seite verlassen, werden die übrigen nicht hinzugefügt.",
    libraryHeading: "Bibliothek",
    filterLabel: "Bibliothek filtern",
    filterAll: "Alle",
    filterUsed: "Verwendet",
    filterUnused: "Nicht verwendet",
    emptyFiltered: "Kein Foto entspricht dieser Suche.",
    // The search box and the order of the library, both on the client.
    searchLabel: "Ein Foto nach seinem Namen suchen",
    searchPlaceholder: "Nach Namen suchen",
    sortLabel: "Reihenfolge der Bibliothek",
    sort: {
      newest: "Neueste zuerst",
      oldest: "Älteste zuerst",
      name: "Nach Name, A bis Z",
      largest: "Grösste zuerst",
    },
    unused: "Nicht verwendet",
    usedOn: "Angezeigt:",
    addedOn: "Hinzugefügt am {{date}}",
    select: "Markieren",
    selectPhoto: "{{name}} markieren",
    deleteSelected: "Löschen ({{n}})",
    deleteTitle_one: "Dieses Foto löschen?",
    deleteTitle_other: "Diese {{count}} Fotos löschen?",
    deleteDescription: "Ein gelöschtes Foto kann nicht wiederhergestellt werden.",
    deleteConfirm: "Löschen",
    deleted_one: "Foto gelöscht.",
    deleted_other: "{{count}} Fotos gelöscht.",
    deleteFailedHeading: "Diese Fotos wurden nicht gelöscht:",
    deleteFailed: "Foto „{{name}}“: {{message}}",
    deleteFailedFallback: "Das Löschen ist fehlgeschlagen.",

    // One photo of the library, /media/:id: its sizes, where it is shown, and
    // what can be done with it. The name is the committee's own label.
    detail: {
      back: "← Zurück zu den Medien",
      loadFailed: "Das Foto konnte nicht geladen werden.",
      sizesHeading: "Gespeicherte Grössen",
      size: "{{width}} × {{height}} px · {{size}}",
      usedOnHeading: "Verwendet auf",
      actionsLabel: "Aktionen für das Foto",
      rename: "Umbenennen",
      nameLabel: "Name",
      renamed: "Name gespeichert.",
      renameFailed: "Der Name konnte nicht gespeichert werden.",
      leaveRename:
        "Der neue Name ist noch nicht gespeichert. Wenn Sie die Seite verlassen, geht er verloren.",
      rotateLeft: "Nach links drehen",
      rotateRight: "Nach rechts drehen",
      replace: "Ersetzen",
      download: "Herunterladen",
      rotating: "Das Foto wird gedreht…",
      preparing: "Das Foto wird vorbereitet…",
      sending: "Das Foto wird gesendet…",
      rotated: "Foto gedreht.",
      replaced: "Foto ersetzt.",
      unchanged: "Das Foto wurde nicht geändert: {{message}}",
      sendFailed: "Das Senden ist fehlgeschlagen. Versuchen Sie es erneut.",
      deleteInUseTitle: "Dieses Foto wird noch angezeigt",
      deleteInUse: "Entfernen Sie es zuerst von jeder dieser Seiten und löschen Sie es dann.",
      close: "Schliessen",
    },
  },

  history: {
    heading: "Die Geschichte der Canetons",
    headingHighlight: "Geschichte",
    empty: "Die Geschichte wurde noch nicht geschrieben.",
    loadFailed: "Die Geschichte konnte nicht geladen werden.",
    inFrench: "Auf Französisch",
    inGerman: "Auf Deutsch",
    importantPrefix: "Wichtiger Meilenstein: ",
    add: "Hinzufügen",
    addAria: "Zur Geschichte hinzufügen",
    edit: "Bearbeiten",
    delete: "Löschen",
    editAria: "{{name}} bearbeiten",
    deleteAria: "{{name}} löschen",
    deleteHeadingNamed: "«{{title}}» ({{date}}) löschen?",
    deleteHeadingUntitled: "Den Eintrag {{of}} löschen?",
    deleteDescription: "Er verschwindet von der öffentlichen Seite.",
    deleteFailed: "Das Löschen ist fehlgeschlagen.",
    untitledEntry: "den Eintrag {{of}}",
    of: {
      year: "von {{date}}",
      month: "von {{date}}",
      monthVowel: "von {{date}}",
      day: "vom {{date}}",
    },
    saved: "Eintrag gespeichert.",
    deleted: "Eintrag gelöscht.",
    photoFailed:
      "Der Eintrag ist gespeichert, sein Foto aber nicht. Bearbeiten Sie den Eintrag, um es erneut auszuwählen.",
    icons: {
      none: "Keines",
      flag: "Fahne",
      star: "Stern",
      music: "Musik",
      trophy: "Pokal",
      users: "Personen",
      "party-popper": "Fest",
      "map-pin": "Ort",
      heart: "Herz",
    },
  },

  historyForm: {
    newHeading: "Neuer Eintrag",
    editHeading: "Eintrag bearbeiten",
    french: "Französisch",
    german: "Deutsch",
    photo: "Foto",
    atLeastOne: "Mindestens ein Titel oder ein Text, in einer der beiden Sprachen.",
    precisions: {
      year: "Nur das Jahr (2019)",
      month: "Monat und Jahr (Oktober 2002)",
      day: "Das genaue Datum (11.11.2023)",
    },
    year: "Jahr",
    month: "Monat",
    yearInvalid: "Geben Sie das Jahr mit vier Ziffern an.",
    preview: "Auf der Zeitleiste:",
    labelSeparator: ": ",
    previewIncomplete: "Datum unvollständig",
    monthPlaceholder: "Monat wählen",
    monthMissing: "Wählen Sie den Monat.",
    counter: "{{n}} von {{max}} Zeichen",
    iconLegend: "Symbol auf der Zeitleiste",
    saveFailed: "Das Speichern ist fehlgeschlagen.",
    loadFailed: "Der Eintrag konnte nicht geladen werden.",
  },

  agenda: {
    heading: "Wo Sie uns sehen",
    headingHighlight: "uns sehen",
    intro: "Die nächsten Auftritte der Canetons. Kommen Sie uns zuhören!",
    emptyNotice:
      "Die nächsten Termine sind noch nicht veröffentlicht. Schauen Sie bald wieder vorbei, oder schreiben Sie dem Vorstand, um uns zu buchen.",
    seeAll: "Alle Termine",
    // "Jetzt anmelden", not the bare "Anmelden", which German uses for both
    // logging in and signing up: nav.login is "Anmelden", and on /agenda the
    // two share a screen. French has no such collision, so the mirror is not
    // word for word here.
    register: "Jetzt anmelden",
    registerFor: "Jetzt anmelden — {{title}}",
  },

  band: {
    heading: "Unsere Canetons",
    headingHighlight: "Canetons",
    instructors: "Leiter:",
    registersNav: "Register",
    patronsHeading: "Der Götti und die Gotte",
    patronsAlt: "Der Götti und die Gotte der Canetons",
    patrons: "Richard Hertig und Annick Bürgisser",
  },

  committee: {
    heading: "Der Vorstand",
    headingHighlight: "Vorstand",
    contactHeading: "Kontakt der Canetons",
    writeToCommittee: "Dem Vorstand schreiben",
    booking: "Um die Canetons zu buchen:",
  },

  join: {
    // "du", not "Sie", in both languages: this page addresses children
    // directly (the band takes players from 7 to 18). Home.tsx explains why
    // the front page stays impersonal. It is the only informal address in
    // either catalogue.
    heading: "Willst du mit der Gugge anfangen?",
    headingHighlight: "Gugge",
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
      lastName: "Name",
      firstName: "Vorname",
      email: "E-Mail",
      subject: "Betreff",
      message: "Nachricht",
    },
  },

  notFound: {
    heading: "Seite nicht gefunden",
    body: "Hoppla! Die gesuchte Seite existiert nicht oder wurde verschoben.",
  },

  placeholders: {
    tbd: "••• noch zu ergänzen",
    tbdWhat: "••• noch zu ergänzen: {{what}}",
    photoPending: "Foto folgt",
    registerFirstNames: "Vornamen des Registers",
    bookingNumber: "Nummer für Auftritte",
    committeeSeats: "die Ämter und Namen des Vorstands",
    joinContact: "Name und Nummer",
  },
  rolesPage: {
    heading: "Rollen",
    intro:
      "Eine Rolle fasst Rechte zusammen. Die Rollen werden den Personen auf der Seite Mitglieder zugewiesen.",
    baselineNote: "Alle Konten haben diese Rolle. Sie lässt sich nicht ändern.",
    grantsNothing: "Gibt keine Rechte.",
    permissionsLegend: "Rechte",
    editAria: "Rolle {{name}} bearbeiten",
    deleteAria: "Rolle {{name}} löschen",
    deleteTitle: "Rolle {{name}} löschen?",
    deleteHolders_one: "{{names}} verliert diese Rolle und die Rechte, die nur sie gibt.",
    deleteHolders_other:
      "{{count}} Personen verlieren diese Rolle und die Rechte, die nur sie gibt: {{names}}.",
    deleteNobody: "Niemand hat diese Rolle. Sie verschwindet einfach aus der Liste.",
    newHeading: "Neue Rolle",
    add: "Rolle erstellen",
    saveFailed: "Die Rolle konnte nicht gespeichert werden.",
    deleteFailed: "Die Rolle konnte nicht gelöscht werden.",
  },
  eventTags: {
    heading: "Kategorien",
    intro:
      "Die Kategorien der Anlässe in der Planung. Ein Anlass kann mehrere haben. Mit «Konfetti» regnet es Konfetti, wenn ein Mitglied bei einem Anlass der Kategorie zusagt.",
    count_one: "{{count}} Anlass",
    count_other: "{{count}} Anlässe",
    editAria: "«{{label}}» bearbeiten",
    deleteAria: "«{{label}}» löschen",
    newHeading: "Neue Kategorie",
    add: "Hinzufügen",
    colour: "Farbe",
    celebrate: "Konfetti",
    celebrateAria: "Konfetti für «{{label}}»",
    colours: {
      violet: "Violett",
      teal: "Türkis",
      amber: "Bernstein",
      pink: "Rosa",
      blue: "Blau",
      green: "Grün",
      coral: "Koralle",
      gray: "Grau",
    },
    deleteTitle: "«{{label}}» löschen?",
    deleteUsed_one: "Sie wird von {{count}} Anlass entfernt.",
    deleteUsed_other: "Sie wird von {{count}} Anlässen entfernt.",
    deleteUnused: "Kein Anlass hat diese Kategorie.",
    saveFailed: "Die Kategorie konnte nicht gespeichert werden.",
    deleteFailed: "Die Kategorie konnte nicht gelöscht werden.",
  },
  registers: {
    heading: "Register",
    intro:
      "Die Register der Guggenmusik, in der Reihenfolge der Seite «Die Canetons» und des Mitgliederformulars. Ein deutscher Name ist freiwillig: Ohne ihn zeigt die deutsche Seite den französischen.",
    players_one: "{{count}} Musiker",
    players_other: "{{count}} Musiker",
    instructors_one: "{{count}} Leiter",
    instructors_other: "{{count}} Leiter",
    moveUpAria: "«{{label}}» nach oben",
    moveDownAria: "«{{label}}» nach unten",
    editAria: "«{{label}}» bearbeiten",
    deleteAria: "«{{label}}» löschen",
    newHeading: "Neues Register",
    add: "Hinzufügen",
    deleteTitle: "«{{label}}» löschen?",
    deleteUnused: "Niemand spielt oder unterrichtet in diesem Register.",
    deleteInUse:
      "Dieses Register hat {{players}} und {{instructors}}. Teilen Sie sie zuerst auf der Mitgliederseite einem anderen Register zu.",
    close: "Schliessen",
    saveFailed: "Das Register konnte nicht gespeichert werden.",
    deleteFailed: "Das Register konnte nicht gelöscht werden.",
    moveFailed: "Die Reihenfolge konnte nicht gespeichert werden.",
  },
};
