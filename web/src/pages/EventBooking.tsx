import { useMutation } from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
import { celebrate } from "../carnival/celebrate";
import { PageHero } from "../carnival/PageHero";
import { RAISED_CARD } from "../carnival/raised";
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

/** The contact fields, in the order a Swiss committee needs them. */
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
 * Anonymous, and with /contact the only page where a stranger can make the
 * server write. It takes the same three protections as Contact.tsx: see
 * `web/src/api/publicWrite.ts`.
 *
 * Reached by link from /agenda or by a URL the band shared. There is no
 * public list of bookable events, by design.
 *
 * `open` is the server's answer and is never derived here from the two dates
 * it also sends: a browser with a wrong clock would render a form for a
 * closed event. The dates are only displayed.
 *
 * An event that takes no bookings answers 404 whether or not it exists, and
 * the page renders the same sentence either way, so a stranger cannot tell
 * which it is.
 */
export function EventBooking() {
  const { id } = useParams();
  const eventId = Number(id);

  const [contact, setContact] = useState<Contact>(EMPTY);
  const [website, setWebsite] = useState("");
  // Keyed by option id. A missing key is none of that option, so an untouched
  // form sends nothing instead of a row of zeroes.
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [booked, setBooked] = useState<RegistrationResource | null>(null);
  const bookedHeading = useRef<HTMLHeadingElement>(null);

  const idempotencyKey = useRef(newIdempotencyKey());

  const form = useRegistrationForm(eventId, {
    query: { retry: false },
  });

  // Pinned as the contact form's is: the server refuses a token under two
  // seconds old, so a refetch on a focus change would replace a good token
  // with one that cannot work yet.
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
        // The confirmation replaces a form several screens long in place, and
        // the window keeps the submit button's offset, so a guest on a phone
        // would land on the footer with focus on <body>. flushSync renders the
        // heading now, so it can be scrolled to and focused before the browser
        // paints. The scroll is instant, like ScrollToTop's.
        flushSync(() => setBooked(result.data));
        window.scrollTo(0, 0);
        bookedHeading.current?.focus({ preventScroll: true });
        celebrate();
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
      <>
        <PageHero title={t("events.registrations")} seed={13} width="text" />
        <PageSection width="text">
          <p className="text-ink-muted">
            {form.error instanceof ApiError && form.error.status === 404
              ? t("booking.notOpen")
              : t("booking.loadFailed")}
          </p>
        </PageSection>
      </>
    );
  }

  if (booked) {
    return (
      <>
        <PageHero
          title={t("booking.bookedHeading")}
          seed={13}
          width="text"
          headingRef={bookedHeading}
        />
        <PageSection width="text">
          <p className="text-ink-muted">
            {t("booking.bookedBody", { email: booked.email, phone: booked.phone })}
          </p>

          <Card className={cn(RAISED_CARD, "mt-related gap-tight p-5")}>
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
            <p className="mt-tight" data-testid="booked-guests">
              {/* Null is not zero: a booking of unpriced options owes an
                unknown amount, not "CHF 0.00". */}
              {booked.totalCents === null
                ? t("common.guests", { count: booked.guestCount })
                : t("booking.guestsWithTotal", {
                    guests: t("common.guests", { count: booked.guestCount }),
                    total: formatCents(booked.totalCents),
                  })}
            </p>
          </Card>
        </PageSection>
      </>
    );
  }

  return (
    <>
      {/* The event's own title, so no highlight: its words are content, and
          nothing here knows which of them matters. */}
      <PageHero title={offer.event.title} seed={13} width="text">
        <p>
          {formatEventWhen(offer.event.startsAt, offer.event.endsAt)} — {offer.event.location}
        </p>
      </PageHero>

      <PageSection width="text">
        {!offer.open ? (
          <p className={cn(RAISED_CARD, "bg-yellow p-4")} role="status">
            {offer.opensAt !== null && Date.parse(offer.opensAt) > Date.now()
              ? t("booking.opensOn", { date: formatDay(offer.opensAt) })
              : t("booking.closed")}
          </p>
        ) : null}

        {offer.open ? (
          <>
            <p className="text-ink-muted">
              {offer.closesAt === null
                ? null
                : `${t("booking.closesOn", { date: formatDay(offer.closesAt) })} `}
              {offer.maxGuests === null ? null : t("booking.maxGuests", { count: offer.maxGuests })}
            </p>

            <FormError error={error} />

            {/* Raised like every card on cream, but the fields inside stay the
              plain vendored inputs: decoration stays out of anything a person
              types into (ADR 0029). */}
            <Card asChild className={cn(RAISED_CARD, "mt-related gap-0 p-5")}>
              <form onSubmit={submit} noValidate className="space-y-related">
                <fieldset className="flex flex-col gap-related">
                  <legend className="mb-tight heading-wave w-fit font-display text-xl">
                    {t("booking.contactLegend")}
                  </legend>
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
                  <legend className="mb-tight heading-wave w-fit font-display text-xl">
                    {t("booking.choiceLegend")}
                  </legend>

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

                  {/* The refusal for the whole list lands on `choices`, as the
                    server sends it: no single quantity is wrong when the sum
                    is. */}
                  {messageFor("choices") ? (
                    <span className="text-sm text-danger" role="alert">
                      {messageFor("choices")}
                    </span>
                  ) : null}

                  {/* The running total, which is why prices travel as integers:
                    a guest reads what a choice costs before submitting. */}
                  <p className="text-ink" data-testid="booking-total">
                    {/* The count's plural comes from the catalogue: `guests > 1`
                      is the French rule, and wrong for "0 Person" in German. */}
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

                {/* The honeypot, as on the contact form: hidden from people and
                  assistive technology, a real control whose value is submitted,
                  and refused when absent as firmly as when filled. */}
                <input
                  type="text"
                  name="website"
                  hidden
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(changed) => setWebsite(changed.target.value)}
                />

                <Button
                  type="submit"
                  variant="raised-violet"
                  className="h-12 px-5 text-base"
                  aria-disabled={send.isPending}
                >
                  {send.isPending ? t("booking.sending") : t("booking.submit")}
                </Button>
              </form>
            </Card>
          </>
        ) : null}
      </PageSection>
    </>
  );
}

/**
 * How many of one option, with what it costs beside it.
 *
 * A number input, not a checkbox: one booking carries quantities such as
 * "3 × viande, 1 × enfant".
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
    // A grid, not `flex flex-wrap justify-between`: wrapping at 390px moved a
    // long option's box under its description, away from the other boxes. The
    // grid wraps the text inside its cell and keeps every box on the right.
    <div className="grid grid-cols-[1fr_auto] items-start gap-tight">
      <div className="flex flex-col">
        <label htmlFor={id}>
          {option.label}
          {/* Null, not zero: an option whose price lives in its description
              says nothing here instead of claiming to be free. */}
          {option.priceCents === null ? null : (
            <span className="text-ink-muted"> — {formatCents(option.priceCents)}</span>
          )}
        </label>
        {option.description ? (
          <span className="text-sm text-ink-muted">{option.description}</span>
        ) : null}
      </div>

      {/* The vendored Input, which carries the 44px floor (`min-h-touch`); a
          bare input with `px-3 py-2` is 42px high. `w-20` wins over its
          `w-full` because `cn` tailwind-merges. */}
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
