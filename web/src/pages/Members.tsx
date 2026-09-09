import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  getMemberIndexQueryKey,
  useMemberDestroy,
  useMemberIndex,
  useMemberPassword,
  useMemberRole,
  useMemberStore,
  useMemberUpdate,
  useRoleIndex,
  useSectionIndex,
} from "../api/generated/endpoints";
import type { MemberResource } from "../api/generated/model";
import { useApiFormError } from "../api/useApiFormError";
import { PageSection } from "../components/PageSection";
import { roleLabel } from "../i18n";
import { ConfirmByTypingName } from "../members/ConfirmByTypingName";
import { GeneratedPasswordDialog } from "../members/GeneratedPasswordDialog";
import { MemberForm, type MemberDraft } from "../members/MemberForm";

/**
 * The roster: everybody in the band.
 *
 * ONE ROSTER (design §8), and since 2026_09_08_000001 everybody on it has an
 * account — the roster is the people the band tracks for events, and all of
 * them are answerable for one. People the band merely displays, such as
 * instructors or honorary members, are CONTENT and are not here at all.
 *
 * CARDS BELOW `md`, A TABLE FROM `md` UP (§4: no bare tables on phones). The
 * screen this replaces rendered a table that scrolled sideways at 390px, which
 * is the width most of this band's phones actually are. Both layouts render
 * from the same array in one pass and only their wrappers differ, so the two
 * can never disagree about who is on the roster.
 *
 * ROLES ARE SHOWN BY THEIR FRENCH LABEL, joined from GET /api/roles. Never the
 * key, and never the permission strings: "why does she have this?" is answered
 * with "because she is in Team Direction" (design §3).
 *
 * INVARIANT REFUSALS COME FROM THE SERVER. This screen does not pre-empt
 * cannot_delete_self or cannot_remove_last_administrator with its own copy of
 * the rule — a duplicated rule drifts, and then the two disagree in front of
 * somebody trying to fix a lockout. It renders what the API says, translated.
 */
