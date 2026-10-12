import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { rowsOf } from "../api/collection";
import {
  getMemberIndexQueryKey,
  getSectionIndexQueryKey,
  sectionDestroy,
  sectionReorder,
  sectionShow,
  sectionStore,
  sectionUpdate,
  useSectionIndex,
} from "../api/generated/endpoints";
import type { SectionResource } from "../api/generated/model";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField, formIsValid } from "../components/FormField";
import { PageSection } from "../components/PageSection";
import { registerName, t } from "../i18n";
import { OUTLINED_CARD } from "../carnival/raised";

type RegisterDraft = { name: string; nameDe: string };

const EMPTY: RegisterDraft = { name: "", nameDe: "" };

function bodyOf(draft: RegisterDraft) {
  return { name: draft.name, nameDe: draft.nameDe.trim() === "" ? null : draft.nameDe };
}

/**
 * The register list (#276): add, rename, reorder, delete. Which register a
 * member plays in is chosen on the roster, and which photo a register shows on
 * /band, where it is shown; this page only keeps the list.
 *
 * Rename and delete each start with a read of the one register, whose `ETag`
 * the write quotes back. Moving sends the whole order, so it needs no tag.
 */
export function Registers() {
  const queryClient = useQueryClient();
  const list = useSectionIndex();
  const registers = rowsOf<SectionResource>(list.data);
  const [moving, setMoving] = useState(false);
  const reordering = useApiFormError(t("registers.moveFailed"));

  const refresh = async () => {
    // The roster too: its cards carry a copy of each member's register name.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getSectionIndexQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getMemberIndexQueryKey() }),
    ]);
  };

  const move = async (index: number, by: -1 | 1) => {
    const target = index + by;
    if (moving || target < 0 || target >= registers.length) {
      return;
    }
    const ids = registers.map((register) => register.id);
    ids.splice(target, 0, ...ids.splice(index, 1));
    setMoving(true);
    reordering.clear();
    try {
      await sectionReorder({ sectionIds: ids });
    } catch (thrown) {
      reordering.setFromThrown(thrown);
    } finally {
      // Refetched on a refusal too: registers_changed means the list on
      // screen is not the one stored.
      await refresh();
      setMoving(false);
    }
  };

  return (
    <PageSection width="form">
      <h1 className="font-display text-3xl">{t("registers.heading")}</h1>
      <p className="mt-tight text-ink-muted">{t("registers.intro")}</p>

      {list.isPending ? <p className="mt-block text-ink-muted">{t("common.loading")}</p> : null}

      <div role="alert">
        {reordering.error !== null ? (
          <p className="mt-block text-danger">{reordering.error.message}</p>
        ) : null}
      </div>

      <ol className="mt-block grid gap-related">
        {registers.map((register, index) => (
          <RegisterRow
            key={register.id}
            register={register}
            first={index === 0}
            last={index === registers.length - 1}
            moving={moving}
            onMove={(by) => void move(index, by)}
            onChanged={refresh}
          />
        ))}
      </ol>

      <NewRegister onCreated={refresh} />
    </PageSection>
  );
}

