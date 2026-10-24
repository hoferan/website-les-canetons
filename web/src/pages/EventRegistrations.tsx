import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { rowsOf, totalOf } from "../api/collection";
import { downloadGuestList, type ExportFormat } from "../api/download";
import {
  getRegistrationIndexQueryKey,
  registrationDestroy,
  registrationShow,
  registrationUpdate,
  useEventShow,
  useRegistrationIndex,
} from "../api/generated/endpoints";
import type {
  RegistrationResource,
  RegistrationResourceChoicesItem,
  UpdateRegistrationRequest,
} from "../api/generated/model";
import { ApiError } from "../api/http";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { ConfirmByTypingName } from "../components/ConfirmByTypingName";
import { ContactLink } from "../components/ContactLink";
import { FormError, FormField, RequiredLegend, formIsValid } from "../components/FormField";
import { PageSection } from "../components/PageSection";
import { RowActions, type RowAction } from "../components/RowActions";
import { formatEventWhen } from "../events/formatEventWhen";
import { translateApiError } from "../i18n";
import { t, type TranslationKey } from "../i18n";
import { formatCents } from "../money";
import { useSession } from "../session/SessionProvider";
import { OUTLINED_CARD } from "../carnival/raised";

/**
 * The four downloads, in the order the committee reaches for them. Markdown
 * and JSON are developer formats, so they sit behind
 * `registrations.moreFormats`.
 */
const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "xlsx", label: "Excel" },
  { format: "csv", label: "CSV" },
];
const MORE_FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "md", label: "Markdown" },
  { format: "json", label: "JSON" },
];

/**
 * `labelKey`, never `label`: a module-level `label: t(...)` freezes in
 * whatever locale was active at import.
 *
 * The keys are booking.fields.*, not a second set: this form amends the
 * booking the public form created, so the same fields take the same words.
 */
const AMENDABLE: {
  name: keyof UpdateRegistrationRequest;
  labelKey: TranslationKey;
  type?: string;
  required?: boolean;
}[] = [
  // Required as they are on the booking form. The API's rules are
  // `sometimes|required`, and this form always sends all four.
  { name: "lastName", labelKey: "booking.fields.lastName", required: true },
  { name: "firstName", labelKey: "booking.fields.firstName", required: true },
  { name: "email", labelKey: "booking.fields.email", type: "email", required: true },
  { name: "phone", labelKey: "booking.fields.phone", type: "tel", required: true },
  { name: "address", labelKey: "booking.fields.address" },
  { name: "tableName", labelKey: "booking.fields.tableName" },
];

/**
 * Who has booked a place, and what they ordered.
 *
 * Two permissions on one screen. The route is guarded on
 * `registrations.view`, which the `committee` role holds to read this list.
 * Correcting a name and cancelling a booking are `registrations.manage`, a
 * different act on somebody else's personal data, so those controls are
 * absent for a viewer. The server enforces both; this mirrors it.
 *
 * The counts are the server's: `guestCount` and `totalCents` come per booking
 * so the screen, the downloads and the confirmation mail cannot disagree. The
 * totals row sums them, and nothing here multiplies a price by a quantity.
 *
 * One layout, cards at every width in a grid that widens.
 *
 * Amending starts by reading the one booking, and the PATCH quotes that
 * read's tag. The list hands out none, and the read opens the right
 * concurrency window: a fresh tag fetched at save time would satisfy the
 * server and protect nobody.
 */