export function Members() {
  const roster = useMemberIndex();
  const sections = useSectionIndex();
  const roles = useRoleIndex();

  const queryClient = useQueryClient();
  const form = useApiFormError("L’enregistrement a échoué.");
  const destructive = useApiFormError("L’action a échoué.");

  const create = useMemberStore();
  const update = useMemberUpdate();
  const replaceRoles = useMemberRole();
  const destroy = useMemberDestroy();
  const issuePassword = useMemberPassword();

  // `editing` distinguishes three states: closed, creating (null) and editing
  // (a member). A separate boolean plus a member would allow a fourth,
  // meaningless one.
  const [editing, setEditing] = useState<{ member: MemberResource | null } | null>(null);
  const [deleting, setDeleting] = useState<MemberResource | null>(null);
  const [resetting, setResetting] = useState<MemberResource | null>(null);
  const [issued, setIssued] = useState<{ name: string; password: string } | null>(null);

  // Narrowed on status, not read straight off `.data`. orval types each query
  // as a discriminated union of every DECLARED response — here
  // `MemberResource[] | AuthenticationExceptionResponse` — so `.data` is not an
  // array until `status` picks a branch. In practice the mutator throws on 401
  // so the error branch never arrives as a resolved value, but the type is
  // honest that it could. Same treatment as SessionProvider.
  const members = roster.data?.status === 200 ? roster.data.data : [];
  const sectionList = sections.data?.status === 200 ? sections.data.data : [];
  const roleList = roles.data?.status === 200 ? roles.data.data : [];

  const labelForRole = (id: number) => {
    const key = roleList.find((role) => role.id === id)?.key;
    return key === undefined ? "" : roleLabel(key);
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: getMemberIndexQueryKey() });

  function openCreate() {
    form.clear();
    setEditing({ member: null });
  }

  function openEdit(member: MemberResource) {
    form.clear();
    setEditing({ member });
  }

  function closeForm() {
    form.clear();
    setEditing(null);
  }

  async function submitForm(draft: MemberDraft) {
    form.clear();

    const data = {
      firstName: draft.firstName,
      lastName: draft.lastName,
      username: draft.username,
      sectionId: draft.sectionId,
      committeeTitle: draft.committeeTitle === "" ? null : draft.committeeTitle,
      instructorOfSectionId: draft.instructorOfSectionId,
      publicVisible: draft.publicVisible,
    };

    try {
      if (editing?.member) {
        const member = editing.member;
        await update.mutateAsync({ member: member.id, data });

        // Roles travel on their own endpoint, and only when they changed: it
        // ends the member's sessions and writes an audit entry, so sending it
        // on every name correction would log people out for nothing.
        const before = [...member.roleIds].sort((a, b) => a - b);
        const after = [...draft.roleIds].sort((a, b) => a - b);
        if (before.join() !== after.join()) {
          await replaceRoles.mutateAsync({ member: member.id, data: { roleIds: draft.roleIds } });
        }
      } else {
        const result = await create.mutateAsync({ data });
        // One `.data` — orval's envelope on a mutation's return, not the double
        // one a query has — and narrowed on status for the same reason the
        // queries above are: the declared union includes the error responses.
        if (result.status === 201) {
          setIssued({
            name: `${draft.firstName} ${draft.lastName}`,
            password: result.data.generatedPassword,
          });
        }
      }
    } catch (thrown) {
      form.setFromThrown(thrown);
      // The panel stays OPEN: a rejected username has to be corrected where it
      // was typed, and closing the form would throw away everything else too.
      return;
    }

    setEditing(null);
    await refresh();
  }

  async function confirmDelete() {
    if (!deleting) {
      return;
    }
    destructive.clear();
    try {
      await destroy.mutateAsync({ member: deleting.id });
    } catch (thrown) {
      // Dialog stays open, so a 409 invariant is read where the action was
      // taken rather than behind a dialog that has vanished.
      destructive.setFromThrown(thrown);
      return;
    }
    setDeleting(null);
    await refresh();
  }

  async function confirmIssuePassword() {
    if (!resetting) {
      return;
    }
    destructive.clear();
    let password: string;
    try {
      const result = await issuePassword.mutateAsync({ member: resetting.id });
      if (result.status !== 200) {
        // Unreachable in practice — the mutator throws on every non-2xx — but
        // the declared union says it is possible, and inventing a password
        // string here would be worse than saying nothing happened.
        destructive.setFromThrown(result);
        return;
      }
      password = result.data.generatedPassword;
    } catch (thrown) {
      destructive.setFromThrown(thrown);
      return;
    }
    // Order matters: capture the password, then close the confirmation, then
    // show it. Closing first would unmount the state this reads.
    const name = `${resetting.firstName} ${resetting.lastName}`;
    setResetting(null);
    setIssued({ name, password });
    await refresh();
  }

  return (
    <PageSection>
      <h1 className="font-display text-4xl">Membres</h1>

      {editing ? (
        <MemberForm
          // Remounts when the subject changes, so the draft is rebuilt from the
          // new person rather than keeping the previous one's values.
          key={editing.member?.id ?? "new"}
          member={editing.member}
          sections={sectionList}
          roles={roleList}
          busy={create.isPending || update.isPending || replaceRoles.isPending}
          error={form.error}
          problemFor={form.messageFor}
          onSubmit={submitForm}
          onCancel={closeForm}
        />
      ) : (
        <Button className="mt-block" onClick={openCreate}>
          Ajouter une personne
        </Button>
      )}

      {roster.isPending ? <p className="mt-block">Chargement…</p> : null}
      {roster.isError ? (
        <p role="alert" className="mt-block text-danger">
          La liste des membres n’a pas pu être chargée.
        </p>
      ) : null}

      {/* CARDS BELOW md. */}
      <ul data-testid="roster-cards" className="mt-block flex flex-col gap-related md:hidden">
        {members.map((member) => (
          <li
            key={member.id}
            data-member={member.id}
            className="rounded-md border border-line bg-panel p-4"
          >
            <p className="font-semibold">
              {member.firstName} <span data-testid="member-last-name">{member.lastName}</span>
            </p>
            <p className="text-sm text-ink-muted">{member.username}</p>
            <p className="text-sm">{member.sectionName ?? "Aucun pupitre"}</p>
            <p className="text-sm">{rolesOf(member, labelForRole)}</p>
            <div className="mt-related">
              <MemberActions
                member={member}
                onEdit={openEdit}
                onDelete={setDeleting}
                onResetPassword={setResetting}
              />
            </div>
          </li>
        ))}
      </ul>

      {/* A TABLE FROM md UP. */}
      <div data-testid="roster-table" className="mt-block hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Identifiant</TableHead>
              <TableHead>Pupitre</TableHead>
              <TableHead>Rôles</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id} data-member={member.id}>
                <TableCell>
                  {member.firstName} <span data-testid="member-last-name">{member.lastName}</span>
                </TableCell>
                <TableCell>{member.username}</TableCell>
                <TableCell>{member.sectionName ?? "Aucun pupitre"}</TableCell>
                <TableCell>{rolesOf(member, labelForRole)}</TableCell>
                <TableCell>
                  <MemberActions
                    member={member}
                    onEdit={openEdit}
                    onDelete={setDeleting}
                    onResetPassword={setResetting}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmByTypingName
        open={deleting !== null}
        title={`Supprimer ${deleting?.firstName} ${deleting?.lastName}`}
        // NAMES THE DAMAGE (§4). It says what is actually known to go: the
        // person and their access. Attendance and registrations arrive in R1c
        // and R3, and THIS SENTENCE MUST GAIN THEM THEN — "3 réponses à venir
        // seront effacées" is the example the spec gives.
        description={`${deleting?.firstName} ${deleting?.lastName} sera retiré de la liste et perdra immédiatement son accès au site. Cette action est définitive.`}
        confirmLabel="Supprimer"
        confirmPhrase={deleting ? `${deleting.firstName} ${deleting.lastName}` : undefined}
        busy={destroy.isPending}
        error={destructive.error}
        onConfirm={confirmDelete}
        onCancel={() => {
          destructive.clear();
          setDeleting(null);
        }}
      />

      <ConfirmByTypingName
        open={resetting !== null}
        title={`Réinitialiser le mot de passe de ${resetting?.firstName} ${resetting?.lastName}`}
        // No typed phrase: this is disruptive rather than irreversible — it can
        // simply be done again — so it names the damage and asks for a press.
        description={`Un nouveau mot de passe sera généré et affiché une seule fois. ${resetting?.firstName} sera déconnecté partout et devra le changer à la prochaine connexion.`}
        confirmLabel="Réinitialiser"
        busy={issuePassword.isPending}
        error={destructive.error}
        onConfirm={confirmIssuePassword}
        onCancel={() => {
          destructive.clear();
          setResetting(null);
        }}
      />

      <GeneratedPasswordDialog
        password={issued?.password ?? null}
        memberName={issued?.name ?? ""}
        onClose={() => setIssued(null)}
      />
    </PageSection>
  );
}

