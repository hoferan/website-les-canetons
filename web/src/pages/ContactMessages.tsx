import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  contactMessageDestroy,
  contactMessageHandle,
  contactMessageShow,
  getContactMessageIndexQueryKey,
  useContactMessageIndex,
} from "../api/generated/endpoints";
import type { ContactMessageResource } from "../api/generated/model";
import { rowsOf, totalOf } from "../api/collection";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { PageSection } from "../components/PageSection";
import { fr } from "../i18n/fr";
import { useSession } from "../session/SessionProvider";

type Filter = "all" | "open" | "handled";

const RECEIVED = new Intl.DateTimeFormat("fr-CH", {
  timeZone: "Europe/Zurich",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "le 15 septembre 2026, 12:05". */
function formatReceived(iso: string): string {
  return RECEIVED.format(new Date(iso));
}

/** The subject, or the opening of the body — mirroring what the inbox shows. */
function preview(message: ContactMessageResource): string {
  if (message.subject) {
    return message.subject;
  }
  return message.message.length > 120 ? `${message.message.slice(0, 120)}…` : message.message;
}

function matchesFilter(filter: Filter, message: ContactMessageResource): boolean {
  if (filter === "open") {
    return message.handledAt === null;
  }
  if (filter === "handled") {
    return message.handledAt !== null;
  }
  return true;
}

/**
 * The archive: every message the public has sent, open and handled alike.
 *
 * MODELLED ON web/src/pages/Members.tsx — same read-then-write ETag flow, same
 * cards-below-`md`/table-from-`md`-up split, same shape of "opening a row
 * reads the one thing and keeps the tag that read handed out".
 *
 * EXPANDING A ROW ALWAYS RE-READS IT, even though the list already carries
 * every field (`ContactMessageIndex200DataItem` is the same resource as the
 * single-thing read). The list hands out no `ETag` — one tag cannot validate
 * every row — so a screen acting on a row straight from the list would be
 * refused 428. The tag the handle and delete mutations quote is always the one
 * this read handed out, never a fresher one fetched just before the write:
 * that is the whole point of a conditional write (see web/src/api/ifMatch.ts).
 *
 * `messages.view` is what the route is guarded on, and is all the `committee`
 * role holds — somebody whose entire job is reading this list. Handling and
 * deleting are `messages.manage`, so those controls are absent for a viewer
 * rather than present and refused.
 *
 * `?open=<id>` expands that message on arrival: the inbox's rows link here
 * with it, so a message reached from there opens ready to read rather than
 * making its reader find it again in the list.
 */
export function ContactMessages() {
  const { can } = useSession();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const list = useContactMessageIndex();

  const action = useApiFormError("L’action n’a pas pu être effectuée.");

  // Conditional writes, built by hand over the generated FUNCTIONS: orval's
  // mutation hooks fix their request options once, when the hook is created,
  // and the tag differs per call. See web/src/api/ifMatch.ts.
  const handle = useMutation({
    mutationFn: ({ id, handled, etag }: { id: number; handled: boolean; etag: string }) =>
      contactMessageHandle(id, { handled }, ifMatch(etag)),
  });
  const destroy = useMutation({
    mutationFn: ({ id, etag }: { id: number; etag: string }) =>
      contactMessageDestroy(id, ifMatch(etag)),
  });

  const [filter, setFilter] = useState<Filter>("all");
  // The message currently expanded, and the ETag its read handed out — the
  // tag the handle and delete mutations below quote back. Both writes hand
  // back a fresh tag on success, so a handle followed by a delete needs no
  // second read.
  const [opened, setOpened] = useState<{
    message: ContactMessageResource;
    etag: string | null;
  } | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{
    message: ContactMessageResource;
    etag: string | null;
  } | null>(null);

  const messages = rowsOf<ContactMessageResource>(list.data);
  const total = totalOf(list.data);
  const visible = messages.filter((message) => matchesFilter(filter, message));
  const mayManage = can("messages.manage");

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getContactMessageIndexQueryKey() });

  /** Reads the one message, and keeps the tag that read handed out. */
  async function openMessage(id: number) {
    setReadError(null);
    // Switching straight from one message's panel to another's must not carry
    // a stale handle/delete refusal along with it.
    action.clear();
    setOpeningId(id);
    try {
      const response = await contactMessageShow(id);
      if (response.status !== 200) {
        // Unreachable: the mutator throws on every non-2xx. The declared
        // union says otherwise and tsc is right that it does.
        setReadError(fr.contactMessages.readError);
        return;
      }
      setOpened({ message: response.data, etag: entityTagOf(response) });
    } catch {
      setReadError(fr.contactMessages.readError);
    } finally {
      setOpeningId(null);
    }
  }

  // THE DEEP LINK. The inbox sends `?open=<id>`, so a message reached from
  // there opens ready to read. Depends on the PARAM'S VALUE, not the
  // `searchParams` object — react-router hands out a fresh object on every
  // render regardless of whether the query string changed, and depending on
  // it would re-run this on every keystroke of the filter buttons above.
  const openParam = searchParams.get("open");
  useEffect(() => {
    if (openParam === null) {
      return;
    }
    const id = Number(openParam);
    if (!Number.isFinite(id)) {
      return;
    }
    void openMessage(id);
    // openMessage is intentionally omitted: it is redefined every render, and
    // listing it would re-run this on every render while `?open=` is present
    // — including every filter click — issuing a fresh GET each time. It
    // closes over nothing that varies in a way that matters (state setters,
    // and the stable module-level API functions), so the version captured
    // when this effect last ran behaves identically to the newest one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam]);

  function closePanel() {
    setOpened(null);
    setReadError(null);
    action.clear();
  }

  async function toggleHandled(next: boolean) {
    if (!opened) {
      return;
    }
    if (opened.etag === null) {
      // No tag means the write would be refused 428, which reads as a broken
      // screen. Saying so and stopping is the honest answer.
      setReadError(fr.contactMessages.readError);
      return;
    }
    action.clear();
    try {
      const saved = await handle.mutateAsync({
        id: opened.message.id,
        handled: next,
        etag: opened.etag,
      });
      if (saved.status !== 200) {
        // Unreachable: the mutator throws on every non-2xx. The declared
        // union says otherwise and tsc is right that it does.
        setReadError(fr.contactMessages.readError);
        return;
      }
      setOpened({ message: saved.data, etag: entityTagOf(saved) });
    } catch (thrown) {
      // Panel stays open, so the refusal is read where the action was taken.
      action.setFromThrown(thrown);
      return;
    }
    await refresh();
  }

  function openDeleteDialog() {
    if (!opened) {
      return;
    }
    action.clear();
    setDeleting(opened);
  }

  async function confirmDelete() {
    if (!deleting || deleting.etag === null) {
      return;
    }
    action.clear();
    try {
      await destroy.mutateAsync({ id: deleting.message.id, etag: deleting.etag });
    } catch (thrown) {
      // Dialog stays open, so a 412 is read where the action was taken rather
      // than behind a dialog that has vanished.
      action.setFromThrown(thrown);
      return;
    }
    setDeleting(null);
    setOpened(null);
    await refresh();
  }

  return (
    <PageSection>
      <div className="flex flex-wrap items-baseline gap-tight">
        <h1 className="font-display text-4xl">{fr.contactMessages.heading}</h1>
        {total === null ? null : (
          <span className="text-ink-muted" data-testid="message-count">
            {total} {total > 1 ? fr.contactMessages.messagesWord : fr.contactMessages.messageWord}
          </span>
        )}
      </div>

      <div
        className="mt-related flex flex-wrap gap-tight"
        role="group"
        aria-label={fr.contactMessages.heading}
      >
        <Button
          type="button"
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          {fr.contactMessages.filterAll}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={filter === "open" ? "default" : "outline"}
          aria-pressed={filter === "open"}
          onClick={() => setFilter("open")}
        >
          {fr.contactMessages.filterOpen}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={filter === "handled" ? "default" : "outline"}
          aria-pressed={filter === "handled"}
          onClick={() => setFilter("handled")}
        >
          {fr.contactMessages.filterHandled}
        </Button>
      </div>

      {readError ? (
        <p role="alert" className="mt-block text-danger">
          {readError}
        </p>
      ) : null}

      {opened ? (
        <MessagePanel
          message={opened.message}
          busy={handle.isPending || destroy.isPending}
          error={action.error}
          mayManage={mayManage}
          onHandle={() => void toggleHandled(true)}
          onReopen={() => void toggleHandled(false)}
          onDelete={openDeleteDialog}
          onClose={closePanel}
        />
      ) : null}

      {list.isPending ? <p className="mt-block">Chargement…</p> : null}
      {list.isError ? (
        <p role="alert" className="mt-block text-danger">
          {fr.contactMessages.loadError}
        </p>
      ) : null}

      {!list.isPending && !list.isError && visible.length === 0 ? (
        <p className="mt-block text-ink-muted">
          {total === 0 ? fr.contactMessages.empty : fr.contactMessages.emptyFiltered}
        </p>
      ) : null}

      {!list.isPending && !list.isError && visible.length > 0 ? (
        <>
          {/* CARDS BELOW md. */}
          <ul data-testid="messages-cards" className="mt-block flex flex-col gap-related md:hidden">
            {visible.map((message) => (
              <li
                key={message.id}
                data-message={message.id}
                className="rounded-md border border-line bg-panel p-4"
              >
                <MessageSummary
                  message={message}
                  busy={openingId === message.id}
                  onRead={() => void openMessage(message.id)}
                />
              </li>
            ))}
          </ul>

          {/* A TABLE FROM md UP. */}
          <div data-testid="messages-table" className="mt-block hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Expéditeur</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Reçu le</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((message) => (
                  <TableRow key={message.id} data-message={message.id}>
                    <TableCell>
                      {message.firstName}{" "}
                      <span data-testid="message-last-name">{message.lastName}</span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{preview(message)}</TableCell>
                    <TableCell className="text-ink-muted">
                      {formatReceived(message.receivedAt)}
                    </TableCell>
                    <TableCell>
                      {message.handledAt === null
                        ? fr.contactMessages.openStatus
                        : fr.contactMessages.handledStatus}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-disabled={openingId === message.id}
                        onClick={() => {
                          if (openingId === message.id) return;
                          void openMessage(message.id);
                        }}
                      >
                        <span aria-hidden="true">{fr.contactMessages.read}</span>
                        <span className="sr-only">
                          {fr.contactMessages.read} {message.firstName} {message.lastName}
                        </span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) {
            action.clear();
            setDeleting(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fr.contactMessages.deleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {fr.contactMessages.deleteConfirmDescription.replace(
                "{name}",
                deleting ? `${deleting.message.firstName} ${deleting.message.lastName}` : "",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {action.error ? (
            <p role="alert" className="text-danger">
              {action.error.message}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                action.clear();
                setDeleting(null);
              }}
            >
              Annuler
            </AlertDialogCancel>
            {/* A plain Button, not AlertDialogAction: that closes the dialog
                on click, and this action can fail — a 412 — so the message
                has to be readable where it happened. */}
            <Button
              type="button"
              variant="destructive"
              aria-disabled={destroy.isPending}
              onClick={() => {
                if (destroy.isPending) return;
                void confirmDelete();
              }}
            >
              {destroy.isPending ? "En cours…" : fr.contactMessages.delete}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageSection>
  );
}

/** One row's worth of facts, rendered once and shared by the card and table layouts. */
function MessageSummary({
  message,
  busy,
  onRead,
}: {
  message: ContactMessageResource;
  busy: boolean;
  onRead: () => void;
}) {
  const name = `${message.firstName} ${message.lastName}`;

  return (
    <>
      <p className="font-semibold">
        {message.firstName} <span data-testid="message-last-name">{message.lastName}</span>
      </p>
      <p className="text-sm text-ink-muted">{formatReceived(message.receivedAt)}</p>
      <p className="mt-tight text-sm">{preview(message)}</p>
      <p className="text-sm">
        {message.handledAt === null
          ? fr.contactMessages.openStatus
          : fr.contactMessages.handledStatus}
      </p>
      <div className="mt-related">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-disabled={busy}
          onClick={() => {
            if (busy) return;
            onRead();
          }}
        >
          <span aria-hidden="true">{fr.contactMessages.read}</span>
          <span className="sr-only">
            {fr.contactMessages.read} {name}
          </span>
        </Button>
      </div>
    </>
  );
}

/**
 * The expanded message: everything the row's summary leaves out, plus the
 * controls a `messages.manage` holder gets and a `messages.view`-only reader
 * does not.
 */
function MessagePanel({
  message,
  busy,
  error,
  mayManage,
  onHandle,
  onReopen,
  onDelete,
  onClose,
}: {
  message: ContactMessageResource;
  busy: boolean;
  error: ReturnType<typeof useApiFormError>["error"];
  mayManage: boolean;
  onHandle: () => void;
  onReopen: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div
      data-testid="message-panel"
      className="mt-block flex flex-col gap-related rounded-md border border-line bg-panel p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-tight">
        <div>
          <h2 className="font-display text-2xl">
            {message.firstName} {message.lastName}
          </h2>
          <a href={`mailto:${message.email}`} className="text-sm text-ink-muted underline">
            {message.email}
          </a>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {fr.contactMessages.close}
        </Button>
      </div>

      {message.subject ? <p className="font-semibold">{message.subject}</p> : null}

      <p className="whitespace-pre-line">{message.message}</p>

      <p className="text-sm text-ink-muted">{formatReceived(message.receivedAt)}</p>

      {message.handledAt !== null ? (
        <p className="text-sm text-ink-muted">
          {fr.contactMessages.handledBy
            .replace("{name}", message.handledBy ?? "")
            .replace("{date}", formatReceived(message.handledAt))}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger">
          {error.message}
        </p>
      ) : null}

      {mayManage ? (
        <div className="flex flex-wrap gap-tight">
          {message.handledAt === null ? (
            <Button type="button" size="sm" aria-disabled={busy} onClick={onHandle}>
              {fr.contactMessages.handle}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-disabled={busy}
              onClick={onReopen}
            >
              {fr.contactMessages.reopen}
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            aria-disabled={busy}
            onClick={onDelete}
          >
            {fr.contactMessages.delete}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
