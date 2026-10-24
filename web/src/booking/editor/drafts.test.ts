import { expect, test } from "vitest";

import type { EditableRegistrationOptionResource, EventResource } from "../../api/generated/model";
import { blankDraft, copiedDrafts, draftFrom, payloadOf } from "./drafts";
import { settingsFrom, settingsPayload } from "./settings";

function block(
  patch: Partial<EditableRegistrationOptionResource> = {},
): EditableRegistrationOptionResource {
  return {
    id: 6,
    kind: "choice",
    label: "Dessert",
    description: null,
    required: false,
    countsGuests: false,
    answers: [
      { id: "meringue", label: "Meringue" },
      { id: "tiramisu", label: "Tiramisu" },
    ],
    priceCents: null,
    capacity: null,
    remaining: null,
    sortOrder: 5,
    answered: true,
    pickedAnswerIds: ["meringue"],
    ...patch,
  };
}

test("a read block keeps what bookings hold in place", () => {
  const draft = draftFrom(block());

  expect(draft.answered).toBe(true);
  expect(draft.answers.map((answer) => answer.picked)).toEqual([true, false]);
});

test("a new block holds nothing in place", () => {
  const draft = blankDraft("choice");

  expect(draft.answered).toBe(false);
  expect(draft.answers.every((answer) => !answer.picked)).toBe(true);
});

/**
 * Copying another event's form must create blocks here, never update the
 * source's rows: an id sent to this event's PUT would be refused at best.
 *
 * Mutation test: keep `id` in copiedDrafts and the first expectation fails.
 */
test("a copied form arrives as new blocks with new answers", () => {
  const [copy] = copiedDrafts([block()]);

  expect(copy?.id).toBeNull();
  expect(copy?.answers.map((answer) => answer.id)).toEqual([null, null]);
  expect(copy?.answers.map((answer) => answer.label)).toEqual(["Meringue", "Tiramisu"]);
  expect(copy?.answered).toBe(false);
  expect(copy?.answers.some((answer) => answer.picked)).toBe(false);

  const sent = payloadOf(copy!, 0, null, null);
  expect(sent.id).toBeNull();
  expect(sent.answers?.map((answer) => answer.id)).toEqual([null, null]);
});

const SOUPER: Pick<
  EventResource,
  | "registrationEnabled"
  | "registrationOpensAt"
  | "registrationClosesAt"
  | "registrationMaxGuests"
  | "registrationAsksAddress"
  | "registrationAsksTable"
  | "registrationAudience"
> = {
  registrationEnabled: true,
  registrationOpensAt: null,
  // 23:59 in Fribourg, in winter.
  registrationClosesAt: "2027-02-14T22:59:00.000Z",
  registrationMaxGuests: 6,
  registrationAsksAddress: true,
  registrationAsksTable: false,
  registrationAudience: "public",
};

test("the settings read back as they were sent", () => {
  const settings = settingsFrom(SOUPER);

  expect(settings.closesDate).toBe("2027-02-14");
  expect(settings.closesTime).toBe("23:59");
  expect(settings.maxGuests).toBe("6");
  expect(settingsPayload(settings)).toEqual({
    registrationEnabled: true,
    registrationOpensAt: null,
    registrationClosesAt: "2027-02-14T23:59:00+01:00",
    registrationMaxGuests: 6,
    registrationAsksAddress: true,
    registrationAsksTable: false,
    registrationAudience: "public",
  });
});

test("a members form reads back as one and is sent as one", () => {
  const settings = settingsFrom({ ...SOUPER, registrationAudience: "members" });

  expect(settings.membersOnly).toBe(true);
  expect(settingsPayload(settings).registrationAudience).toBe("members");
});

test("an empty closing date or cap is sent as null", () => {
  const settings = { ...settingsFrom(SOUPER), closesDate: "", maxGuests: " " };

  expect(settingsPayload(settings).registrationClosesAt).toBeNull();
  expect(settingsPayload(settings).registrationMaxGuests).toBeNull();
});

/**
 * A cleared time box is the default time, not a broken instant: the date is
 * what the committee means, as on the event form.
 */
test("a cleared time falls back to the start or the end of the day", () => {
  const settings = {
    ...settingsFrom(SOUPER),
    closesTime: "",
    opensDate: "2027-01-10",
    opensTime: "",
  };

  expect(settingsPayload(settings).registrationClosesAt).toBe("2027-02-14T23:59:00+01:00");
  expect(settingsPayload(settings).registrationOpensAt).toBe("2027-01-10T00:00:00+01:00");
});

test("a form with no dates yet offers the end of the closing day", () => {
  const settings = settingsFrom({ ...SOUPER, registrationClosesAt: null });

  expect(settings.closesDate).toBe("");
  expect(settings.closesTime).toBe("23:59");
  expect(settings.opensTime).toBe("00:00");
});
