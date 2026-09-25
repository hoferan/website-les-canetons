import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";

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
import type { RegistrationResource, UpdateRegistrationRequest } from "../api/generated/model";
import { ApiError } from "../api/http";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { ConfirmByTypingName } from "../components/ConfirmByTypingName";
import { ContactLink } from "../components/ContactLink";
import { FormError, FormField } from "../components/FormField";
import { PageSection } from "../components/PageSection";
import { RowActions, type RowAction } from "../components/RowActions";
import { formatEventWhen } from "../events/formatEventWhen";
import { translateApiError } from "../i18n";
import { t, type TranslationKey } from "../i18n";
import { formatCents } from "../money";
import { useSession } from "../session/SessionProvider";

/**
 * The four downloads, in the order the committee reaches for them. Markdown
 * and JSON are developer formats on a committee screen, so they sit behind
 * `registrations.moreFormats` (#115).
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
 * `labelKey`, NEVER `label` — a module-level `label: t(...)` freezes in
 * whatever locale was active at import.
 *
 * THE KEYS ARE booking.fields.*, NOT A SECOND SET. This form amends the very
 * booking the public form created: same record, same fields, same words. That
 * is the one case where sharing a label across screens is right, and it is
 * not the case #166 ruled on — there the question was a control's label
 * against an API field's NOUN, which are different things.
 */
const AMENDABLE: {
  name: keyof UpdateRegistrationRequest;
  labelKey: TranslationKey;
  type?: string;
}[] = [
  { name: "lastName", labelKey: "booking.fields.lastName" },
  { name: "firstName", labelKey: "booking.fields.firstName" },
  { name: "email", labelKey: "booking.fields.email", type: "email" },
  { name: "phone", labelKey: "booking.fields.phone", type: "tel" },
  { name: "address", labelKey: "booking.fields.address" },
  { name: "tableName", labelKey: "booking.fields.tableName" },
];

