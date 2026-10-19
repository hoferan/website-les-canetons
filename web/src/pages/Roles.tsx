import { useQueryClient } from "@tanstack/react-query";
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
  getRoleIndexQueryKey,
  roleDestroy,
  rolePermissionReplace,
  roleShow,
  roleStore,
  roleUpdate,
  useRoleIndex,
} from "../api/generated/endpoints";
import type { RoleResource, RoleResourceHoldersItem } from "../api/generated/model";
import { StoreRoleRequestPermissionsItem } from "../api/generated/model";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField, formIsValid } from "../components/FormField";
import { PageSection } from "../components/PageSection";
import { permissionHint, permissionLabel, roleName, roleNamesForEditing, t } from "../i18n";
import { OUTLINED_CARD } from "../carnival/raised";

/** Every permission, in the order the API's enum declares them. */
const PERMISSIONS: string[] = Object.values(StoreRoleRequestPermissionsItem);

type RoleDraft = { labelFr: string; labelDe: string; permissions: string[] };

const EMPTY: RoleDraft = { labelFr: "", labelDe: "", permissions: [] };

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/**
 * The role editor (#194): what each role is called and what it grants.
 * Giving a role to somebody stays on the roster (members.manage); this page
 * is roles.manage's.
 *
 * Every write starts from a read of the one role, whose `ETag` covers its
 * holders as well, so a delete never takes the role from somebody the
 * confirmation did not name.
 */
export function Roles() {
  const queryClient = useQueryClient();
  const list = useRoleIndex();
  const roles = rowsOf<RoleResource>(list.data);

  const refresh = async () => {
    // The roster too: its cards and its form show role names.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getRoleIndexQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getMemberIndexQueryKey() }),
    ]);
  };

  return (
    <PageSection width="form">
      <h1 className="font-display text-3xl">{t("rolesPage.heading")}</h1>
      <p className="mt-tight text-ink-muted">{t("rolesPage.intro")}</p>

      {list.isPending ? <p className="mt-block text-ink-muted">{t("common.loading")}</p> : null}

      <ul className="mt-block grid gap-related">
        {roles.map((role) => (
          <RoleCard key={role.id} role={role} onChanged={refresh} />
        ))}
      </ul>

      <NewRole onCreated={refresh} />
    </PageSection>
  );
}

