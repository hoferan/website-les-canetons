import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";

import {
  contactMessageDestroy,
  contactMessageHandle,
  contactMessageShow,
  getContactMessageIndexQueryKey,
  getInboxSummaryQueryKey,
  useContactMessageIndex,
} from "../api/generated/endpoints";
import type { ContactMessageResource } from "../api/generated/model";
import { rowsOf, totalOf } from "../api/collection";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { PageSection } from "../components/PageSection";
import { t } from "../i18n";
import { formatInstant } from "../lib/date";
import { useSession } from "../session/SessionProvider";
import { OUTLINED_CARD } from "../carnival/raised";

type Filter = "all" | "open" | "handled";

/** The subject, or the opening of the body, as the inbox shows it. */
function preview(message: ContactMessageResource): string {
  if (message.subject) {
    return message.subject;
  }
  return message.message.length > 120 ? `${message.message.slice(0, 120)}…` : message.message;
}

/**
 * The heading's count. Unfiltered, it is the whole archive; filtered, it
 * names both numbers, so it never claims a total the rows beneath it don't
 * back up.
 */
function countLabel(filter: Filter, visible: number, total: number): string {
  // The catalogue picks the plural form: French counts zero as singular
  // ("0 message") and German does not ("0 Nachrichten").
  const word = t("contactMessages.word", { count: total });

  if (filter === "all") {
    return `${total} ${word}`;
  }

  // Single braces, replaced by hand, because both catalogues write this
  // section that way. Mixing them with i18next's `{{ }}` inside one key
  // silently renders the braces.
  return t("contactMessages.countFiltered")
    .replace("{visible}", String(visible))
    .replace("{total}", String(total))
    .replace("{word}", word);
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
 * Modelled on Members.tsx: the same read-then-write ETag flow and card grid.
 *
 * Expanding a row always re-reads it, even though the list carries every
 * field: the list hands out no `ETag` (one tag cannot validate every row), so
 * acting on a row straight from the list would be refused 428. The handle and
 * delete mutations quote the tag this read handed out, never a fresher one
 * (see web/src/api/ifMatch.ts).
 *
 * The route is guarded on `messages.view`, which the `committee` role holds.
 * Handling and deleting are `messages.manage`, so those controls are absent
 * for a viewer rather than present and refused.
 *
 * `?open=<id>` expands that message on arrival; the inbox's rows link here
 * with it.
 */
export function ContactMessages() {
  const { can } = useSession();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const list = useContactMessageIndex();

  const action = useApiFormError("L’action n’a pas pu être effectuée.");

  // Built over the generated functions, not orval's mutation hooks, which fix
  // their request options when created; the tag differs per call. See
  // web/src/api/ifMatch.ts.
  const handle = useMutation({
    mutationFn: ({ id, handled, etag }: { id: number; handled: boolean; etag: string }) =>
      contactMessageHandle(id, { handled }, ifMatch(etag)),
  });
  const destroy = useMutation({
    mutationFn: ({ id, etag }: { id: number; etag: string }) =>
      contactMessageDestroy(id, ifMatch(etag)),
  });

  const [filter, setFilter] = useState<Filter>("all");
  // The message currently expanded, and the ETag its read handed out, which
  // the handle and delete mutations quote back. Both writes return a fresh
  // tag on success, so a handle followed by a delete needs no second read.
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

  // Both keys: the archive's list, and the inbox badge, which lives in Layout
  // and never remounts, so nothing else would move its count after a handle
  // or delete. Layout.tsx has the other half (refresh on navigation).
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getContactMessageIndexQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getInboxSummaryQueryKey() }),
    ]);

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
        // Unreachable: the mutator throws on every non-2xx, but the declared
        // union still includes them.
        setReadError(t("contactMessages.readError"));
        return;
      }
      setOpened({ message: response.data, etag: entityTagOf(response) });
    } catch {
      setReadError(t("contactMessages.readError"));
    } finally {
      setOpeningId(null);
    }
  }

  // The inbox's deep link. Depends on the param's value, not the
  // `searchParams` object, which react-router hands out fresh on every render.
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
    // openMessage is redefined every render, and listing it would issue a
    // fresh GET on every filter click while `?open=` is present. It closes
    // over only state setters and module-level API functions, so the captured
    // version behaves like the newest one.
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
      // Without a tag the write would be refused 428.
      setReadError(t("contactMessages.readError"));
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
        // Unreachable: the mutator throws on every non-2xx, but the declared
        // union still includes them.
        setReadError(t("contactMessages.readError"));
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
        <h1 className="font-display text-4xl">{t("contactMessages.heading")}</h1>
        {total === null ? null : (
          <span className="text-ink-muted" data-testid="message-count">
            {countLabel(filter, visible.length, total)}
          </span>
        )}
      </div>

      <div
        className="mt-related flex flex-wrap gap-tight"
        role="group"
        aria-label={t("contactMessages.heading")}
      >
        <Button
          type="button"
          size="sm"
          variant={filter === "all" ? "raised-violet" : "raised-light"}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          {t("contactMessages.filterAll")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={filter === "open" ? "raised-violet" : "raised-light"}
          aria-pressed={filter === "open"}
          onClick={() => setFilter("open")}
        >
          {t("contactMessages.filterOpen")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={filter === "handled" ? "raised-violet" : "raised-light"}
          aria-pressed={filter === "handled"}
          onClick={() => setFilter("handled")}
        >
          {t("contactMessages.filterHandled")}
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
          onToggleHandled={toggleHandled}
          onDelete={openDeleteDialog}
          onClose={closePanel}
        />
      ) : null}

      {list.isPending ? <p className="mt-block">{t("common.loading")}</p> : null}
      {list.isError ? (
        <p role="alert" className="mt-block text-danger">
          {t("contactMessages.loadError")}
        </p>
      ) : null}

      {!list.isPending && !list.isError && visible.length === 0 ? (
        <p className="mt-block text-ink-muted">
          {total === 0 ? t("contactMessages.empty") : t("contactMessages.emptyFiltered")}
        </p>
      ) : null}

      {!list.isPending && !list.isError && visible.length > 0 ? (
        <>
          <ul
            data-testid="messages-cards"
            className="mt-block grid gap-related sm:grid-cols-2 xl:grid-cols-3"
          >
            {visible.map((message) => (
              <li key={message.id} data-message={message.id} className={`${OUTLINED_CARD} p-4`}>
                <MessageSummary
                  message={message}
                  busy={openingId === message.id}
                  onRead={() => void openMessage(message.id)}
                />
              </li>
            ))}
          </ul>
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
            <AlertDialogTitle>{t("contactMessages.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("contactMessages.deleteConfirmDescription").replace(
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
              {t("common.cancel")}
            </AlertDialogCancel>
            {/* A plain Button, not AlertDialogAction, which closes the dialog
                on click: a 412 has to be readable where it happened. */}
            <Button
              type="button"
              variant="raised-danger"
              aria-disabled={destroy.isPending}
              onClick={() => {
                if (destroy.isPending) return;
                void confirmDelete();
              }}
            >
              {destroy.isPending ? t("common.busy") : t("contactMessages.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageSection>
  );
}

/**
 * One message's facts, as the archive list shows them. The card is the only
 * layout, so a field added here arrives at every width.
 */
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
      <p className="text-sm text-ink-muted">{formatInstant(message.receivedAt)}</p>
      <p className="mt-tight text-sm">{preview(message)}</p>
      <p className="text-sm">
        {message.handledAt === null
          ? t("contactMessages.openStatus")
          : t("contactMessages.handledStatus")}
      </p>
      <div className="mt-related">
        <Button
          type="button"
          variant="raised-light"
          size="sm"
          aria-disabled={busy}
          onClick={() => {
            if (busy) return;
            onRead();
          }}
        >
          <span aria-hidden="true">{t("contactMessages.read")}</span>
          <span className="sr-only">
            {t("contactMessages.read")} {name}
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
 *
 * "Traité" is a switch because it saves as it is flipped, and flipping it
 * back reopens the message. aria-disabled and an early return while a write
 * is in flight, never `disabled`: Radix renders the switch as a button, and
 * the docblock in ui/button.tsx says what `disabled` does to its focus.
 */
function MessagePanel({
  message,
  busy,
  error,
  mayManage,
  onToggleHandled,
  onDelete,
  onClose,
}: {
  message: ContactMessageResource;
  busy: boolean;
  error: ReturnType<typeof useApiFormError>["error"];
  mayManage: boolean;
  onToggleHandled: (handled: boolean) => Promise<void>;
  onDelete: () => void;
  onClose: () => void;
}) {
  // The switch shows the new value while its write is in flight, and falls
  // back to the stored one once the panel holds the saved message or the
  // server refused.
  const [flipped, setFlipped] = useState<boolean | null>(null);
  const locked = busy || flipped !== null;

  const flip = async (handled: boolean) => {
    setFlipped(handled);
    try {
      await onToggleHandled(handled);
    } finally {
      setFlipped(null);
    }
  };

  const switchId = `message-${message.id}-handled`;

  return (
    <div
      data-testid="message-panel"
      className={`${OUTLINED_CARD} mt-block flex flex-col gap-related p-4`}
    >
      {/* The row does not wrap, so a long name wraps inside its block and the
          close button keeps the top right at 390px (#265). min-w-0 lets the
          name block shrink below its longest word, and break-words breaks a
          long name or e-mail inside it. */}
      <div className="flex items-start justify-between gap-tight">
        <div className="min-w-0 break-words">
          <h2 className="font-display text-2xl">
            {message.firstName} {message.lastName}
          </h2>
          <a href={`mailto:${message.email}`} className="text-sm text-ink-muted underline">
            {message.email}
          </a>
        </div>
        {/* Icon-only, so the label moves to the accessible name: this is the
            only way out of the panel. */}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={t("contactMessages.close")}
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      {message.subject ? <p className="font-semibold">{message.subject}</p> : null}

      <p className="whitespace-pre-line">{message.message}</p>

      <p className="text-sm text-ink-muted">{formatInstant(message.receivedAt)}</p>

      {message.handledAt !== null ? (
        <p className="text-sm text-ink-muted">
          {t("contactMessages.handledBy")
            .replace("{name}", message.handledBy ?? "")
            .replace("{date}", formatInstant(message.handledAt))}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger">
          {error.message}
        </p>
      ) : null}

      {mayManage ? (
        <div className="flex flex-wrap items-center justify-between gap-related">
          <div className="flex min-h-touch items-center gap-2">
            <Switch
              id={switchId}
              checked={flipped ?? message.handledAt !== null}
              aria-disabled={locked}
              onCheckedChange={(handled) => {
                if (locked) {
                  return;
                }
                void flip(handled);
              }}
            />
            <label htmlFor={switchId}>{t("contactMessages.handledSwitch")}</label>
          </div>
          <Button
            type="button"
            variant="raised-danger"
            size="sm"
            aria-disabled={busy}
            onClick={onDelete}
          >
            {t("contactMessages.delete")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
