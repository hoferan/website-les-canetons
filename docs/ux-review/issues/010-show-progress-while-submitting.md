# Show progress and block repeat clicks while a form is sending

**Labels:** ux, forms, severity:medium, effort:s

## Problem
On /contact (FR, 375 px) I held the POST for 1.5 s. At 400 ms the Envoyer button was still enabled, with no `aria-busy`, no spinner and the same label, so a second tap is possible and the user cannot tell whether the tap registered. (The idempotency key prevents a duplicate message but not the uncertainty.) The failure path is good: the typed values were kept (Muller|Léa|lea@example.ch|Salut|Bonjour) and a `role=alert` read "Une erreur est survenue. Veuillez réessayer." Booking and login use the same footer button and should be re-checked.

## Evidence
- docs/ux-review/screenshots/flow-contact-sending-fr-375.png
- docs/ux-review/screenshots/flow-contact-server-error-fr-375.png
- Data: docs/ux-review/data/interact1.json (contactSending)

## Guideline
Nielsen #1 (system status); Material 3 progress indicators for buttons; Baymard on form submission feedback.

## Proposal
In the shared form footer, on submit set `aria-disabled` (not `disabled`, to keep focus), swap the label to "Envoi…", add a small spinner and `aria-busy`; ignore further clicks. Restore on error and keep focus on the button.

## Acceptance criteria
- [ ] Contact, booking, login, new event, member and password forms show the sending state within 100 ms
- [ ] A second click during sending sends nothing
- [ ] Screen reader announces the sending state once
- [ ] Server error: values kept, alert shown, focus stays on the button (current behaviour preserved)

## Dependencies
None