/** The roles a person holds, in French, or the fact that they hold none. */
function rolesOf(member: MemberResource, labelForRole: (id: number) => string): string {
  return member.roleIds.length === 0
    ? "Aucun rôle"
    : member.roleIds.map(labelForRole).filter(Boolean).join(", ");
}

/**
 * The three per-person actions, written once and rendered in both layouts.
 *
 * Extracted because two copies of three buttons is where a fourth action ends
 * up in one layout and not the other — and the phone layout is the one that
 * gets forgotten.
 *
 * Every accessible name carries the person's name, so a screen-reader user
 * hears which row's button they are on rather than the twelfth "Supprimer" on
 * the page. Every button is a `Button`, so every one clears 44px without
 * anybody remembering to add it.
 */
function MemberActions({
  member,
  onEdit,
  onDelete,
  onResetPassword,
}: {
  member: MemberResource;
  onEdit: (member: MemberResource) => void;
  onDelete: (member: MemberResource) => void;
  onResetPassword: (member: MemberResource) => void;
}) {
  const name = `${member.firstName} ${member.lastName}`;

  return (
    <div className="flex flex-wrap gap-tight">
      <Button variant="outline" size="sm" onClick={() => onEdit(member)}>
        <span aria-hidden="true">Modifier</span>
        <span className="sr-only">Modifier {name}</span>
      </Button>
      <Button variant="outline" size="sm" onClick={() => onResetPassword(member)}>
        <span aria-hidden="true">Mot de passe</span>
        <span className="sr-only">Réinitialiser le mot de passe de {name}</span>
      </Button>
      <Button variant="destructive" size="sm" onClick={() => onDelete(member)}>
        <span aria-hidden="true">Supprimer</span>
        <span className="sr-only">Supprimer {name}</span>
      </Button>
    </div>
  );
}