export function EventRegistrations() {
  const { id } = useParams();
  const eventId = Number(id);
  const { can } = useSession();
  const queryClient = useQueryClient();

  const event = useEventShow(eventId);
  const list = useRegistrationIndex(eventId);

  const form = useApiFormError(t("registrations.amendFailed"));
  const destructive = useApiFormError(t("registrations.cancelFailed"));

  const [amending, setAmending] = useState<{
    booking: RegistrationResource;
    etag: string | null;
  } | null>(null);
  const [cancelling, setCancelling] = useState<{
    booking: RegistrationResource;
    etag: string | null;
  } | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<ExportFormat | null>(null);
  // Not a toast: a refused download is read beside the button that was
  // pressed, and `xlsx_unavailable` is something an operator can act on
  // (ask the host for ext-zip, or use CSV).
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Both writes are conditional, so both are built by hand over the generated
  // functions: orval's mutation hooks fix their request options at creation,
  // and the tag differs per call. See web/src/api/ifMatch.ts.
  const amend = useMutation({
    mutationFn: ({
      booking,
      data,
      etag,
    }: {
      booking: number;
      data: UpdateRegistrationRequest;
      etag: string;
    }) => registrationUpdate(booking, data, ifMatch(etag)),
  });

  const cancel = useMutation({
    mutationFn: ({ booking, etag }: { booking: number; etag: string }) =>
      registrationDestroy(booking, ifMatch(etag)),
  });

  const bookings = rowsOf<RegistrationResource>(list.data);
  const bookingCount = totalOf(list.data);
  const mayManage = can("registrations.manage");

  const guests = bookings.reduce((sum, booking) => sum + booking.guestCount, 0);
  const priced = bookings.filter((booking) => booking.totalCents !== null);
  const total = priced.reduce((sum, booking) => sum + (booking.totalCents ?? 0), 0);
  const paidCount = priced.filter((booking) => booking.paidAt !== null).length;
  const perOption = optionTotalsOf(bookings);
  const perAnswer = answerTotalsOf(bookings);

  const title = event.data?.status === 200 ? event.data.data : null;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getRegistrationIndexQueryKey(eventId) });

  /** Reads one booking, and keeps the tag that read handed out. */
  async function read(
    booking: RegistrationResource,
  ): Promise<{ booking: RegistrationResource; etag: string | null } | null> {
    setReadError(null);
    setOpening(booking.id);
    try {
      const response = await registrationShow(booking.id);
      if (response.status !== 200) {
        // Unreachable, since the mutator throws on every non-2xx, but the
        // declared union includes it.
        setReadError(t("registrations.loadFailed"));
        return null;
      }
      return { booking: response.data, etag: entityTagOf(response) };
    } catch {
      setReadError(t("registrations.loadFailedReload"));
      return null;
    } finally {
      setOpening(null);
    }
  }

  async function openAmend(row: RegistrationResource) {
    form.clear();
    const loaded = await read(row);
    if (loaded) {
      setAmending(loaded);
    }
  }

  async function openCancel(row: RegistrationResource) {
    destructive.clear();
    const loaded = await read(row);
    if (loaded) {
      setCancelling(loaded);
    }
  }

  async function saveAmendment(data: UpdateRegistrationRequest) {
    if (!amending) {
      return;
    }
    if (amending.etag === null) {
      // No tag means the write would be refused 428, which reads as a broken
      // screen, so say so and stop.
      setReadError(t("registrations.loadFailedReload"));
      return;
    }

    form.clear();
    try {
      await amend.mutateAsync({ booking: amending.booking.id, data, etag: amending.etag });
    } catch (thrown) {
      // The panel stays open, so a rejected e-mail is corrected where it was
      // typed.
      form.setFromThrown(thrown);
      return;
    }

    setAmending(null);
    await refresh();
  }

  async function confirmCancel() {
    if (!cancelling || cancelling.etag === null) {
      return;
    }

    destructive.clear();
    try {
      await cancel.mutateAsync({ booking: cancelling.booking.id, etag: cancelling.etag });
    } catch (thrown) {
      // The dialog stays open, so a 412 is read where the action was taken.
      destructive.setFromThrown(thrown);
      return;
    }

    setCancelling(null);
    await refresh();
  }

  /**
   * Records the payment, or takes it back, the moment the switch is flipped.
   * No dialog: flipping it back undoes it, and at the door there is a queue.
   *
   * Read-then-write like the amend form, because the PATCH is conditional;
   * the concurrency window is only as wide as the flip. It sends what the
   * switch says, not the inverse of the fresh read, so turning it on never
   * takes back a payment somebody else just recorded. The server keeps the
   * first stamp.
   *
   * It throws, and the card shows the refusal beside the switch that was
   * flipped.
   */
  async function savePaid(row: RegistrationResource, paid: boolean) {
    const loaded = await registrationShow(row.id);
    const etag = loaded.status === 200 ? entityTagOf(loaded) : null;
    if (etag === null) {
      // No tag means the write would be refused 428, so the card says the
      // save failed without sending it.
      throw new Error("The booking was read without an ETag.");
    }
    await registrationUpdate(row.id, { paid }, ifMatch(etag));
    await refresh();
  }

  async function download(format: ExportFormat) {
    setDownloading(format);
    setDownloadError(null);
    try {
      await downloadGuestList(eventId, format, `inscriptions.${format}`);
    } catch (thrown) {
      setDownloadError(
        thrown instanceof ApiError
          ? translateApiError(thrown).message
          : t("registrations.downloadFailed"),
      );
    } finally {
      setDownloading(null);
    }
  }

  return (
    <PageSection>
      <Link to="/events" className="text-sm text-ink-muted underline">
        {t("common.backToPlanning")}
      </Link>

      {/* The same key as the planning's link to this screen. */}
      <h1 className="mt-tight font-display text-3xl">{t("events.registrations")}</h1>

      {title ? (
        <p data-testid="guest-event" className="mt-tight text-ink-muted">
          {title.title} — {formatEventWhen(title.startsAt, title.endsAt)}
        </p>
      ) : null}

      {list.isPending ? <p className="mt-block text-ink-muted">{t("common.loading")}</p> : null}

      {list.isError ? (
        <p role="alert" className="mt-block text-red-700">
          {t("registrations.listLoadFailed")}
        </p>
      ) : null}

      {!list.isPending && !list.isError ? (
        <p data-testid="guest-counts" className="mt-block text-lg">
          {/* Both counts are pluralised by the catalogue: a `> 1` rule is
              French, and wrong in German, where zero is plural. */}
          {t("registrations.bookings", { count: bookingCount ?? bookings.length })}
          {/* Left out when nobody is counted: a list of answers alone. */}
          {guests === 0 ? null : (
            <>
              {t("registrations.countsSeparator")}
              {t("common.guests", { count: guests })}
            </>
          )}
          {/* Nothing when no booking carries a price, instead of CHF 0.00 over
              unpriced options. */}
          {priced.length === 0 ? null : <> · {formatCents(total)}</>}
          {priced.length === 0 ? null : (
            <>
              {t("registrations.countsSeparator")}
              {t("registrations.paidCount", { paid: paidCount, count: priced.length })}
            </>
          )}
        </p>
      ) : null}

      {/* What the kitchen is told: a sum of the quantities the server sent
          per booking, the same numbers as every download's totals row. */}
      {perOption.length > 0 ? (
        <div
          data-testid="option-totals"
          className="mt-tight flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-related"
        >
          <span className="text-ink-muted">{t("registrations.optionTotalsLabel")}</span>
          {/* One per line on a phone, where a wrapped row reads as two
              groups. */}
          <ul className="flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-related">
            {perOption.map((option) => (
              <li key={option.optionId} className="font-semibold">
                {t("registrations.optionTotal", { count: option.quantity, label: option.label })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* The same, for the questions: how many picked each answer. */}
      {perAnswer.length > 0 ? (
        <div data-testid="answer-totals" className="mt-tight flex flex-col">
          <span className="text-ink-muted">{t("registrations.answerTotalsLabel")}</span>
          <ul className="flex flex-col">
            {perAnswer.map((entry) => (
              <li key={entry.key} className="font-semibold">
                {t("booking.answered", {
                  question: entry.question,
                  answer: t("registrations.optionTotal", {
                    count: entry.count,
                    label: entry.answer,
                  }),
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-related flex flex-wrap items-center gap-tight">
        {FORMATS.map(({ format, label }) => (
          <DownloadButton
            key={format}
            label={label}
            busy={downloading === format}
            onClick={() => {
              if (downloading !== null) {
                return;
              }
              void download(format);
            }}
          />
        ))}
      </div>
      {/* A disclosure, not a menu: it opens in place and needs no floating
          layer for two buttons. It sits below the row, because inside it the
          open buttons wrap in beside Excel at a different height. */}
      <details className="mt-tight">
        <summary className="cursor-pointer text-sm text-ink-muted underline">
          {t("registrations.moreFormats")}
        </summary>
        <div className="mt-tight flex flex-wrap gap-tight">
          {MORE_FORMATS.map(({ format, label }) => (
            <DownloadButton
              key={format}
              label={label}
              busy={downloading === format}
              onClick={() => {
                if (downloading !== null) {
                  return;
                }
                void download(format);
              }}
            />
          ))}
        </div>
      </details>
      <p className="mt-tight text-sm text-ink-muted">{t("registrations.exportsHint")}</p>

      {downloadError ? (
        <p role="alert" className="mt-tight text-danger">
          {downloadError}
        </p>
      ) : null}

      {readError ? (
        <p role="alert" className="mt-related text-danger">
          {readError}
        </p>
      ) : null}

      {amending ? (
        <AmendForm
          booking={amending.booking}
          busy={amend.isPending}
          error={form.error}
          problemFor={form.messageFor}
          onSubmit={(data) => void saveAmendment(data)}
          onCancel={() => {
            form.clear();
            setAmending(null);
          }}
        />
      ) : null}

      {!list.isPending && !list.isError && bookings.length === 0 ? (
        <p className="mt-block text-ink-muted">
          {/* A form that is not open answers 404 at its address (ADR 0033),
              so the address is offered only once there is something there. */}
          {title?.registrationEnabled ? (
            <>
              {t("registrations.empty")} <code>/events/{eventId}/book</code>.
            </>
          ) : (
            t("registrations.emptyClosed")
          )}
        </p>
      ) : null}

      {bookings.length > 0 ? (
        <>
          {/* The grid lets one layout serve both widths: one column at
              390px, and from sm up as many as fit, so a desktop does not get
              an 80-row ribbon. */}
          <ul
            data-testid="guest-cards"
            className="mt-block grid gap-tight sm:grid-cols-2 xl:grid-cols-3"
          >
            {bookings.map((booking) => (
              <li key={booking.id} className={`${OUTLINED_CARD} p-3 text-sm`}>
                <p className="flex flex-wrap items-center gap-tight text-ink">
                  {booking.lastName} {booking.firstName}
                  {/* A member answered with their account (ADR 0034): no
                      contact details, and the committee knows how to reach
                      them. */}
                  {booking.isMember ? (
                    <span
                      data-testid="member-badge"
                      className="rounded-full border-2 border-ink bg-lilac px-2 text-xs font-semibold"
                    >
                      {t("registrations.memberBadge")}
                    </span>
                  ) : null}
                </p>
                {/* The address stays text, with no geo: link or maps URL: it is
                    free text that may read "c/o Famille X", so a pin built from
                    it would be wrong. The committee uses it to post an
                    invitation. */}
                {/* Three siblings, not a `<br>` run, so a screen reader gets
                    three stops. `items-start` stops the column flex stretching
                    each link's tap target across the card. */}
                <div data-testid="guest-contact" className="flex flex-col items-start gap-tight">
                  <ContactLink kind="email" value={booking.email ?? ""} />
                  <ContactLink kind="phone" value={booking.phone ?? ""} e164={booking.phoneE164} />
                  {booking.address ? (
                    <span className="text-ink-muted">{booking.address}</span>
                  ) : null}
                </div>
                {booking.tableName ? (
                  <p className="text-ink-muted">
                    {t("registrations.tableLabel", { value: booking.tableName })}
                  </p>
                ) : null}
                {orderOf(booking) === "" ? null : <p className="mt-tight">{orderOf(booking)}</p>}
                {answersOf(booking).length === 0 ? null : (
                  <ul data-testid="guest-answers" className="mt-tight">
                    {answersOf(booking).map((choice) => (
                      <li key={choice.optionId}>
                        {t("booking.answered", {
                          question: choice.label,
                          answer: answerText(choice),
                        })}
                      </li>
                    ))}
                  </ul>
                )}
                {/* Nobody to count on a form whose blocks count no people:
                    "0 personne" would read as nobody coming. */}
                {booking.guestCount === 0 && booking.totalCents === null ? null : (
                  <p className="text-ink-muted">
                    {booking.guestCount === 0
                      ? null
                      : t("common.guests", { count: booking.guestCount })}
                    {booking.totalCents === null ? null : (
                      <>
                        {booking.guestCount === 0 ? null : " — "}
                        {formatCents(booking.totalCents)}
                      </>
                    )}
                  </p>
                )}
                {/* Only a booking that owes something has a payment to record:
                    "Non payé" on an unpriced one would chase money nobody
                    named. */}
                {booking.totalCents === null ? null : (
                  <PaymentLine
                    booking={booking}
                    mayManage={mayManage}
                    onSave={(paid) => savePaid(booking, paid)}
                  />
                )}
                {mayManage ? (
                  <BookingActions
                    booking={booking}
                    busy={opening === booking.id}
                    onAmend={() => void openAmend(booking)}
                    onCancel={() => void openCancel(booking)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* The guest is not notified, which is why this asks for a typed name:
          they lose their place without hearing about it, and cannot re-book
          once the window has shut. */}
      <ConfirmByTypingName
        open={cancelling !== null}
        title={t("registrations.cancelTitle", {
          name: `${cancelling?.booking.firstName ?? ""} ${cancelling?.booking.lastName ?? ""}`,
        })}
        description={t("registrations.cancelDescription")}
        confirmLabel={t("registrations.cancelConfirm")}
        dismissLabel={t("registrations.keepBooking")}
        confirmPhrase={cancelling?.booking.lastName}
        busy={cancel.isPending}
        error={destructive.error}
        onConfirm={() => void confirmCancel()}
        onCancel={() => {
          destructive.clear();
          setCancelling(null);
        }}
      />
    </PageSection>
  );
}

/** What one booking ordered, as one line: its quantities only. */
function orderOf(booking: RegistrationResource): string {
  return booking.choices
    .filter((choice) => choice.kind === "quantity")
    .map((choice) => `${choice.quantity} × ${choice.label}`)
    .join(", ");
}

/** A booking's other answers, as the guest gave them. */
function answersOf(booking: RegistrationResource): RegistrationResourceChoicesItem[] {
  return booking.choices.filter((choice) => choice.kind !== "quantity");
}

/** An answer as words: the text, the chosen answer's label, or Oui / Non. */
function answerText(choice: RegistrationResourceChoicesItem): string {
  if (choice.kind === "yes_no") {
    return choice.value === "yes" ? t("booking.yes") : t("booking.no");
  }

  return (choice.kind === "choice" ? choice.answerLabel : choice.value) ?? "";
}

/**
 * How many picked each answer of each choice and yes/no, the counterpart of
 * the kitchen's totals. Free text has no tally. Ordered like those, by
 * option id, then by how many picked the answer.
 */
function answerTotalsOf(
  bookings: RegistrationResource[],
): { key: string; question: string; answer: string; count: number }[] {
  const tally = new Map<
    string,
    {
      key: string;
      question: string;
      answer: string;
      count: number;
      optionId: number;
      /** The "no answer" line, which sorts after the real answers. */
      last?: boolean;
    }
  >();
  for (const booking of bookings) {
    for (const choice of booking.choices) {
      if (choice.kind !== "choice" && choice.kind !== "yes_no") {
        continue;
      }
      const key = `${choice.optionId}:${choice.value}`;
      const entry = tally.get(key) ?? {
        key,
        optionId: choice.optionId,
        question: choice.label ?? "",
        answer: answerText(choice),
        count: 0,
      };
      entry.count += 1;
      tally.set(key, entry);
    }
  }
  // The bookings that left each question alone, after its answers. Only a
  // question somebody answered is known here: the list carries no blocks.
  const questions = new Map<number, string>();
  for (const entry of tally.values()) {
    questions.set(entry.optionId, entry.question);
  }
  for (const [optionId, question] of questions) {
    const answered = bookings.filter((booking) =>
      booking.choices.some((choice) => choice.optionId === optionId),
    ).length;
    if (answered < bookings.length) {
      tally.set(`${optionId}:none`, {
        key: `${optionId}:none`,
        optionId,
        question,
        answer: t("registrations.noAnswer"),
        // Below every real answer, whatever its count.
        count: bookings.length - answered,
        last: true,
      });
    }
  }

  return [...tally.values()].sort(
    (a, b) =>
      a.optionId - b.optionId ||
      Number(a.last ?? false) - Number(b.last ?? false) ||
      b.count - a.count,
  );
}

/**
 * Every option anybody booked, with how many were booked across the list.
 *
 * Ordered by option id, which is the order the options were created in,
 * because the list carries no `sortOrder`. An option nobody took is absent,
 * since no booking on the list names it; the downloads carry every option
 * with its zero.
 */
function optionTotalsOf(
  bookings: RegistrationResource[],
): { optionId: number; label: string; quantity: number }[] {
  const tally = new Map<number, { optionId: number; label: string; quantity: number }>();
  for (const booking of bookings) {
    for (const choice of booking.choices) {
      if (choice.kind !== "quantity") {
        continue;
      }
      const entry = tally.get(choice.optionId) ?? {
        optionId: choice.optionId,
        label: choice.label ?? "",
        quantity: 0,
      };
      entry.quantity += choice.quantity ?? 0;
      tally.set(choice.optionId, entry);
    }
  }
  return [...tally.values()].sort((a, b) => a.optionId - b.optionId);
}

function DownloadButton({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="raised-light" size="sm" aria-disabled={busy} onClick={onClick}>
      {busy ? "…" : label}
    </Button>
  );
}

/**
 * Paid or not. A manager flips a switch that saves as it moves; a viewer reads
 * the same state as a pill, because a switch they cannot move would look
 * broken rather than read-only.
 *
 * The pill writes the state out as well as colouring it, for a greyscale
 * printout and a screen reader. The switch's accessible name carries the
 * guest's name, since there is one per card, and starts with the visible
 * "Payé" so voice control reaches it by the word on screen.
 *
 * aria-disabled and an early return while the write is in flight, never
 * `disabled`: Radix renders the switch as a button, and ui/button.tsx says
 * what `disabled` does to its focus.
 */
function PaymentLine({
  booking,
  mayManage,
  onSave,
}: {
  booking: RegistrationResource;
  mayManage: boolean;
  onSave: (paid: boolean) => Promise<void>;
}) {
  const paid = booking.paidAt !== null;
  const who = `${booking.firstName} ${booking.lastName}`;
  const saving = useApiFormError(t("registrations.payFailed"));
  // The switch shows the new value while its write is in flight, and falls
  // back to the stored one once the list has it or the server refused.
  const [flipped, setFlipped] = useState<boolean | null>(null);
  const busy = flipped !== null;

  if (!mayManage) {
    return (
      <div data-testid="payment" className="mt-tight">
        <span
          className={
            paid
              ? "rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground"
              : "rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted"
          }
        >
          {paid ? t("registrations.paid") : t("registrations.unpaid")}
        </span>
      </div>
    );
  }

  const flip = async (next: boolean) => {
    setFlipped(next);
    saving.clear();
    try {
      await onSave(next);
    } catch (thrown) {
      saving.setFromThrown(thrown);
    } finally {
      setFlipped(null);
    }
  };

  const id = `booking-${booking.id}-paid`;

  return (
    <div data-testid="payment" className="mt-tight">
      <div className="flex min-h-touch items-center gap-2">
        <Switch
          id={id}
          checked={flipped ?? paid}
          aria-disabled={busy}
          aria-label={t("registrations.paidAria", { name: who })}
          onCheckedChange={(next) => {
            if (busy) {
              return;
            }
            void flip(next);
          }}
        />
        <label htmlFor={id}>{t("registrations.paid")}</label>
      </div>
      {saving.error !== null ? (
        <p role="alert" className="text-danger">
          {saving.error.message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Two actions, so both render inline: `RowActions` draws a menu only for two
 * or more items left over once one is pulled inline. Using the shared
 * component means a third action gets the menu for free.
 *
 * `destructive: true` on the cancel action is dormant, not dead: only the
 * menu path reads it (the separator rule in `ItemFor`), so it matters once a
 * third action puts the cancel item behind the "...".
 */
function BookingActions({
  booking,
  busy,
  onAmend,
  onCancel,
}: {
  booking: RegistrationResource;
  busy: boolean;
  onAmend: () => void;
  onCancel: () => void;
}) {
  const who = `${booking.firstName} ${booking.lastName}`;

  const actions: RowAction[] = [
    // Not on a member's booking: its name comes from the account and is
    // copied again on the member's next change, and it has no contact
    // details to correct (ADR 0034).
    ...(booking.isMember
      ? []
      : [
          {
            key: "amend",
            label: t("registrations.amend"),
            ariaLabel: t("registrations.amendTitle", { name: who }),
            disabled: busy,
            onSelect: onAmend,
          },
        ]),
    {
      key: "cancel",
      // registrations.cancel, not common.cancel: this one cancels a booking
      // ("stornieren"), the other closes a form ("abbrechen"). One French
      // word, two German ones.
      label: t("registrations.cancel"),
      ariaLabel: t("registrations.cancelAria", { name: who }),
      disabled: busy,
      destructive: true,
      onSelect: onCancel,
    },
  ];

  // The margin sits on this wrapper because RowActions renders its own.
  return (
    <div data-testid="booking-actions" className="mt-tight">
      <RowActions actions={actions} inlineKey="amend" rowName={who} />
    </div>
  );
}

/**
 * Correcting a booking's contact details.
 *
 * What was ordered is not here, matching the API, whose PATCH has no
 * `choices`: changing an order would need the per-booking cap re-checked and
 * arguably the confirmation re-sent. A wrong order is cancelled and re-booked.
 * The panel says so, so nobody hunts for the field.
 */
function AmendForm({
  booking,
  busy,
  error,
  problemFor,
  onSubmit,
  onCancel,
}: {
  booking: RegistrationResource;
  busy: boolean;
  error: ReturnType<typeof useApiFormError>["error"];
  problemFor: (field: string) => string | undefined;
  onSubmit: (data: UpdateRegistrationRequest) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    lastName: booking.lastName,
    firstName: booking.firstName,
    email: booking.email ?? "",
    phone: booking.phone ?? "",
    address: booking.address ?? "",
    tableName: booking.tableName ?? "",
  });

  return (
    <form
      noValidate
      className={`${OUTLINED_CARD} mt-block flex flex-col gap-related p-4`}
      onSubmit={(submitted) => {
        submitted.preventDefault();
        if (busy || !formIsValid(submitted.currentTarget)) {
          return;
        }
        onSubmit({
          lastName: draft.lastName,
          firstName: draft.firstName,
          email: draft.email,
          phone: draft.phone,
          // An explicit null clears an optional field; an empty string would
          // store one. The API reads the two differently on purpose.
          address: draft.address.trim() === "" ? null : draft.address,
          tableName: draft.tableName.trim() === "" ? null : draft.tableName,
        });
      }}
    >
      <h2 className="font-display text-2xl">
        {t("registrations.amendTitle", { name: `${booking.firstName} ${booking.lastName}` })}
      </h2>

      <RequiredLegend />

      {AMENDABLE.map((field) => (
        <FormField
          key={field.name}
          id={`amend-${field.name}`}
          label={t(field.labelKey)}
          type={field.type}
          required={field.required}
          value={draft[field.name as keyof typeof draft]}
          onChange={(value) => setDraft((current) => ({ ...current, [field.name]: value }))}
          problem={problemFor(field.name)}
        />
      ))}

      <p className="text-sm text-ink-muted">{t("registrations.orderNotHere")}</p>

      <FormError error={error} />

      <div className="flex flex-wrap gap-related">
        <Button type="submit" aria-disabled={busy}>
          {busy ? t("registrations.saving") : t("common.save")}
        </Button>
        <Button type="button" variant="raised-light" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
