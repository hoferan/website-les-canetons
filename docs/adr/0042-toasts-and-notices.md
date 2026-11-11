---
status: accepted
date: 2026-11-11
decision-makers: André Hofer
---

# Confirm an action in a toast with a level and a visible time, and keep page-bound messages inline

## Context and Problem Statement

The SPA raises eight toasts through `sonner`: after a block save (with an undo, #354), after an attendance answer (with an undo on a first answer, ADR 0018), after somebody records an answer for another member, and when any of these fail. They all look the same. A white box with a thin grey border reads "Modifié" next to an "Annuler" button, with no icon, no level, no way to close it and no sign of how long it stays. The block-save undo disappears after ten seconds, which nothing on screen tells you. André criticised it in his review of #374.

The page also has three inline messages. `Notice` is a violet-edged note in the flow of the page, there before the reader arrives. `FormError` is a live `role="alert"` line under a form. `SeriesCreatedNotice` is a `Notice` in a live region that stays until it is dismissed, because its link is the usual next step. Two screens already put a message beside its button on purpose: a refused download on the guest list, and an error in the booking-form editor, where a toast would be gone by the time somebody looks for it.

What separates a toast from an inline message and from a notification, and what should our toast look like and do?

### What the guidelines say

- A toast confirms something the person just did, floats over the page and never blocks it. Material's snackbar stays 4 to 10 seconds and carries at most one action. Carbon's toast persists by default and may auto-dismiss after five seconds, and an actionable one stays until dismissed. Atlassian's flags say never to auto-dismiss a warning or an error. Apple's HIG has no toast at all, and GOV.UK has none either: its success banner sits above the page heading and goes when the person leaves the page.
- An inline message (Carbon's inline notification and callout, GOV.UK's notification banner, our `Notice`) belongs to a place on the page and stays there. It is right for anything tied to a form, a list or a control.
- A notification outlives the moment and is kept somewhere to come back to, such as an inbox, a bell or a notification centre. Carbon says a toast's content should also be found elsewhere for that reason.
- WCAG 4.1.3 (Status Messages) wants a status reachable by a screen reader without moving focus, through a live region that exists before the text goes into it. WCAG 2.2.1 (Timing Adjustable) wants a time limit that can be turned off, adjusted or extended. WCAG 2.4.11 (Focus Not Obscured) wants a toast never to hide the focused control.
- `sonner` 2.0.8 keeps its live region in the page from the start and pauses its timer while the pointer is over the stack or the tab is hidden. It does not pause on keyboard focus: a Tab into the toast leaves the clock running.

## Considered Options

- A2.1, a white toast whose level-coloured column empties from the top as its time runs out
- A2.3, the same white toast with a full column and the time as a ring around the icon
- C2.1, the column toast on the black stage with the pink shadow
- A white raised card with a coloured icon tile, like the page's cards
- A toast filled entirely with the level colour
- A ticket with a perforated edge and two punched notches

## Decision Outcome

Chosen option: "A2.1", because the column says the level and the time in one shape no card on the site has, so the toast reads as being above the page, while the white body and ink frame keep it in the button family of ADR 0040. André picked it from rendered mock-ups at 390px and 1280px. The black version looked too aggressive on the light page, and the white card looked like one more card on the members' agenda.

The mock-ups are in [`0042/`](0042/): the [phone](0042/toasts-phone.png), the [desktop](0042/toasts-desktop.png) and [`mock.html`](0042/mock.html), which holds the exact values. Once the toast is built, its code is the authority.

### Which message goes where

- A toast confirms an action the person just took, or reports that it failed when no form is open to show it. It never carries the only copy of something the person needs later.
- An inline notice carries anything that belongs to a place on the page: form errors, a refused download, "5 événements créés" with its link. It stays until the page changes or the person dismisses it.
- There is no notification centre. Nothing on the site today must outlive the moment, apart from what the avatar's count already shows. One gets its own record when a need appears.

### The toast

- Four levels: success (lime, a check), info (cyan, an "i"), warning (yellow, an "!") and error (the danger red, a cross). Colour is never the only signal: each level has its own icon.
- A white body under the 3px ink frame and the 6px ink offset shadow of the raised buttons, plus a soft blurred shadow that nothing on the page has. To the left, a column in the level colour behind an ink rule holds the icon on a white disc with an ink outline, the same disc at every level.
- The message is one sentence. At most one action, in the violet `primary` button of ADR 0040 so that it stands out from the white body, and always a ✕ that closes the toast, labelled "Fermer" / "Schliessen".
- A toast slides in from the right edge with a small overshoot, and leaves to the right.
- The column is the clock. A toast that goes on its own empties its column from the top into a light tint of the same colour, and a toast that stays keeps it full.
  - Success or info with no action goes after 5 seconds.
  - A toast with an action, such as the undo after a block save or a first attendance answer, goes after 10 seconds.
  - Warnings and errors stay until closed.
- The clock pauses while the pointer is over the toast, while keyboard focus is inside it, and while the tab is hidden. Our component owns that timer and closes the toast itself, with sonner's own timer switched off, because sonner does not pause on focus.
- The stack stays where it is: bottom right from `sm`, full width with a 16px gutter on a phone, and above the edit pill while that is shown.
- Every toast goes through one wrapper. A call site names the level, the message and the optional action, and never imports `sonner` directly. A new block save still replaces the previous save's toast under one id, so only the latest save can be undone.

### The inline notice

`Notice` takes the same four levels, the same icons on the same disc and the same column colours, so a level means the same thing in both places. It stays flat, with no shadow and no clock, because it sits in the page and not above it. Info is the default level, and a notice gets a ✕ only where the screen lets it be dismissed. Its exact look is mocked at both widths in its own issue.

### Consequences

- Good, because a person sees at a glance whether something went right or wrong and whether the toast will wait for them.
- Good, because keyboard focus now pauses the clock, which sonner alone did not do.
- Good, because toasts and notices share one vocabulary of levels, icons and colours.
- Bad, because a toast with an action still runs out after 10 seconds, which WCAG 2.2.1 only partly accepts. André chose this over keeping it until closed, so that undo toasts do not pile up. The pause on hover and focus extends the time, and every undo stands for something the person can also put back by hand: answer the event again, or edit the block again.
- Bad, because the clock is ours, not sonner's, so a sonner upgrade that changes how a toast with an infinite duration behaves must be checked by hand.
- Bad, because on a phone the stack spans the width and can cover a focused control near the bottom of the page (WCAG 2.4.11). Sonner shows at most three toasts, and timed ones go on their own.

### Confirmation

The implementation adds:

- an ESLint `no-restricted-imports` rule that bans importing `toast` from `sonner` anywhere but the wrapper;
- component tests that pin the 5 and 10 second clocks, the pause on hover, on focus and on a hidden tab, and that warnings and errors have no clock;
- every level, with and without an action, on the `/dev/ui` catalogue, which the screenshot sweep captures at both widths.

## Pros and Cons of the Options

### A2.3, a full column and a ring around the icon

- Good, because the ring is a well-known countdown, and the column stays calm.
- Bad, because the ring is small, so the time is easy to miss, and the large coloured area says nothing about it.

### C2.1, the column toast on the black stage

- Good, because it stands out most from the white cards on cream.
- Bad, because a black block with a pink shadow looked aggressive on the light page, in a tool members open every week.

### A white raised card with a coloured icon tile

- Good, because it is the closest match to the page's cards and buttons.
- Bad, because on a page of white raised cards it read as one more card, not as something above the page.

### A toast filled with the level colour

- Good, because it is the most colourful.
- Bad, because a yellow warning vanishes on the yellow band and next to the yellow edit pill, and a lime block after every save gets loud in the members' area.

### A ticket with a perforated edge and notches

- Good, because a carnival ticket is fun.
- Bad, because the notches must take the colour of whatever lies behind the toast, and at 390px the edge looked busy.

## More Information

- ADR 0018 sets the five-minute window an attendance undo has on the server. ADR 0029 gives the raised look, and ADR 0040 the buttons the action and the ✕ use.
- #375 builds the toast, and #376 then gives `Notice` its levels.
