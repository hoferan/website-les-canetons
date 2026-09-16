import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
import { formatEventWhen } from "../events/formatEventWhen";
import { translateApiError } from "../i18n";
import { formatCents } from "../money";
import { useSession } from "../session/SessionProvider";

/** The four downloads, in the order the committee reaches for them. */
const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "xlsx", label: "Excel" },
  { format: "csv", label: "CSV" },
  { format: "md", label: "Markdown" },
  { format: "json", label: "JSON" },
];

const AMENDABLE: { name: keyof UpdateRegistrationRequest; label: string; type?: string }[] = [
  { name: "lastName", label: "Nom" },
  { name: "firstName", label: "Prénom" },
  { name: "email", label: "E-mail", type: "email" },
  { name: "phone", label: "Téléphone", type: "tel" },
  { name: "address", label: "Adresse" },
  { name: "tableName", label: "Table" },
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
 * CARDS BELOW `md`, A TABLE FROM `md` UP (§4: no bare tables on phones). Both
 * layouts are in the DOM at once and Tailwind picks by viewport, so a test
 * that queries globally finds each guest twice — scope to `guest-cards` or
 * `guest-table`.
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

  const form = useApiFormError("La correction n’a pas pu être enregistrée.");
  const destructive = useApiFormError("L’annulation a échoué.");

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

  const bookings = rowsOf<RegistrationResource>(list.data);
  const bookingCount = totalOf(list.data);
  const mayManage = can("registrations.manage");

  const guests = bookings.reduce((sum, booking) => sum + booking.guestCount, 0);
  const priced = bookings.filter((booking) => booking.totalCents !== null);
  const total = priced.reduce((sum, booking) => sum + (booking.totalCents ?? 0), 0);

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
        setReadError("Cette inscription n’a pas pu être chargée.");
        return null;
      }
      return { booking: response.data, etag: entityTagOf(response) };
    } catch {
      setReadError("Cette inscription n’a pas pu être chargée. Rechargez la page.");
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
      setReadError("Cette inscription n’a pas pu être chargée. Rechargez la page.");
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

  async function download(format: ExportFormat) {
    setDownloading(format);
    setDownloadError(null);
    try {
      await downloadGuestList(eventId, format, `inscriptions.${format}`);
    } catch (thrown) {
      setDownloadError(
        thrown instanceof ApiError
          ? translateApiError(thrown).message
          : "Le fichier n’a pas pu être téléchargé.",
      );
    } finally {
      setDownloading(null);
    }
  }

  return (
    <PageSection>
      <Link to="/events" className="text-sm text-ink-muted underline">
        ← Retour au planning
      </Link>

      <h1 className="mt-tight font-display text-3xl">Inscriptions</h1>

      {title ? (
        <p data-testid="guest-event" className="mt-tight text-ink-muted">
          {title.title} — {formatEventWhen(title.startsAt, title.endsAt)}
        </p>
      ) : null}

      {list.isPending ? <p className="mt-block text-ink-muted">Chargement…</p> : null}

      {list.isError ? (
        <p role="alert" className="mt-block text-red-700">
          La liste n’a pas pu être chargée.
        </p>
      ) : null}

      {!list.isPending && !list.isError ? (
        <p data-testid="guest-counts" className="mt-block text-lg">
          {bookingCount ?? bookings.length} inscription
          {(bookingCount ?? bookings.length) > 1 ? "s" : ""} · {guests} personne
          {guests > 1 ? "s" : ""}
          {/* Nothing when no booking carries a price: a total of CHF 0.00 over
              a list of unpriced options is a claim the data does not make. */}
          {priced.length === 0 ? null : <> · {formatCents(total)}</>}
        </p>
      ) : null}

      <div className="mt-related flex flex-wrap gap-tight">
        {FORMATS.map(({ format, label }) => (
          <Button
            key={format}
            type="button"
            variant="outline"
            size="sm"
            aria-disabled={downloading === format}
            onClick={() => {
              if (downloading !== null) {
                return;
              }
              void download(format);
            }}
          >
            {downloading === format ? "…" : label}
          </Button>
        ))}
      </div>
      <p className="mt-tight text-sm text-ink-muted">
        Les quatre fichiers contiennent exactement les mêmes lignes. Excel est celui que le comité
        ouvre&nbsp;; CSV fonctionne partout.
      </p>

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
          Personne ne s’est encore inscrit. Le formulaire public est à l’adresse{" "}
          <code>/events/{eventId}/book</code>.
        </p>
      ) : null}

      {bookings.length > 0 ? (
        <>
          {/* Cards below md. A booking is eight facts read one at a time, and
              a table of them at 390px scrolls sideways — which is exactly what
              the screen this replaces did. */}
          <ul data-testid="guest-cards" className="mt-block grid gap-tight md:hidden">
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
                <div className="flex flex-col items-start gap-tight">
                  <ContactLink kind="email" value={booking.email} />
                  <ContactLink kind="phone" value={booking.phone} />
                  {booking.address ? (
                    <span className="text-ink-muted">{booking.address}</span>
                  ) : null}
                </div>
                {booking.tableName ? (
                  <p className="text-ink-muted">Table&nbsp;: {booking.tableName}</p>
                ) : null}
                <p className="mt-tight">{orderOf(booking)}</p>
                <p className="text-ink-muted">
                  {booking.guestCount} personne{booking.guestCount > 1 ? "s" : ""}
                  {booking.totalCents === null ? null : <> — {formatCents(booking.totalCents)}</>}
                </p>
                {mayManage ? (
                  <RowActions
                    booking={booking}
                    busy={opening === booking.id}
                    onAmend={() => void openAmend(booking)}
                    onCancel={() => void openCancel(booking)}
                  />
                ) : null}
              </li>
            ))}
          </ul>

          <div className="mt-block hidden overflow-x-auto md:block">
            <Table data-testid="guest-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Commande</TableHead>
                  <TableHead>Personnes</TableHead>
                  <TableHead>Total</TableHead>
                  {mayManage ? <TableHead>Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((booking) => (
                  // align-top: with a ~116px contact cell, the base align-middle
                  // floats Table and Commande in the vertical middle and a
                  // reader scanning a column down 70 rows loses the line.
                  <TableRow key={booking.id} className="[&>td]:align-top">
                    <TableCell>
                      {booking.lastName} {booking.firstName}
                    </TableCell>
                    {/* THREE SIBLINGS, NOT A `<br>` RUN. The address needs an
                        element of its own to carry `whitespace-normal` and a
                        width cap -- TableCell is `whitespace-nowrap`, and a
                        `max:255` address in a column of its own would not wrap
                        but force the whole table wide, into a scroll container
                        that is not keyboard-reachable yet (#15). `items-start`
                        stops the column flex stretching each link's target
                        across the whole cell. */}
                    <TableCell className="text-ink-muted" data-testid="guest-contact">
                      <div className="flex flex-col items-start gap-tight">
                        <ContactLink kind="email" value={booking.email} />
                        <ContactLink kind="phone" value={booking.phone} />
                        {booking.address ? (
                          <span className="block max-w-xs whitespace-normal">
                            {booking.address}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-ink-muted">{booking.tableName}</TableCell>
                    <TableCell>{orderOf(booking)}</TableCell>
                    <TableCell>{booking.guestCount}</TableCell>
                    <TableCell>
                      {booking.totalCents === null ? null : formatCents(booking.totalCents)}
                    </TableCell>
                    {mayManage ? (
                      <TableCell>
                        <RowActions
                          booking={booking}
                          busy={opening === booking.id}
                          onAmend={() => void openAmend(booking)}
                          onCancel={() => void openCancel(booking)}
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}

      {/* THE GUEST IS NOT NOTIFIED, which is what makes this worth typing a
          name for. Somebody outside the band loses their place and hears
          nothing about it, and cannot re-book once the window has shut. */}
      <ConfirmByTypingName
        open={cancelling !== null}
        title={`Annuler l’inscription de ${cancelling?.booking.firstName ?? ""} ${
          cancelling?.booking.lastName ?? ""
        } ?`}
        description="L’inscription et tout ce qu’elle a commandé seront supprimés. La personne n’est pas prévenue. Cette action est définitive."
        confirmLabel="Annuler l’inscription"
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

function RowActions({
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

  return (
    <span className="mt-tight flex flex-wrap gap-tight">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Corriger l’inscription de ${who}`}
        aria-disabled={busy}
        onClick={() => {
          if (busy) return;
          onAmend();
        }}
      >
        Corriger
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Annuler l’inscription de ${who}`}
        aria-disabled={busy}
        onClick={() => {
          if (busy) return;
          onCancel();
        }}
      >
        Annuler
      </Button>
    </span>
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
        Corriger l’inscription de {booking.firstName} {booking.lastName}
      </h2>

      {AMENDABLE.map((field) => (
        <FormField
          key={field.name}
          id={`amend-${field.name}`}
          label={field.label}
          type={field.type}
          value={draft[field.name as keyof typeof draft]}
          onChange={(value) => setDraft((current) => ({ ...current, [field.name]: value }))}
          problem={problemFor(field.name)}
        />
      ))}

      <p className="text-sm text-ink-muted">
        La commande ne se modifie pas ici. Pour la changer, annulez l’inscription et refaites-la.
      </p>

      <FormError error={error} />

      <div className="flex flex-wrap gap-related">
        <Button type="submit" aria-disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