/**
 * Who has booked a place, and what they ordered.
 *
 * TWO PERMISSIONS ON ONE SCREEN, and the split is the point.
 * `registrations.view` is what the route is guarded on and is all the
 * `committee` role holds — somebody whose entire job is reading this list.
 * Correcting a name and cancelling a booking are `registrations.manage`, a
 * different act on somebody else's personal data, so those controls are absent
 * for a viewer rather than present and refused. The server enforces both; this
 * mirrors it for the screen.
 *
 * THE COUNTS ARE THE SERVER'S. `guestCount` and `totalCents` come per booking
 * from the API precisely so the screen, the four downloads and the
 * confirmation mail cannot disagree about what a booking comes to. The totals
 * row here sums those, and nothing on this page multiplies a price by a
 * quantity.
 *
 * ONE LAYOUT: CARDS, AT EVERY WIDTH, laid out in a grid that widens (#130).
 * There was a table from `md` up as well until 2026-09-18, hand-maintained
 * beside the cards with nothing forcing the two to agree — and they did not,
 * for the whole life of the screen: the guest's postal address was on the card
 * and in no column at all (#98). A test that queries globally used to find
 * every guest twice; it no longer does, so scoping to `guest-cards` is now
 * about saying which list you mean rather than about avoiding a duplicate.
 *
 * AMENDING STARTS BY READING THE ONE BOOKING, and the tag that read hands out
 * is what the PATCH quotes. The list hands out none — one tag cannot validate
 * a hundred bookings — and that read is also the right concurrency window:
 * "while this form was open". Fetching a fresh tag at save time would satisfy
 * the server and protect nobody.
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
  // NOT A TOAST. A refused download is read beside the button that was
  // pressed, and it is the one refusal on that endpoint an operator can act
  // on — `xlsx_unavailable` means asking the host for ext-zip, or using CSV.
  // A toast would also be invisible to a component test, since the Toaster
  // lives in the layout.
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Both writes are conditional, so both are built by hand over the generated
  // FUNCTIONS: orval's mutation hooks fix their request options when the hook
  // is created, and the tag differs per call. See web/src/api/ifMatch.ts.
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

  const [paying, setPaying] = useState<number | null>(null);

  const bookings = rowsOf<RegistrationResource>(list.data);
  const bookingCount = totalOf(list.data);
  const mayManage = can("registrations.manage");

  const guests = bookings.reduce((sum, booking) => sum + booking.guestCount, 0);
  const priced = bookings.filter((booking) => booking.totalCents !== null);
  const total = priced.reduce((sum, booking) => sum + (booking.totalCents ?? 0), 0);
  const paidCount = priced.filter((booking) => booking.paidAt !== null).length;
  const perOption = optionTotalsOf(bookings);

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
        // Unreachable: the mutator throws on every non-2xx. The declared union
        // says otherwise and tsc is right that it does.
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
      // screen. Saying so and stopping is the honest answer.
      setReadError(t("registrations.loadFailedReload"));
      return;
    }

    form.clear();
    try {
      await amend.mutateAsync({ booking: amending.booking.id, data, etag: amending.etag });
    } catch (thrown) {
      // The panel stays OPEN: a rejected e-mail has to be corrected where it
      // was typed.
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
      // Dialog stays open, so a 412 is read where the action was taken rather
      // than behind a dialog that has vanished.
      destructive.setFromThrown(thrown);
      return;
    }

    setCancelling(null);
    await refresh();
  }

  /**
   * Records the payment, or takes it back. No dialog: the same button undoes
   * it, and at the door there is a queue.
   *
   * Read-then-write like the amend form, because the PATCH is conditional.
   * The concurrency window is only as wide as the button press, which is
   * enough for a toggle. It SENDS WHAT THE BUTTON SAID. Flipping the fresh
   * read instead would mean that if somebody else recorded the payment a
   * second ago, "Marquer payé" would take it back. The server keeps the first
   * stamp.
   */
  async function togglePaid(row: RegistrationResource) {
    if (paying !== null) {
      return;
    }
    setPaying(row.id);
    try {
      const loaded = await read(row);
      if (!loaded) {
        return;
      }
      if (loaded.etag === null) {
        setReadError(t("registrations.loadFailedReload"));
        return;
      }
      await registrationUpdate(row.id, { paid: row.paidAt === null }, ifMatch(loaded.etag));
      await refresh();
    } catch (thrown) {
      setReadError(
        thrown instanceof ApiError
          ? translateApiError(thrown).message
          : t("registrations.payFailed"),
      );
    } finally {
      setPaying(null);
    }
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

      {/* THE SAME KEY AS THE LINK THAT OPENS THIS, on the planning. */}
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
          {/* TWO COUNTS, EACH PLURALISED BY ITS OWN LOCALE. Both were
              `> 1 ? "s" : ""` — the French rule, right in French and wrong
              in German, where zero is plural. */}
          {t("registrations.bookings", { count: bookingCount ?? bookings.length })}
          {t("registrations.countsSeparator")}
          {t("common.guests", { count: guests })}
          {/* Nothing when no booking carries a price: a total of CHF 0.00 over
              a list of unpriced options is a claim the data does not make. */}
          {priced.length === 0 ? null : <> · {formatCents(total)}</>}
          {priced.length === 0 ? null : (
            <>
              {t("registrations.countsSeparator")}
              {t("registrations.paidCount", { paid: paidCount, count: priced.length })}
            </>
          )}
        </p>
      ) : null}

      {/* WHAT THE KITCHEN IS TOLD (#115), and it is a sum of quantities the
          server already sent per booking: nothing here multiplies a price.
          The same numbers are the totals row of every download. */}
      {perOption.length > 0 ? (
        <div
          data-testid="option-totals"
          className="mt-tight flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-related"
        >
          <span className="text-ink-muted">{t("registrations.optionTotalsLabel")}</span>
          {/* One per line on a phone, where a wrapped row put two options on
              the first line and one on the second and read as two groups. */}
          <ul className="flex flex-col sm:flex-row sm:flex-wrap sm:gap-x-related">
            {perOption.map((option) => (
              <li key={option.optionId} className="font-semibold">
                {t("registrations.optionTotal", { count: option.quantity, label: option.label })}
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
      {/* A disclosure rather than a menu: it opens in place, at 390px as on a
          desktop, and needs no floating layer for two buttons. It sits in its
          own block below the row: inside the row, an open one wrapped its
          buttons in beside Excel at a different height. */}
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
          {t("registrations.empty")} <code>/events/{eventId}/book</code>.
        </p>
      ) : null}

      {bookings.length > 0 ? (
        <>
          {/* THE CARD IS THE ONLY LAYOUT (#130). There used to be a table from
              md up as well, hand-maintained beside this, and nothing forced the
              two to agree: the address below lived on the card and in no column
              at all, for the whole life of the screen. The grid is what makes
              one layout serve both — one column at 390px, and from sm up as
              many as fit, so a desktop reader gets a wall of bookings rather
              than an 80-row ribbon. */}
          <ul
            data-testid="guest-cards"
            className="mt-block grid gap-tight sm:grid-cols-2 xl:grid-cols-3"
          >
            {bookings.map((booking) => (
              <li
                key={booking.id}
                className="rounded-lg border border-gray-200 bg-white p-3 text-sm"
              >
                <p className="text-ink">
                  {booking.lastName} {booking.firstName}
                </p>
                {/* The address stays TEXT. No geo: link and no maps URL: this
                    is a `max:255` free-text field that may read "c/o Famille
                    X", so a pin built from it is confidently wrong -- the
                    failure the 2026-08-31 audit caught in Join.tsx, by another
                    route. The committee's use here is posting an invitation,
                    not navigating. */}
                {/* THREE SIBLINGS, NOT A `<br>` RUN, so each fact is its own
                    element and a screen reader gets three stops rather than one
                    long string. `items-start` stops the column flex stretching
                    each link's tap target across the whole card. */}
                <div data-testid="guest-contact" className="flex flex-col items-start gap-tight">
                  <ContactLink kind="email" value={booking.email} />
                  <ContactLink kind="phone" value={booking.phone} />
                  {booking.address ? (
                    <span className="text-ink-muted">{booking.address}</span>
                  ) : null}
                </div>
                {booking.tableName ? (
                  <p className="text-ink-muted">
                    {t("registrations.tableLabel", { value: booking.tableName })}
                  </p>
                ) : null}
                <p className="mt-tight">{orderOf(booking)}</p>
                <p className="text-ink-muted">
                  {t("common.guests", { count: booking.guestCount })}
                  {booking.totalCents === null ? null : <> — {formatCents(booking.totalCents)}</>}
                </p>
                {/* Only a booking that owes something has a payment to record.
                    An unpriced one owes an unknown amount, and "Non payé" on it
                    would chase money nobody named. */}
                {booking.totalCents === null ? null : (
                  <PaymentLine
                    booking={booking}
                    mayManage={mayManage}
                    busy={paying === booking.id}
                    onToggle={() => void togglePaid(booking)}
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

      {/* THE GUEST IS NOT NOTIFIED, which is what makes this worth typing a
          name for. Somebody outside the band loses their place and hears
          nothing about it, and cannot re-book once the window has shut. */}
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

/** What one booking ordered, as one line. */
function orderOf(booking: RegistrationResource): string {
  return booking.choices.map((choice) => `${choice.quantity} × ${choice.label}`).join(", ");
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
      const entry = tally.get(choice.optionId) ?? {
        optionId: choice.optionId,
        label: choice.label ?? "",
        quantity: 0,
      };
      entry.quantity += choice.quantity;
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
    <Button type="button" variant="outline" size="sm" aria-disabled={busy} onClick={onClick}>
      {busy ? "…" : label}
    </Button>
  );
}

/**
 * Paid or not, and for a manager the button that flips it.
 *
 * THE STATE IS WRITTEN OUT as well as coloured, so it survives a greyscale
 * printout and a screen reader. The button carries the guest's name in its accessible
 * name, because there is one per card.
 */
function PaymentLine({
  booking,
  mayManage,
  busy,
  onToggle,
}: {
  booking: RegistrationResource;
  mayManage: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const paid = booking.paidAt !== null;
  const who = `${booking.firstName} ${booking.lastName}`;

  return (
    <div data-testid="payment" className="mt-tight flex flex-wrap items-center gap-tight">
      <span
        className={
          paid
            ? "rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground"
            : "rounded-full border border-line px-2 py-0.5 text-xs text-ink-muted"
        }
      >
        {paid ? t("registrations.paid") : t("registrations.unpaid")}
      </span>
      {mayManage ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-disabled={busy}
          aria-label={
            paid
              ? t("registrations.markUnpaidAria", { name: who })
              : t("registrations.markPaidAria", { name: who })
          }
          onClick={() => {
            if (busy) {
              return;
            }
            onToggle();
          }}
        >
          {paid ? t("registrations.markUnpaid") : t("registrations.markPaid")}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * This screen has exactly two actions, so `RowActions`' own rule — a menu
 * needs at least two items left over once one is pulled inline — never has
 * two to work with: both render inline and no "..." trigger is drawn. The
 * visible result is unchanged from before this screen used the shared
 * component; the point is that it no longer carries its own copy of the
 * pattern, so a third action gets the menu for free instead of growing a
 * third ragged row.
 *
 * `destructive: true` ON THE CANCEL ACTION IS DORMANT, NOT DEAD: only the
 * menu path reads it (the separator rule in `ItemFor`), and this screen never
 * draws a menu — so it does nothing today. It starts mattering the day a
 * third action arrives here and the cancel item lands behind the "...".
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
    {
      key: "amend",
      label: t("registrations.amend"),
      ariaLabel: t("registrations.amendTitle", { name: who }),
      disabled: busy,
      onSelect: onAmend,
    },
    {
      key: "cancel",
      // registrations.cancel, NOT common.cancel: this one cancels a BOOKING
      // ("stornieren"), the other closes a form without doing anything
      // ("abbrechen"). One French word, two German ones.
      label: t("registrations.cancel"),
      ariaLabel: t("registrations.cancelAria", { name: who }),
      disabled: busy,
      destructive: true,
      onSelect: onCancel,
    },
  ];

  // `mt-tight` moved here: RowActions renders its own flex/gap wrapper, so
  // the top margin that used to live on that same element now lives on the
  // element that contains it instead of being dropped.
  return (
    <div data-testid="booking-actions" className="mt-tight">
      <RowActions actions={actions} inlineKey="amend" rowName={who} />
    </div>
  );
}

/**
 * Correcting a booking's contact details.
 *
 * WHAT WAS ORDERED IS NOT HERE, matching the API, which has no `choices` field
 * on its PATCH. Changing an order would need the per-booking cap re-checked
 * and arguably the confirmation re-sent; a wrong order is cancelled and
 * re-booked, which is two clicks for the committee and leaves an honest audit
 * trail. The panel says so, because a form that silently omits the thing
 * somebody came to change is a form they will look for twice.
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
    email: booking.email,
    phone: booking.phone,
    address: booking.address ?? "",
    tableName: booking.tableName ?? "",
  });

  return (
    <form
      className="mt-block flex flex-col gap-related rounded-md border border-line bg-panel p-4"
      onSubmit={(submitted) => {
        submitted.preventDefault();
        if (busy) {
          return;
        }
        onSubmit({
          lastName: draft.lastName,
          firstName: draft.firstName,
          email: draft.email,
          phone: draft.phone,
          // An explicit null CLEARS an optional field; an empty string would
          // store one. The API reads the two differently on purpose, and this
          // is the form that can send either.
          address: draft.address.trim() === "" ? null : draft.address,
          tableName: draft.tableName.trim() === "" ? null : draft.tableName,
        });
      }}
    >
      <h2 className="font-display text-2xl">
        {t("registrations.amendTitle", { name: `${booking.firstName} ${booking.lastName}` })}
      </h2>

      {AMENDABLE.map((field) => (
        <FormField
          key={field.name}
          id={`amend-${field.name}`}
          label={t(field.labelKey)}
          type={field.type}
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
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
