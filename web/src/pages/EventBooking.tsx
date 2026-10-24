import { useMutation } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import {
  registrationStore,
  useFormTokenShow,
  useRegistrationForm,
} from "../api/generated/endpoints";
import type { RegistrationFormResource, RegistrationResource } from "../api/generated/model";
import { ApiError } from "../api/http";
import { newIdempotencyKey, publicWriteHeaders } from "../api/publicWrite";
import { useApiFormError } from "../api/useApiFormError";
import { celebrate } from "../carnival/celebrate";
import { PageHero } from "../carnival/PageHero";
import { RAISED_CARD } from "../carnival/raised";
import { PageSection } from "../components/PageSection";
import { AnswerFields } from "../booking/AnswerFields";
import { AnswersSummary } from "../booking/AnswersSummary";
import { EMPTY, FIELDS, type Contact } from "../booking/contactFields";
import { MemberBooking } from "../booking/MemberBooking";
import { useAnswers } from "../booking/useAnswers";
import { FormError, FormField, RequiredLegend, formIsValid } from "../components/FormField";
import { formatEventWhen } from "../events/formatEventWhen";
import { t } from "../i18n";
import { formatDay } from "../lib/date";
import { useSession } from "../session/SessionProvider";

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
 * which it is. A form for members only answers that 404 to a visitor who is
 * not logged in; a member gets MemberBooking instead (ADR 0034).
 */
export function EventBooking() {
  const { id } = useParams();
  const eventId = Number(id);
  const { can, user } = useSession();
  const location = useLocation();

  // The way into the editor, from the form it changes. Offered beside a
  // closed form too, which answers 404 to everybody, the committee included.
  const editLink = can("events.manage") ? (
    <Button asChild variant="raised-light" className="mb-related w-fit">
      <Link to={`/events/${eventId}/book/edit`}>{t("booking.editForm")}</Link>
    </Button>
  ) : null;

  const [contact, setContact] = useState<Contact>(EMPTY);
  const [website, setWebsite] = useState("");
  const [booked, setBooked] = useState<RegistrationResource | null>(null);
  const bookedHeading = useRef<HTMLHeadingElement>(null);

  const idempotencyKey = useRef(newIdempotencyKey());

  const form = useRegistrationForm(eventId, {
    query: { retry: false },
  });

  const offer: RegistrationFormResource | null = form.data?.status === 200 ? form.data.data : null;
  const typed = useAnswers(offer);

  // Pinned as the contact form's is: the server refuses a token under two
  // seconds old, so a refetch on a focus change would replace a good token
  // with one that cannot work yet.
  //
  // Only for a public form: a member's booking needs no token, and minting one
  // spends a slot of the public write limiter.
  const formToken = useFormTokenShow({
    query: {
      enabled: offer !== null && offer.audience !== "members",
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  });

  const { error, setFromThrown, clear, messageFor } = useApiFormError(t("booking.submitFailed"));

  const send = useMutation({
    mutationFn: (token: string) =>
      registrationStore(
        eventId,
        {
          ...contact,
          address: contact.address.trim() === "" ? null : contact.address,
          tableName: contact.tableName.trim() === "" ? null : contact.tableName,
          choices: typed.lines,
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
    onError: (thrown) => {
      setFromThrown(thrown);
      // Somebody may have taken the last places since the form loaded; a
      // refusal is when the guest needs the count as it is now.
      void form.refetch();
    },
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
          {editLink}
          <p className="text-ink-muted">
            {form.error instanceof ApiError && form.error.status === 404
              ? t("booking.notOpen")
              : t("booking.loadFailed")}
          </p>
          {/* On every 404 to a visitor who is not logged in, so it says nothing
            about whether a members form is behind this address. */}
          {user === null && form.error instanceof ApiError && form.error.status === 404 ? (
            <p className="mt-related text-ink-muted">
              {t("booking.membersLogIn")}{" "}
              <Link to="/login" state={{ from: location.pathname }} className="underline">
                {t("nav.login")}
              </Link>
            </p>
          ) : null}
        </PageSection>
      </>
    );
  }

  if (offer.audience === "members") {
    return <MemberBooking eventId={eventId} offer={offer} editLink={editLink} />;
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
            <AnswersSummary booking={booked} countsPeople={typed.countsPeople} />
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
        {editLink}
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
                  {/* Address and table are the form's to ask for (ADR 0033);
                    the other four every booking needs. */}
                  {FIELDS.filter(
                    (field) =>
                      (field.name !== "address" || offer.asksAddress) &&
                      (field.name !== "tableName" || offer.asksTable),
                  ).map((field) => (
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

                <AnswerFields offer={offer} form={typed} messageFor={messageFor} />

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
