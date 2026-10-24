import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil } from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { rowsOf } from "../api/collection";
import {
  eventShow,
  getEventShowQueryKey,
  registrationOptionIndex,
  registrationOptionReplace,
} from "../api/generated/endpoints";
import type {
  EditableRegistrationOptionResource,
  EventResource,
  OptionKind,
  ReplaceRegistrationOptionsRequest,
} from "../api/generated/model";
import { ApiError } from "../api/http";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { BlockInserter } from "../booking/editor/BlockInserter";
import { ContactBlock } from "../booking/editor/ContactBlock";
import { CopyFrom } from "../booking/editor/CopyFrom";
import {
  blankDraft,
  copiedDrafts,
  draftFrom,
  payloadOf,
  parseCapacity,
  type Draft,
} from "../booking/editor/drafts";
import { EditableBlock, nameOf, type BlockProblems } from "../booking/editor/EditableBlock";
import { settingsFrom, settingsPayload, type FormSettings } from "../booking/editor/settings";
import { SettingsStrip } from "../booking/editor/SettingsStrip";
import { PageHero } from "../carnival/PageHero";
import { RAISED_CARD } from "../carnival/raised";
import { FormError, RequiredLegend } from "../components/FormField";
import { useLeaveGuard } from "../components/LeaveGuard";
import { PageSection } from "../components/PageSection";
import { formatEventWhen } from "../events/formatEventWhen";
import { t } from "../i18n";
import { parseFrancs } from "../money";

/** What the screen compares to tell an unsaved edit, ignoring React's keys. */
function snapshotOf(drafts: Draft[], settings: FormSettings | null): string {
  return JSON.stringify({
    drafts: drafts.map((row) => ({
      ...row,
      key: undefined,
      answers: row.answers.map((answer) => ({ ...answer, key: undefined })),
    })),
    settings,
  });
}

/**
 * The booking form, built in place: what the committee edits is what a guest
 * fills in (#319).
 *
 * Gated on `events.manage`: configuring what an event offers is configuring
 * the event.
 *
 * One save writes the blocks and the form's settings together, through the
 * options PUT and its `event.options` tag, which covers both. The blocks are
 * read first and the event after, so a change in between makes the save
 * answer 412 instead of being overwritten. Both are read once,
 * imperatively, and the tag is kept: a refetch would advance the tag while
 * the screen still shows what it opened with.
 *
 * Replace-all: the whole list goes every time (an entry with an id updates,
 * one without creates, anything missing is deleted). The server refuses
 * removing a block or an answer somebody booked; the screen leaves out the
 * button for those, and the refusal stays the real check.
 */