function RoleCard({ role, onChanged }: { role: RoleResource; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<{
    draft: RoleDraft;
    initial: RoleDraft;
    etag: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<{
    holders: RoleResourceHoldersItem[];
    etag: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useApiFormError(t("rolesPage.saveFailed"));
  const removing = useApiFormError(t("rolesPage.deleteFailed"));
  const name = roleName(role);

  // The read is where "while this form was open" starts, so it happens when
  // the card opens, not when it saves.
  const open = async (then: "edit" | "delete") => {
    setBusy(true);
    try {
      const read = await roleShow(role.id);
      const etag = read.status === 200 ? entityTagOf(read) : null;
      if (read.status !== 200 || etag === null) {
        return;
      }
      if (then === "edit") {
        saving.clear();
        const names = roleNamesForEditing(read.data);
        const initial = {
          labelFr: names.fr,
          labelDe: names.de,
          permissions: read.data.permissions,
        };
        setEditing({ draft: initial, initial, etag });
      } else {
        removing.clear();
        setDeleting({ holders: read.data.holders ?? [], etag });
      }
    } catch (thrown) {
      (then === "edit" ? saving : removing).setFromThrown(thrown);
    } finally {
      setBusy(false);
    }
  };

  // Up to two writes, each only when its part changed: names, then grants.
  // The second quotes the tag the first handed back. A seeded role whose
  // names were left alone keeps no typed name, so the catalogue still
  // translates it.
  const save = async () => {
    if (editing === null) {
      return;
    }
    const { draft, initial } = editing;
    setBusy(true);
    try {
      let etag = editing.etag;
      if (draft.labelFr !== initial.labelFr || draft.labelDe !== initial.labelDe) {
        const renamed = await roleUpdate(
          role.id,
          { labelFr: draft.labelFr, labelDe: draft.labelDe.trim() === "" ? null : draft.labelDe },
          ifMatch(etag),
        );
        etag = entityTagOf(renamed) ?? etag;
      }
      if (!sameSet(draft.permissions, initial.permissions)) {
        await rolePermissionReplace(
          role.id,
          // Checked against the enum on the server; the boxes come from it.
          { permissions: draft.permissions as StoreRoleRequestPermissionsItem[] },
          ifMatch(etag),
        );
      }
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
      await roleDestroy(role.id, ifMatch(deleting.etag));
      setDeleting(null);
      await onChanged();
    } catch (thrown) {
      removing.setFromThrown(thrown);
    } finally {
      setBusy(false);
    }
  };

  const holderNames = (deleting?.holders ?? []).map(
    (holder) => `${holder.firstName} ${holder.lastName}`,
  );

  return (
    <li data-testid="role-card" className={`${OUTLINED_CARD} p-4`}>
      {editing === null ? (
        <div className="grid gap-tight">
          <h2 className="font-semibold">{name}</h2>
          <p className="text-sm text-ink-muted">
            {role.permissions.length > 0
              ? role.permissions.map(permissionLabel).join(", ")
              : t("rolesPage.grantsNothing")}
          </p>
          {role.isBaseline ? (
            <p className="text-sm">{t("rolesPage.baselineNote")}</p>
          ) : (
            // aria-disabled and an early return while a write runs, never
            // `disabled`: see rule 2 in ui/button.tsx.
            <div className="mt-tight flex flex-wrap gap-tight">
              <Button
                type="button"
                variant="raised-light"
                aria-label={t("rolesPage.editAria", { name })}
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
                aria-label={t("rolesPage.deleteAria", { name })}
                aria-disabled={busy}
                onClick={() => {
                  if (busy) return;
                  void open("delete");
                }}
              >
                {t("common.delete")}
              </Button>
            </div>
          )}
          {removing.error !== null && deleting === null ? (
            <p role="alert" className="text-sm text-danger">
              {removing.error.message}
            </p>
          ) : null}
        </div>
      ) : (
        <form
          noValidate
          aria-label={t("rolesPage.editAria", { name })}
          className="grid gap-related"
          onSubmit={(submitted) => {
            submitted.preventDefault();
            if (busy || !formIsValid(submitted.currentTarget)) {
              return;
            }
            void save();
          }}
        >
          <RoleFields
            idPrefix={`role-${role.id}`}
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
        // Annuler gets no handler of its own: Radix's Cancel calls this on
        // every click, whatever aria-disabled says, and so does Escape. This
        // check is what keeps the dialog open while the delete runs.
        onOpenChange={(next) => {
          if (!next && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rolesPage.deleteTitle", { name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {holderNames.length === 0
                ? t("rolesPage.deleteNobody")
                : t("rolesPage.deleteHolders", {
                    count: holderNames.length,
                    names: holderNames.join(", "),
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div role="alert">
            {removing.error !== null ? (
              <p className="text-danger">{removing.error.message}</p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel aria-disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
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
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function NewRole({ onCreated }: { onCreated: () => Promise<void> }) {
  const [draft, setDraft] = useState<RoleDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const creating = useApiFormError(t("rolesPage.saveFailed"));

  return (
    <form
      noValidate
      aria-labelledby="new-role-heading"
      className="mt-block grid gap-related rounded-lg border border-dashed border-line p-4"
      onSubmit={(submitted) => {
        submitted.preventDefault();
        if (busy || !formIsValid(submitted.currentTarget)) {
          return;
        }
        setBusy(true);
        void roleStore({
          labelFr: draft.labelFr,
          labelDe: draft.labelDe.trim() === "" ? null : draft.labelDe,
          permissions: draft.permissions as StoreRoleRequestPermissionsItem[],
        })
          .then(async () => {
            creating.clear();
            setDraft(EMPTY);
            await onCreated();
          })
          .catch(creating.setFromThrown)
          .finally(() => setBusy(false));
      }}
    >
      <h2 id="new-role-heading" className="font-display text-xl">
        {t("rolesPage.newHeading")}
      </h2>
      <RoleFields
        idPrefix="new-role"
        draft={draft}
        onChange={setDraft}
        problemFor={creating.messageFor}
      />
      <FormError error={creating.error} />
      <div>
        <Button type="submit" aria-disabled={busy}>
          {t("rolesPage.add")}
        </Button>
      </div>
    </form>
  );
}

/**
 * The two names and the permissions, shared by the new-role form and a card
 * being edited. Each permission's hint is its description (aria-describedby),
 * not part of the label, for the reason the roster form's role checkboxes
 * give.
 */
function RoleFields({
  idPrefix,
  draft,
  onChange,
  problemFor,
}: {
  idPrefix: string;
  draft: RoleDraft;
  onChange: (draft: RoleDraft) => void;
  problemFor: (field: string) => string | undefined;
}) {
  return (
    <>
      <FormField
        id={`${idPrefix}-fr`}
        label={t("fields.labelFr")}
        value={draft.labelFr}
        onChange={(labelFr) => onChange({ ...draft, labelFr })}
        problem={problemFor("labelFr")}
        required
        maxLength={60}
      />
      <FormField
        id={`${idPrefix}-de`}
        label={t("fields.labelDe")}
        value={draft.labelDe}
        onChange={(labelDe) => onChange({ ...draft, labelDe })}
        problem={problemFor("labelDe")}
        maxLength={60}
      />
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium text-ink">{t("rolesPage.permissionsLegend")}</legend>
        {PERMISSIONS.map((permission) => {
          const id = `${idPrefix}-${permission.replace(".", "-")}`;
          return (
            <div key={permission} className="flex min-h-touch items-start gap-2 py-1">
              <input
                id={id}
                type="checkbox"
                className="mt-1 size-5"
                aria-describedby={`${id}-hint`}
                checked={draft.permissions.includes(permission)}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    permissions: event.target.checked
                      ? [...draft.permissions, permission]
                      : draft.permissions.filter((held) => held !== permission),
                  })
                }
              />
              <div>
                <label htmlFor={id}>{permissionLabel(permission)}</label>
                <span id={`${id}-hint`} className="block text-sm text-ink-muted">
                  {permissionHint(permission)}
                </span>
              </div>
            </div>
          );
        })}
      </fieldset>
    </>
  );
}
