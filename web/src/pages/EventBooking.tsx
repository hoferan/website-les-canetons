import { useMutation } from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import {
  registrationStore,
  useFormTokenShow,
  useRegistrationForm,
} from "../api/generated/endpoints";
import type {
  RegistrationFormResource,
  RegistrationOptionResource,
  RegistrationResource,
} from "../api/generated/model";
import { ApiError } from "../api/http";
import { newIdempotencyKey, publicWriteHeaders } from "../api/publicWrite";
import { useApiFormError } from "../api/useApiFormError";
import { PageSection } from "../components/PageSection";
import {
  FormError,
  FormField,
  RequiredLegend,
  formIsValid,
  useBrowserProblem,
} from "../components/FormField";
import { formatEventWhen } from "../events/formatEventWhen";
import { t, type TranslationKey } from "../i18n";
import { formatDay } from "../lib/date";
import { formatCents } from "../money";

/** The contact fields, in the order a Swiss committee needs them (G4). */
const FIELDS: {
  name: "lastName" | "firstName" | "email" | "phone" | "address" | "tableName";
  labelKey: TranslationKey;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  hintKey?: TranslationKey;
}[] = [
  {
    name: "lastName",
    labelKey: "booking.fields.lastName",
    autoComplete: "family-name",
    required: true,
  },
  {
    name: "firstName",
    labelKey: "booking.fields.firstName",
    autoComplete: "given-name",
    required: true,
  },
  {
    name: "email",
    labelKey: "booking.fields.email",
    type: "email",
    autoComplete: "email",
    required: true,
  },
  {
    name: "phone",
    labelKey: "booking.fields.phone",
    type: "tel",
    autoComplete: "tel",
    required: true,
  },
  { name: "address", labelKey: "booking.fields.address", autoComplete: "street-address" },
  { name: "tableName", labelKey: "booking.fields.tableName", hintKey: "booking.tableHint" },
];

type Contact = Record<(typeof FIELDS)[number]["name"], string>;

const EMPTY: Contact = {
  lastName: "",
  firstName: "",
  email: "",
  phone: "",
  address: "",
  tableName: "",
};

/**
 * Book a place at an event.
 *
 * ANONYMOUS, and the only page besides /contact that a stranger can make the
 * server write from. It owes the same three protections and obtains each at
 * the same moment — see `web/src/api/publicWrite.ts` and Contact.tsx, which
 * this follows rather than re-argues.
 *
 * THE PAGE IS REACHED BY LINK FROM /agenda OR BY A URL THE BAND SHARED. There
 * is no public list of bookable events and there is not meant to be: the
 * souper is one evening a year, advertised on a flyer and on Facebook, and the
 * agenda's own card is the second way in.
 *
 * `open` IS THE SERVER'S ANSWER AND IS NEVER DERIVED HERE from the two dates
 * it also sends. A browser with a wrong clock would otherwise render a form
 * for a closed event and the refusal would arrive only after the guest had
 * filled it in. The dates are rendered, because "les inscriptions ouvrent le
 * 3 octobre" is what the reader came for; the decision is not taken from them.
 *
 * AN EVENT THAT TAKES NO BOOKINGS ANSWERS 404, whether or not it exists, and
 * that refusal is rendered as the same sentence either way. The server is
 * deliberate about not telling a stranger which of the two it is, and a page
 * that said "cet événement existe mais…" would give it away.
 */
