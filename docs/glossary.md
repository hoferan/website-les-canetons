# Glossary of UI terms

The words the interface uses for its main things, in French and German. When
you add or change UI text in `web/src/i18n/fr.ts` or `de.ts`, use these words,
so that a nav label, a page heading, a back link and a sentence about the same
thing all say the same word.

Code names stay English (`events`, `registers`) and are not covered here.

| Thing                                        | Français        | Deutsch          | Where it shows                                                  |
| -------------------------------------------- | --------------- | ---------------- | --------------------------------------------------------------- |
| The members' schedule, `/events`             | le planning     | die Planung      | Nav label, page heading, document title, "← Retour au planning" |
| One item in it                               | un événement    | ein Anlass       | Cards, counters, "Ajouter un événement"                         |
| A date in a series or on the public schedule | une date        | ein Termin       | Series generator, `/agenda`                                     |
| The public schedule, `/agenda`               | Où nous voir    | Wo Sie uns sehen | Nav label and page heading                                      |
| A member's answer to an event                | une réponse     | eine Rückmeldung | Attendance                                                      |
| A visitor's booking for an event             | une inscription | eine Anmeldung   | Guest lists, booking form                                       |
| A musical section                            | un pupitre      | ein Register     | `/registers`, member cards                                      |
| The committee                                | le comité       | der Vorstand     | Nav label, `/committee`                                         |
| A label on an event                          | une catégorie   | eine Kategorie   | `/event-tags`, filters                                          |

## Planning and événement

Members call the schedule "le planning", and its heading and back links say
so. The nav label used to read "Événements" ("Anlässe"), and a member looking
for the planning in the nav did not find the word (#399). "Événement" and
"Anlass" name one item in the planning.

"Anlass" is the Swiss German word for a performance or a rehearsal, and what a
Guggenmusik says itself. "Veranstaltung" is not used.
