import type {
  EventResource,
  ReplaceRegistrationOptionsRequestForm,
} from "../../api/generated/model";
import { bandZoneParts, composeInBandZone } from "../../events/bandTime";

/**
 * The form's own settings as the strip at the top of the editor types them.
 *
 * Dates and times are separate boxes, as on the event form: `datetime-local`
 * renders and types differently from one phone browser to the next.
 */
export type FormSettings = {
  enabled: boolean;
  opensDate: string;
  opensTime: string;
  closesDate: string;
  closesTime: string;
  /** As typed; empty is no cap. */
  maxGuests: string;
  asksAddress: boolean;
  asksTable: boolean;
  /** Only logged-in members fill it in, with their account (ADR 0034). */
  membersOnly: boolean;
};

/**
 * The times a window gets when only its dates are typed: bookings open at
 * the start of the opening day and shut at the end of the closing one.
 * Nobody has an opinion about the minute, and both stay editable.
 */
const OPENS_AT_DEFAULT = "00:00";
const CLOSES_AT_DEFAULT = "23:59";

type Settings = Pick<
  EventResource,
  | "registrationEnabled"
  | "registrationOpensAt"
  | "registrationClosesAt"
  | "registrationMaxGuests"
  | "registrationAsksAddress"
  | "registrationAsksTable"
  | "registrationAudience"
>;

export function settingsFrom(event: Settings): FormSettings {
  // Split in Fribourg, never by slicing the ISO string (see ../../events/bandTime).
  const opens = event.registrationOpensAt ? bandZoneParts(event.registrationOpensAt) : null;
  const closes = event.registrationClosesAt ? bandZoneParts(event.registrationClosesAt) : null;

  return {
    enabled: event.registrationEnabled,
    opensDate: opens?.date ?? "",
    opensTime: opens?.time ?? OPENS_AT_DEFAULT,
    closesDate: closes?.date ?? "",
    closesTime: closes?.time ?? CLOSES_AT_DEFAULT,
    maxGuests: event.registrationMaxGuests === null ? "" : String(event.registrationMaxGuests),
    asksAddress: event.registrationAsksAddress,
    asksTable: event.registrationAsksTable,
    membersOnly: event.registrationAudience === "members",
  };
}

/** What the options PUT takes as `form`. */
export function settingsPayload(settings: FormSettings): ReplaceRegistrationOptionsRequestForm {
  const cap = settings.maxGuests.trim();

  return {
    registrationEnabled: settings.enabled,
    // A cleared time box is the default time: the date is what was meant.
    registrationOpensAt: instantOrNull(settings.opensDate, settings.opensTime || OPENS_AT_DEFAULT),
    registrationClosesAt: instantOrNull(
      settings.closesDate,
      settings.closesTime || CLOSES_AT_DEFAULT,
    ),
    // Checked by maxGuestsIsValid() before this is called: a NaN here would
    // travel as JSON null, which is no cap.
    registrationMaxGuests: cap === "" ? null : Number(cap),
    registrationAsksAddress: settings.asksAddress,
    registrationAsksTable: settings.asksTable,
    registrationAudience: settings.membersOnly ? "members" : "public",
  };
}

/** Empty is no cap; anything else must be a whole number from 1 to 100, as the API takes. */
export function maxGuestsIsValid(typed: string): boolean {
  const cap = typed.trim();

  return cap === "" || (/^\d+$/.test(cap) && Number(cap) >= 1 && Number(cap) <= 100);
}

/** A typed date and time as an instant, or null when no date was given. */
function instantOrNull(date: string, time: string): string | null {
  return date.trim() === "" ? null : composeInBandZone(date, time);
}