export function EventBooking() {
  const { id } = useParams();
  const eventId = Number(id);

  const [contact, setContact] = useState<Contact>(EMPTY);
  const [website, setWebsite] = useState("");
  // Keyed by option id. A missing key is none of that option, which is what
  // makes an untouched form send nothing rather than a row of zeroes.
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [booked, setBooked] = useState<RegistrationResource | null>(null);

  const idempotencyKey = useRef(newIdempotencyKey());

  const form = useRegistrationForm(eventId, {
    query: { retry: false },
  });

  // Pinned exactly as the contact form's is: the server refuses a token under
  // two seconds old, so a refetch on a focus change would replace a good token
  // with the one value that cannot work, at the worst possible moment.
  const formToken = useFormTokenShow({
    query: {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  });

  const { error, setFromThrown, clear, messageFor } = useApiFormError(t("booking.submitFailed"));

  const offer: RegistrationFormResource | null = form.data?.status === 200 ? form.data.data : null;

  const chosen = useMemo(
    () =>
      (offer?.options ?? [])
        .map((option) => ({ option, quantity: Number(quantities[option.id] ?? "0") }))
        .filter((line) => Number.isInteger(line.quantity) && line.quantity > 0),
    [offer, quantities],
  );

  const guests = chosen.reduce((sum, line) => sum + line.quantity, 0);
  const priced = chosen.filter((line) => line.option.priceCents !== null);
  const total = priced.reduce(
    (sum, line) => sum + (line.option.priceCents ?? 0) * line.quantity,
    0,
  );

  const send = useMutation({
    mutationFn: (token: string) =>
      registrationStore(
        eventId,
        {
          ...contact,
          address: contact.address.trim() === "" ? null : contact.address,
          tableName: contact.tableName.trim() === "" ? null : contact.tableName,
          choices: chosen.map((line) => ({
            optionId: line.option.id,
            quantity: line.quantity,
          })),
          website,
        },
        publicWriteHeaders(token, idempotencyKey.current),
      ),
    onSuccess: (result) => {
      if (result.status === 201) {
        setBooked(result.data);
      }
    },
    onError: setFromThrown,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // aria-disabled leaves the control clickable and Enter in a field submits
    // regardless, so this early return is the only thing preventing a double
    // booking.
    if (send.isPending) return;
    clear();
    if (!formIsValid(event.currentTarget)) return;

    const token = formToken.data?.status === 200 ? formToken.data.data.token : null;
    if (!token) {
      setFromThrown(new Error("no form token"));
      return;
    }

    send.mutate(token);
  }

  if (form.isPending) {
    return (
      <PageSection width="text">
        <p className="text-ink-muted">{t("common.loading")}</p>
      </PageSection>
    );
  }

  if (!offer) {
    return (
      <PageSection width="text">
        <h1 className="font-display text-3xl">{t("events.registrations")}</h1>
        <p className="mt-related text-ink-muted">
          {form.error instanceof ApiError && form.error.status === 404
            ? t("booking.notOpen")
            : t("booking.loadFailed")}
        </p>
      </PageSection>
    );
  }

  if (booked) {
    return (
      <PageSection width="text">
        <h1 className="font-display text-3xl">{t("booking.bookedHeading")}</h1>
        <p className="mt-related text-ink-muted">
          {t("booking.bookedBody", { email: booked.email, phone: booked.phone })}
        </p>

        <Card className="mt-related gap-tight p-5">
          <p className="font-display text-xl">{offer.event.title}</p>
          <p className="text-ink-muted">
            {formatEventWhen(offer.event.startsAt, offer.event.endsAt)}
          </p>
          <ul className="mt-tight grid gap-1" data-testid="booking-summary">
            {booked.choices.map((choice) => (
              <li key={choice.optionId}>
                {choice.quantity} × {choice.label}
              </li>
            ))}
          </ul>
          <p className="mt-tight">
            {booked.guestCount} personne{booked.guestCount > 1 ? "s" : ""}
            {/* Null is not zero: a booking of unpriced options owes an unknown
                amount, and "CHF 0.00" would assert the first about the
                second. */}
            {booked.totalCents === null ? null : <> — {formatCents(booked.totalCents)}</>}
          </p>
        </Card>
      </PageSection>
    );
  }

  return (
    <PageSection width="text">
      <h1 className="font-display text-3xl">{offer.event.title}</h1>
      <p className="mt-tight text-ink-muted">
        {formatEventWhen(offer.event.startsAt, offer.event.endsAt)} — {offer.event.location}
      </p>

      {!offer.open ? (
        <p className="mt-related rounded-md border border-line bg-panel p-4" role="status">
          {offer.opensAt !== null && Date.parse(offer.opensAt) > Date.now()
            ? t("booking.opensOn", { date: formatDay(offer.opensAt) })
            : t("booking.closed")}
        </p>
      ) : null}

      {offer.open ? (
        <>
          <p className="mt-related text-ink-muted">
            {offer.closesAt === null
              ? null
              : `${t("booking.closesOn", { date: formatDay(offer.closesAt) })} `}
            {offer.maxGuests === null ? null : t("booking.maxGuests", { count: offer.maxGuests })}
          </p>

          <FormError error={error} />

          <Card asChild className="mt-related gap-0 p-5">
            <form onSubmit={submit} noValidate className="space-y-related">
              <fieldset className="flex flex-col gap-related">
                <legend className="font-display text-xl">{t("booking.contactLegend")}</legend>
                <RequiredLegend />
                {FIELDS.map((field) => (
                  <FormField
                    key={field.name}
                    id={`booking-${field.name}`}
                    label={t(field.labelKey)}
                    type={field.type}
                    required={field.required}
                    hint={field.hintKey ? t(field.hintKey) : undefined}
                    autoComplete={field.autoComplete}
                    problem={messageFor(field.name)}
                    value={contact[field.name]}
                    onChange={(value) =>
                      setContact((current) => ({ ...current, [field.name]: value }))
                    }
                  />
                ))}
              </fieldset>

              <fieldset className="flex flex-col gap-related">
                <legend className="font-display text-xl">{t("booking.choiceLegend")}</legend>

                {offer.options.length === 0 ? (
                  <p className="text-ink-muted">{t("booking.nothingOffered")}</p>
                ) : null}

                {offer.options.map((option) => (
                  <QuantityField
                    key={option.id}
                    option={option}
                    value={quantities[option.id] ?? ""}
                    onChange={(value) =>
                      setQuantities((current) => ({ ...current, [option.id]: value }))
                    }
                  />
                ))}

                {/* The refusal for the whole list lands on `choices`, which is
                    where the server puts it too: no single quantity is wrong
                    when the sum is. */}
                {messageFor("choices") ? (
                  <span className="text-sm text-danger" role="alert">
                    {messageFor("choices")}
                  </span>
                ) : null}

                {/* THE RUNNING TOTAL, and it is the reason the prices are on
                    the wire as integers. A guest deciding between two adult
                    meals and three should be able to read what each costs
                    before submitting, not after. */}
                <p className="text-ink" data-testid="booking-total">
                  {/* THE COUNT IS THE CATALOGUE'S. `guests > 1` is the FRENCH
                      plural rule, which puts "0 personne" on a French page
                      correctly and "0 Person" on a German one wrongly. */}
                  {guests === 0
                    ? t("booking.chooseSomeone")
                    : priced.length === 0
                      ? t("common.guests", { count: guests })
                      : t("booking.guestsWithTotal", {
                          guests: t("common.guests", { count: guests }),
                          total: formatCents(total),
                        })}
                </p>
              </fieldset>

              {/* The honeypot, written out exactly as the contact form's:
                  hidden from people and from assistive technology, a real
                  control whose value is submitted, and refused when absent as
                  firmly as when filled. */}
              <input
                type="text"
                name="website"
                hidden
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(changed) => setWebsite(changed.target.value)}
              />

              <Button type="submit" aria-disabled={send.isPending}>
                {send.isPending ? t("booking.sending") : t("booking.submit")}
              </Button>
            </form>
          </Card>
        </>
      ) : null}
    </PageSection>
  );
}

/**
 * How many of one option, with what it costs beside it.
 *
 * A NUMBER INPUT RATHER THAN A CHECKBOX, because the old souper already did
 * quantities — "3 × viande, 1 × enfant" in one booking — and a checkbox per
 * option would have made the same family fill the form four times.
 */
function QuantityField({
  option,
  value,
  onChange,
}: {
  option: RegistrationOptionResource;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `option-${option.id}`;
  const errorId = `${id}-error`;
  // Outside FormField, so the browser's finding is picked up by hand. `max` is
  // 50, and without this a 99 typed here blocks the submit with no message.
  const browser = useBrowserProblem(option.label);

  return (
    // A GRID, NOT `flex flex-wrap justify-between`, and this was measured at
    // 390px rather than reasoned about. Wrapping put "Sans repas"'s box on a
    // line of its own, left-aligned under its description, while the two
    // priced options kept theirs on the right — three boxes in two columns,
    // and the odd one reading as if it belonged to nothing. A two-column grid
    // wraps the TEXT inside its own cell and leaves the box where it is at
    // every width.
    <div className="grid grid-cols-[1fr_auto] items-start gap-tight">
      <div className="flex flex-col">
        <label htmlFor={id}>
          {option.label}
          {/* Null, not zero. An option whose price lives in its description
              says nothing here rather than claiming to be free. */}
          {option.priceCents === null ? null : (
            <span className="text-ink-muted"> — {formatCents(option.priceCents)}</span>
          )}
        </label>
        {option.description ? (
          <span className="text-sm text-ink-muted">{option.description}</span>
        ) : null}
      </div>

      {/* THE VENDORED Input, not a hand-rolled one. MEASURED in a browser:
          the first version of this control came out 42px high against this
          project's 44px floor, because `px-3 py-2` on a bare input is two
          pixels short of it and nothing says so. `min-h-touch` lives in
          Input; `w-20` wins over its `w-full` because `cn` tailwind-merges
          rather than concatenating. */}
      <Input
        id={id}
        type="number"
        min={0}
        max={50}
        inputMode="numeric"
        className="w-20"
        value={value}
        placeholder="0"
        aria-invalid={browser.problem ? true : undefined}
        aria-describedby={browser.problem ? errorId : undefined}
        onInvalid={browser.onInvalid}
        onChange={(changed) => {
          browser.clear();
          onChange(changed.target.value);
        }}
      />
      {browser.problem ? (
        <span id={errorId} className="col-span-2 text-sm text-danger">
          {browser.problem}
        </span>
      ) : null}
    </div>
  );
}