export function EventFormEditor() {
  const { id } = useParams();
  const eventId = Number(id);
  const queryClient = useQueryClient();

  const [event, setEvent] = useState<EventResource | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [settings, setSettings] = useState<FormSettings | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  // The state as last read or saved, against which an edit is unsaved.
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [guest, setGuest] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [localProblems, setLocalProblems] = useState<Record<string, BlockProblems>>({});
  // Beside the button, not in a toast: a toast is gone by the time somebody
  // looks up from the form.
  const [saved, setSaved] = useState(false);

  const form = useApiFormError(t("registrationOptions.saveFailed"));

  const replace = useMutation({
    mutationFn: ({ body, tag }: { body: ReplaceRegistrationOptionsRequest; tag: string }) =>
      registrationOptionReplace(eventId, body, ifMatch(tag)),
  });

  const dirty = settings !== null && snapshotOf(drafts, settings) !== baseline;
  useLeaveGuard(dirty, t("registrationOptions.leave"));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // The options first: their tag covers the settings too, so reading
        // the event second can only show settings at least as new as the tag.
        const options = await registrationOptionIndex(eventId);
        const read = await eventShow(eventId);
        if (cancelled) {
          return;
        }
        if (read.status !== 200) {
          throw new Error("event not read");
        }
        const rows = rowsOf<EditableRegistrationOptionResource>(options).map(draftFrom);
        const typed = settingsFrom(read.data);
        setEvent(read.data);
        setDrafts(rows);
        setSettings(typed);
        setBaseline(snapshotOf(rows, typed));
        setEtag(entityTagOf(options));
      } catch {
        if (!cancelled) {
          setReadError(t("registrationOptions.loadFailedReload"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  /** Any edit retracts the confirmation, which would describe an older form. */
  function edited() {
    setSaved(false);
  }

  function update(key: string, patch: Partial<Draft>) {
    edited();
    setDrafts((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function insert(position: number, kind: OptionKind) {
    const row = blankDraft(kind);
    edited();
    setDrafts((current) => [...current.slice(0, position), row, ...current.slice(position)]);
    setOpenKey(row.key);
  }

  function move(index: number, by: -1 | 1) {
    edited();
    setDrafts((current) => {
      const next = [...current];
      const row = next[index];
      const swap = next[index + by];
      // Reading both rows is the bounds check: noUncheckedIndexedAccess makes
      // each `Draft | undefined`.
      if (!row || !swap) {
        return current;
      }
      next[index] = swap;
      next[index + by] = row;
      return next;
    });
  }

  /** Puts the dragged block where the one dropped on is. */
  function drop(onto: string) {
    const dragged = dragKey;
    setDragKey(null);
    if (dragged === null || dragged === onto) {
      return;
    }
    edited();
    setDrafts((current) => {
      const row = current.find((candidate) => candidate.key === dragged);
      if (!row) {
        return current;
      }
      const rest = current.filter((candidate) => candidate.key !== dragged);
      const at = rest.findIndex((candidate) => candidate.key === onto);
      // Dropped on a block further down, it goes after it, which is where the
      // pointer is.
      const after = current.findIndex((candidate) => candidate.key === dragged) <= at;
      return [...rest.slice(0, at + (after ? 1 : 0)), row, ...rest.slice(at + (after ? 1 : 0))];
    });
  }

  async function save() {
    if (etag === null || settings === null) {
      setReadError(t("registrationOptions.loadFailedReload"));
      return;
    }

    form.clear();

    // Prices, capacities and answers are checked before anything is sent, so
    // a malformed one is reported against its block. The API takes integer
    // centimes, so the typed price never reaches it.
    const problems: Record<string, BlockProblems> = {};
    const options = drafts.flatMap((row, index) => {
      const quantity = row.kind === "quantity";
      const price = quantity ? parseFrancs(row.price) : null;
      const capacity = quantity ? parseCapacity(row.capacity) : null;
      const found: BlockProblems = {};

      if (price === "invalid") {
        found.price = t("registrationOptions.priceInvalid");
      }
      if (capacity === "invalid") {
        found.capacity = t("registrationOptions.capacityInvalid");
      }
      // The API's own rule, checked here so the block is marked before a
      // round trip. An answer left blank does not count.
      if (row.kind === "choice" && row.answers.filter((a) => a.label.trim() !== "").length < 2) {
        found.answers = t("registrationOptions.tooFewAnswers");
      }
      if (Object.keys(found).length > 0 || price === "invalid" || capacity === "invalid") {
        problems[row.key] = found;
        return [];
      }

      return [payloadOf(row, index, price, capacity)];
    });

    setLocalProblems(problems);
    const faulty = drafts.find((row) => problems[row.key]);
    if (faulty) {
      // A closed block shows no field, so the one in fault is opened.
      setOpenKey(faulty.key);
      return;
    }

    try {
      const written = await replace.mutateAsync({
        body: { options, form: settingsPayload(settings) },
        tag: etag,
      });

      // The write hands back the new list and tag, so a second save does not
      // quote a stale tag and get a 412 for this screen's own edit.
      const rows = rowsOf<EditableRegistrationOptionResource>(written).map(draftFrom);
      setDrafts(rows);
      setEtag(entityTagOf(written));
      setBaseline(snapshotOf(rows, settings));
      setOpenKey(null);
      setSaved(true);
      // The planning and the event screen show these settings too.
      void queryClient.invalidateQueries({ queryKey: getEventShowQueryKey(eventId) });
      void queryClient.invalidateQueries({ queryKey: ["/events"] });
    } catch (thrown) {
      // The form stays as it is: a refused save (a booked block removed, or a
      // stale tag) must not throw away the rest of the edit.
      form.setFromThrown(thrown);
      // The server names a block by its position in what was sent, which is
      // its position here since every block was sent.
      const named = thrown instanceof ApiError ? thrown.fields : [];
      const position = named
        .map((field) => /^options\.(\d+)\./.exec(field.field ?? "")?.[1])
        .find((match) => match !== undefined);
      const row = position === undefined ? undefined : drafts[Number(position)];
      if (row) {
        setOpenKey(row.key);
      }
    }
  }

  function problemsOf(row: Draft, index: number): BlockProblems {
    const local = localProblems[row.key] ?? {};
    const server = (field: string) => form.messageFor(`options.${index}.${field}`);

    return {
      label: server("label"),
      description: server("description"),
      price: local.price ?? server("priceCents"),
      capacity: local.capacity ?? server("capacity"),
      answers: local.answers ?? server("answers"),
    };
  }

  function dragStartFor(row: Draft) {
    return (dragged: DragEvent<HTMLElement>) => {
      setDragKey(row.key);
      dragged.dataTransfer.effectAllowed = "move";
      dragged.dataTransfer.setData("text/plain", row.key);
      // The whole block follows the pointer, not just the handle.
      const item = dragged.currentTarget.closest("li");
      if (item) {
        dragged.dataTransfer.setDragImage(item, 24, 24);
      }
    };
  }

  if (loading) {
    return (
      <PageSection width="text">
        <p className="text-ink-muted">{t("common.loading")}</p>
      </PageSection>
    );
  }

  if (readError || event === null || settings === null) {
    return (
      <PageSection width="text">
        <p role="alert" className="text-danger">
          {readError ?? t("registrationOptions.loadFailedReload")}
        </p>
      </PageSection>
    );
  }

  const blocks = (
    <ol className={cn("flex flex-col", guest ? "gap-related" : "gap-block")}>
      <li aria-label={t("registrationOptions.contactHeading")} className="flex flex-col gap-block">
        <ContactBlock
          asksAddress={settings.asksAddress}
          asksTable={settings.asksTable}
          guest={guest}
          onChange={(patch) => {
            edited();
            setSettings((current) => (current ? { ...current, ...patch } : current));
          }}
        />
        {guest ? null : (
          <BlockInserter
            label={t("registrationOptions.insertFirst")}
            onPick={(kind) => insert(0, kind)}
          />
        )}
      </li>

      {drafts.map((row, index) => (
        <li
          key={row.key}
          aria-label={
            row.label.trim() === "" ? t(`registrationOptions.kinds.${row.kind}`) : row.label
          }
          className={cn("flex flex-col gap-block", dragKey === row.key && "opacity-50")}
          onDragOver={(over) => {
            if (dragKey !== null) {
              over.preventDefault();
            }
          }}
          onDrop={(dropped) => {
            dropped.preventDefault();
            drop(row.key);
          }}
          onDragEnd={() => setDragKey(null)}
        >
          <EditableBlock
            row={row}
            position={index}
            open={openKey === row.key}
            guest={guest}
            first={index === 0}
            last={index === drafts.length - 1}
            problems={problemsOf(row, index)}
            onOpen={() => setOpenKey(row.key)}
            onClose={() => setOpenKey(null)}
            onChange={(patch) => update(row.key, patch)}
            onMove={(by) => move(index, by)}
            onRemove={() => {
              edited();
              setOpenKey(null);
              setDrafts((current) => current.filter((other) => other.key !== row.key));
            }}
            onDragStart={dragStartFor(row)}
          />
          {guest || index === drafts.length - 1 ? null : (
            <BlockInserter
              label={t("registrationOptions.insertAfter", { block: nameOf(row) })}
              onPick={(kind) => insert(index + 1, kind)}
            />
          )}
        </li>
      ))}
    </ol>
  );

  return (
    <>
      {/* The event's own title, as on the booking page the guest opens. */}
      <PageHero title={event.title} seed={13} width="text">
        <p>
          {formatEventWhen(event.startsAt, event.endsAt)}
          {event.location ? ` — ${event.location}` : null}
        </p>
      </PageHero>

      <PageSection width="text">
        <div className="flex flex-wrap items-center justify-between gap-related">
          <Link to="/events" className="text-sm text-ink-muted underline">
            {t("common.backToPlanning")}
          </Link>
          <Button
            type="button"
            variant="raised-light"
            onClick={() => {
              setOpenKey(null);
              setGuest((current) => !current);
            }}
          >
            {guest ? <Pencil aria-hidden="true" /> : <Eye aria-hidden="true" />}
            {guest ? t("registrationOptions.backToEditing") : t("registrationOptions.preview")}
          </Button>
        </div>

        {guest ? (
          // The guest's card, as EventBooking draws it.
          <Card className={cn(RAISED_CARD, "mt-related gap-related p-5")}>
            <RequiredLegend />
            {blocks}
          </Card>
        ) : (
          <div className="mt-related flex flex-col gap-block">
            <p className="text-ink-muted">{t("registrationOptions.editing")}</p>

            <SettingsStrip
              settings={settings}
              problemFor={form.messageFor}
              onChange={(patch) => {
                edited();
                setSettings((current) => (current ? { ...current, ...patch } : current));
              }}
            />

            {blocks}

            <BlockInserter
              wide
              label={t("registrationOptions.insertHere")}
              onPick={(kind) => insert(drafts.length, kind)}
            />

            {drafts.length === 0 ? (
              <CopyFrom
                eventId={eventId}
                onCopy={(options) => {
                  edited();
                  setDrafts(copiedDrafts(options));
                }}
              />
            ) : null}

            <FormError error={form.error} />

            <div className="flex flex-wrap items-center justify-end gap-related">
              {saved ? (
                <p role="status" className="text-ink-muted">
                  {t("registrationOptions.saved")}
                </p>
              ) : null}
              <Button
                type="button"
                aria-disabled={replace.isPending}
                onClick={() => {
                  if (replace.isPending) {
                    return;
                  }
                  void save();
                }}
              >
                {replace.isPending ? t("registrationOptions.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        )}
      </PageSection>
    </>
  );
}