function RegisterRow({
  register,
  first,
  last,
  moving,
  onMove,
  onChanged,
}: {
  register: SectionResource;
  first: boolean;
  last: boolean;
  moving: boolean;
  onMove: (by: -1 | 1) => void;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<{ draft: RegisterDraft; etag: string } | null>(null);
  const [deleting, setDeleting] = useState<{ read: SectionResource; etag: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useApiFormError(t("registers.saveFailed"));
  const removing = useApiFormError(t("registers.deleteFailed"));
  const label = registerName(register.name, register.nameDe);

  // The read is where "while this form was open" starts, so it happens when
  // the row opens, not when it saves. The delete dialog reads the counts
  // from it too, rather than from a list that may be minutes old.
  const open = async (then: "edit" | "delete") => {
    setBusy(true);
    try {
      const read = await sectionShow(register.id);
      const etag = read.status === 200 ? entityTagOf(read) : null;
      if (read.status !== 200 || etag === null) {
        return;
      }
      if (then === "edit") {
        saving.clear();
        setEditing({
          draft: { name: read.data.name, nameDe: read.data.nameDe ?? "" },
          etag,
        });
      } else {
        removing.clear();
        setDeleting({ read: read.data, etag });
      }
    } catch (thrown) {
      (then === "edit" ? saving : removing).setFromThrown(thrown);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (editing === null) {
      return;
    }
    setBusy(true);
    try {
      await sectionUpdate(register.id, bodyOf(editing.draft), ifMatch(editing.etag));
      await onChanged();
      setEditing(null);
    } catch (thrown) {
      saving.setFromThrown(thrown);
    } finally {
      setBusy(false);
    }
  };

  const destroy = async () => {
    if (deleting === null) {
      return;
    }
    setBusy(true);
    try {
      await sectionDestroy(register.id, ifMatch(deleting.etag));
      setDeleting(null);
      await onChanged();
    } catch (thrown) {
      removing.setFromThrown(thrown);
    } finally {
      setBusy(false);
    }
  };

  const players = deleting?.read.playerCount ?? 0;
  const instructors = deleting?.read.instructorCount ?? 0;
  const inUse = players > 0 || instructors > 0;

  return (
    <li data-testid="register-row" className={`${OUTLINED_CARD} p-4`}>
      {editing === null ? (
        <div className="flex flex-wrap items-center justify-between gap-related">
          <div className="min-w-0">
            {/* Both names when there are two, so either page can be checked
                from the other; one when the German page falls back. */}
            <p className="font-semibold">
              {register.name}
              {register.nameDe === null ? "" : ` · ${register.nameDe}`}
            </p>
            <p className="text-sm text-ink-muted">
              {t("registers.players", { count: register.playerCount ?? 0 })} ·{" "}
              {t("registers.instructors", { count: register.instructorCount ?? 0 })}
            </p>
          </div>
          {/* The arrows apart from the actions, and Supprimer last, away from
              them: see docs/adr/0025-icons-on-controls.md. Every button here
              takes aria-disabled and an early return while a write runs,
              never `disabled`: see rule 2 in ui/button.tsx. */}
          <div className="flex flex-wrap items-center gap-tight">
            <Button
              type="button"
              variant="raised-light"
              size="icon"
              aria-label={t("registers.moveUpAria", { label })}
              aria-disabled={first || moving}
              onClick={() => {
                if (first || moving) return;
                onMove(-1);
              }}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="raised-light"
              size="icon"
              aria-label={t("registers.moveDownAria", { label })}
              aria-disabled={last || moving}
              onClick={() => {
                if (last || moving) return;
                onMove(1);
              }}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="raised-light"
              aria-label={t("registers.editAria", { label })}
              aria-disabled={busy}
              onClick={() => {
                if (busy) return;
                void open("edit");
              }}
            >
              {t("common.edit")}
            </Button>
            <Button
              type="button"
              variant="raised-light"
              aria-label={t("registers.deleteAria", { label })}
              aria-disabled={busy}
              onClick={() => {
                if (busy) return;
                void open("delete");
              }}
            >
              {t("common.delete")}
            </Button>
          </div>
          {removing.error !== null && deleting === null ? (
            <p role="alert" className="w-full text-sm text-danger">
              {removing.error.message}
            </p>
          ) : null}
        </div>
      ) : (
        <form
          noValidate
          className="grid gap-related"
          onSubmit={(submitted) => {
            submitted.preventDefault();
            if (busy || !formIsValid(submitted.currentTarget)) {
              return;
            }
            void save();
          }}
        >
          <RegisterFields
            idPrefix={`register-${register.id}`}
            draft={editing.draft}
            onChange={(draft) => setEditing({ ...editing, draft })}
            problemFor={saving.messageFor}
          />
          <FormError error={saving.error} />
          <div className="flex flex-wrap gap-tight">
            <Button type="submit" aria-disabled={busy}>
              {t("common.save")}
            </Button>
            <Button type="button" variant="raised-light" onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      )}

      <AlertDialog
        open={deleting !== null}
        // As on the tag list: Radix's Cancel and Escape both land here, and
        // this check keeps the dialog open while the delete runs.
        onOpenChange={(next) => {
          if (!next && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("registers.deleteTitle", { label })}</AlertDialogTitle>
            <AlertDialogDescription>
              {inUse
                ? t("registers.deleteInUse", {
                    players: t("registers.players", { count: players }),
                    instructors: t("registers.instructors", { count: instructors }),
                  })
                : t("registers.deleteUnused")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div role="alert">
            {removing.error !== null ? (
              <p className="text-danger">{removing.error.message}</p>
            ) : null}
          </div>
          <AlertDialogFooter>
            {/* A register somebody is in cannot go, and the server refuses
                it anyway; offering the button would only earn a 409. */}
            <AlertDialogCancel aria-disabled={busy}>
              {inUse ? t("registers.close") : t("common.cancel")}
            </AlertDialogCancel>
            {inUse ? null : (
              <Button
                type="button"
                variant="raised-danger"
                aria-disabled={busy}
                onClick={() => {
                  if (busy) return;
                  void destroy();
                }}
              >
                {t("common.delete")}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function NewRegister({ onCreated }: { onCreated: () => Promise<void> }) {
  const [draft, setDraft] = useState<RegisterDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const creating = useApiFormError(t("registers.saveFailed"));

  return (
    <form
      noValidate
      aria-labelledby="new-register-heading"
      className="mt-block grid gap-related rounded-lg border border-dashed border-line p-4"
      onSubmit={(submitted) => {
        submitted.preventDefault();
        if (busy || !formIsValid(submitted.currentTarget)) {
          return;
        }
        setBusy(true);
        void sectionStore(bodyOf(draft))
          .then(async () => {
            creating.clear();
            setDraft(EMPTY);
            await onCreated();
          })
          .catch(creating.setFromThrown)
          .finally(() => setBusy(false));
      }}
    >
      <h2 id="new-register-heading" className="font-display text-xl">
        {t("registers.newHeading")}
      </h2>
      <RegisterFields
        idPrefix="new-register"
        draft={draft}
        onChange={setDraft}
        problemFor={creating.messageFor}
      />
      <FormError error={creating.error} />
      <div>
        <Button type="submit" aria-disabled={busy}>
          {t("registers.add")}
        </Button>
      </div>
    </form>
  );
}

/** The two names, shared by the new-register form and a row being edited. */
function RegisterFields({
  idPrefix,
  draft,
  onChange,
  problemFor,
}: {
  idPrefix: string;
  draft: RegisterDraft;
  onChange: (draft: RegisterDraft) => void;
  problemFor: (field: string) => string | undefined;
}) {
  return (
    <>
      <FormField
        id={`${idPrefix}-fr`}
        label={t("fields.labelFr")}
        value={draft.name}
        onChange={(name) => onChange({ ...draft, name })}
        problem={problemFor("name")}
        required
        maxLength={60}
      />
      <FormField
        id={`${idPrefix}-de`}
        label={t("fields.labelDe")}
        value={draft.nameDe}
        onChange={(nameDe) => onChange({ ...draft, nameDe })}
        problem={problemFor("nameDe")}
        maxLength={60}
      />
    </>
  );
}
