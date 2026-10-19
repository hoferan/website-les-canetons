import { keepPreviousData, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import {
  getMemberIndexQueryKey,
  memberDestroy,
  memberRoleReplace,
  memberShow,
  memberUpdate,
  useCommitteeFunctionIndex,
  useMemberIndex,
  useMemberPasswordReset,
  useMemberStore,
  useRoleIndex,
  useSectionIndex,
} from "../api/generated/endpoints";
import type {
  CommitteeFunctionResource,
  MemberResource,
  RoleResource,
  SectionResource,
  UpdateMemberRequest,
} from "../api/generated/model";
import { rowsOf, totalOf } from "../api/collection";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { PageSection } from "../components/PageSection";
import { SearchField, useDebouncedValue } from "../components/SearchField";
import { RowActions, type RowAction } from "../components/RowActions";
import { t } from "../i18n";
import { registerName, roleName } from "../i18n";
import { ConfirmByTypingName } from "../components/ConfirmByTypingName";
import { GeneratedPasswordDialog } from "../members/GeneratedPasswordDialog";
import { LoginState } from "../members/LoginState";
import { MemberForm, type MemberDraft } from "../members/MemberForm";
import { OUTLINED_CARD } from "../carnival/raised";

/**
 * The roster: everybody in the band.
 *
 * One roster (ADR 0015), and everybody on it has an account: the roster is
 * the people the band tracks for events, and which of them answer one is
 * what their roles grant. People the band merely displays, such as
 * instructors or honorary members, are content and are not here.
 *
 * One layout: cards at every width, in a grid that widens. Each card labels
 * its fields, since there are no column heads to name them.
 *
 * Roles are shown by name, joined from GET /api/v1/roles. Never the key or
 * the permission strings: "why does she have this?" is answered with
 * "because she is in Team Direction" (ADR 0014).
 *
 * Searched and filtered on the server (#97): the collection envelope slices
 * there, so a filter over the rows held here would miss the rest. See
 * App\Support\Search.
 *
 * Invariant refusals come from the server. This screen does not pre-empt
 * cannot_delete_self or cannot_remove_last_administrator with its own copy of
 * the rule, which would drift; it renders what the API says, translated.
 */
export function Members() {
  // What is typed, and what has been asked for. The box follows every
  // keystroke; the request follows the box once it has been still for 250ms.
  const [typed, setTyped] = useState("");
  const q = useDebouncedValue(typed.trim());
  // "" is "all"; "none" is the members in no register; anything else an id.
  const [sectionFilter, setSectionFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const filters = {
    ...(q === "" ? {} : { q }),
    ...(sectionFilter === "" ? {} : { section: sectionFilter }),
    ...(roleFilter === "" ? {} : { role: Number(roleFilter) }),
  };
  const filtering = Object.keys(filters).length > 0;

  // The previous answer stays on screen while the next one loads, so typing
  // narrows the list rather than blanking it into "Chargement" per keystroke.
  const roster = useMemberIndex(filtering ? filters : undefined, {
    query: { placeholderData: keepPreviousData },
  });
  // The whole roster, for the "3 sur 45" count. Unfiltered it has the same
  // key as the query above, so it costs no second request; while filtering it
  // is the cached answer from before the first keystroke.
  const wholeRoster = useMemberIndex();
  const sections = useSectionIndex();
  const committeeFunctions = useCommitteeFunctionIndex();
  const roles = useRoleIndex();

  const queryClient = useQueryClient();
  const form = useApiFormError(t("members.saveFailed"));
  const destructive = useApiFormError(t("members.actionFailed"));

  const create = useMemberStore();
  const issuePassword = useMemberPasswordReset();

  // The three conditional writes, built over the generated functions: each
  // carries an `If-Match` that differs per call, and orval's mutation hooks
  // fix their request options when created. See web/src/api/ifMatch.ts.
  const update = useMutation({
    mutationFn: ({
      member,
      data,
      etag,
    }: {
      member: number;
      data: UpdateMemberRequest;
      etag: string;
    }) => memberUpdate(member, data, ifMatch(etag)),
  });

  const replaceRoles = useMutation({
    mutationFn: ({ member, roleIds, etag }: { member: number; roleIds: number[]; etag: string }) =>
      memberRoleReplace(member, { roleIds }, ifMatch(etag)),
  });

  const destroy = useMutation({
    mutationFn: ({ member, etag }: { member: number; etag: string }) =>
      memberDestroy(member, ifMatch(etag)),
  });

  // `editing` distinguishes three states: closed, creating (null) and editing
  // (a member). A separate boolean plus a member would allow a fourth,
  // meaningless one.
  //
  // An edit carries the tag of the read it was opened from, and shows that
  // read's member, not the list row. The tag has to describe what the person
  // was looking at when they decided what to change.
  const [editing, setEditing] = useState<{
    member: MemberResource | null;
    etag: string | null;
  } | null>(null);
  const [deleting, setDeleting] = useState<{ member: MemberResource; etag: string | null } | null>(
    null,
  );
  // Which row is being read, so its buttons can say so rather than looking
  // dead while the request is in flight.
  const [opening, setOpening] = useState<number | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<MemberResource | null>(null);
  const [issued, setIssued] = useState<{ name: string; password: string } | null>(null);

  // rowsOf owns the status narrowing and the envelope's `data` hop; written
  // out it is `roster.data.data.data`. See web/src/api/collection.ts.
  const members = rowsOf<MemberResource>(roster.data);
  const rosterCount = totalOf(wholeRoster.data);
  const matchCount = totalOf(roster.data);
  const sectionList = rowsOf<SectionResource>(sections.data);
  const committeeFunctionList = rowsOf<CommitteeFunctionResource>(committeeFunctions.data);
  const roleList = rowsOf<RoleResource>(roles.data);

  // From the register list rather than the card's own sectionName, which
  // is French only: a German name on the member would be hashed into their
  // entity tag, so renaming a register would refuse every open roster edit.
  const labelForSection = (member: MemberResource) => {
    const section = sectionList.find((candidate) => candidate.id === member.sectionId);
    return section === undefined ? member.sectionName : registerName(section.name, section.nameDe);
  };

  const labelForRole = (id: number) => {
    const role = roleList.find((candidate) => candidate.id === id);
    return role === undefined ? "" : roleName(role);
  };
  // From what the roles grant, never from a role's key: renaming the role
  // that answers must not silence the warning below.
  const answersEvents = (member: MemberResource) =>
    member.roleIds.some((id) =>
      roleList.find((role) => role.id === id)?.permissions.includes("attendance.respond"),
    );

  // No params: the key is a prefix of every filtered roster's as well, so a
  // write refreshes whichever search is on screen and the count beside it.
  const refresh = () => queryClient.invalidateQueries({ queryKey: getMemberIndexQueryKey() });

  function clearFilters() {
    setTyped("");
    setSectionFilter("");
    setRoleFilter("");
  }

  function openCreate() {
    form.clear();
    setEditing({ member: null, etag: null });
  }

  /**
   * Reads the one person, and keeps the tag that read handed out.
   *
   * The edit form and the delete confirmation both end in a conditional write
   * and need a tag describing what the administrator was shown. The list
   * hands out none (one tag cannot validate every row), so this read opens
   * the concurrency window: "while this dialog was open".
   */
  async function read(id: number): Promise<{ member: MemberResource; etag: string | null } | null> {
    setReadError(null);
    setOpening(id);
    try {
      const response = await memberShow(id);
      if (response.status !== 200) {
        // Unreachable: the mutator throws on every non-2xx, but the declared
        // union still includes them.
        setReadError(t("members.loadFailed"));
        return null;
      }
      return { member: response.data, etag: entityTagOf(response) };
    } catch {
      setReadError(t("members.loadFailedReload"));
      return null;
    } finally {
      setOpening(null);
    }
  }

  async function openEdit(row: MemberResource) {
    form.clear();
    const read_ = await read(row.id);
    if (read_) {
      setEditing(read_);
    }
  }

  async function openDelete(row: MemberResource) {
    destructive.clear();
    const read_ = await read(row.id);
    if (read_) {
      setDeleting(read_);
    }
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
      committeeFunctionId: draft.committeeFunctionId,
      instructorOfSectionId: draft.instructorOfSectionId,
      publicVisible: draft.publicVisible,
    };

    try {
      if (editing?.member) {
        const member = editing.member;
        if (editing.etag === null) {
          // Without a tag the write would be refused with 428.
          setReadError(t("members.loadFailedReload"));
          return;
        }

        const saved = await update.mutateAsync({ member: member.id, data, etag: editing.etag });

        // Roles travel on their own endpoint, and only when they changed: it
        // ends the member's sessions and writes an audit entry, so sending it
        // on every name correction would log people out for nothing.
        const before = [...member.roleIds].sort((a, b) => a - b);
        const after = [...draft.roleIds].sort((a, b) => a - b);
        if (before.join() !== after.join()) {
          // The tag from the write just made, not the one this form opened
          // with: the PATCH above changed the member, so the old tag would
          // answer 412. A successful write hands back the new tag.
          const chained = entityTagOf(saved);
          if (chained === null) {
            setReadError(t("members.incompleteSave"));
            return;
          }
          await replaceRoles.mutateAsync({
            member: member.id,
            roleIds: draft.roleIds,
            etag: chained,
          });
        }
      } else {
        const result = await create.mutateAsync({ data });
        // One `.data` (a mutation's return, not a query's envelope), narrowed
        // on status because the declared union includes the error responses.
        if (result.status === 201) {
          setIssued({
            name: `${draft.firstName} ${draft.lastName}`,
            password: result.data.generatedPassword,
          });
        }
      }
    } catch (thrown) {
      form.setFromThrown(thrown);
      // The panel stays open: a rejected username is corrected where it was
      // typed, and closing would throw away everything else too.
      return;
    }

    setEditing(null);
    await refresh();
  }

  async function confirmDelete() {
    if (!deleting || deleting.etag === null) {
      return;
    }
    destructive.clear();
    try {
      await destroy.mutateAsync({ member: deleting.member.id, etag: deleting.etag });
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
        // Unreachable: the mutator throws on every non-2xx, but the declared
        // union includes them, and inventing a password would be worse.
        destructive.setFromThrown(result);
        return;
      }
      password = result.data.generatedPassword;
    } catch (thrown) {
      destructive.setFromThrown(thrown);
      return;
    }
    // Capture the name before closing the confirmation, which clears the
    // state it is read from.
    const name = `${resetting.firstName} ${resetting.lastName}`;
    setResetting(null);
    setIssued({ name, password });
    await refresh();
  }

  return (
    <PageSection>
      <div className="flex flex-wrap items-baseline gap-tight">
        <h1 className="font-display text-4xl">{t("members.heading")}</h1>
        {/* Straight off `meta.total`, which counts the roster on the server,
            so it stays right if the list is ever cut short. */}
        {rosterCount === null ? null : (
          <span className="text-ink-muted" data-testid="roster-count">
            {filtering && matchCount !== null
              ? t("members.filteredCount", { matches: matchCount, count: rosterCount })
              : t("members.count", { count: rosterCount })}
          </span>
        )}
      </div>

      {editing ? (
        <MemberForm
          // Remounts when the subject changes, so the draft is rebuilt from the
          // new person rather than keeping the previous one's values.
          key={editing.member?.id ?? "new"}
          member={editing.member}
          sections={sectionList}
          committeeFunctions={committeeFunctionList}
          roles={roleList}
          busy={create.isPending || update.isPending || replaceRoles.isPending}
          error={form.error}
          problemFor={form.messageFor}
          onSubmit={submitForm}
          onCancel={closeForm}
        />
      ) : (
        <Button className="mt-block" onClick={openCreate}>
          <Plus aria-hidden="true" />
          {t("members.add")}
        </Button>
      )}

      {readError ? (
        <p role="alert" className="mt-block text-danger">
          {readError}
        </p>
      ) : null}

      {/* The filters. The labels are visually hidden, for the reason
          SearchField gives; each select's "all" option names what it filters,
          so it reads as "Tous les pupitres" until somebody picks one. */}
      <div className="mt-block flex flex-wrap gap-tight" data-testid="roster-filters">
        <SearchField
          id="roster-search"
          label={t("members.searchLabel")}
          value={typed}
          onChange={setTyped}
          className="w-full sm:w-72"
        />
        <label htmlFor="roster-section" className="sr-only">
          {t("members.sectionFilter")}
        </label>
        <select
          id="roster-section"
          className="focus-ring min-h-touch rounded-md border border-line bg-panel px-3 text-ink"
          value={sectionFilter}
          onChange={(event) => setSectionFilter(event.target.value)}
        >
          <option value="">{t("members.allSections")}</option>
          {sectionList.map((section) => (
            <option key={section.id} value={String(section.id)}>
              {registerName(section.name, section.nameDe)}
            </option>
          ))}
          <option value="none">{t("members.noSection")}</option>
        </select>
        <label htmlFor="roster-role" className="sr-only">
          {t("members.roleFilter")}
        </label>
        <select
          id="roster-role"
          className="focus-ring min-h-touch rounded-md border border-line bg-panel px-3 text-ink"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
        >
          <option value="">{t("members.allRoles")}</option>
          {roleList.map((role) => (
            <option key={role.id} value={String(role.id)}>
              {roleName(role)}
            </option>
          ))}
        </select>
      </div>

      {roster.isPending ? <p className="mt-block">{t("common.loading")}</p> : null}
      {roster.isError ? (
        <p role="alert" className="mt-block text-danger">
          {t("members.rosterLoadFailed")}
        </p>
      ) : null}

      {/* A search that found nobody says so and offers the way back;
          otherwise the screen reads as a roster that failed to load. */}
      {filtering && !roster.isPending && !roster.isError && members.length === 0 ? (
        <div className="mt-block" data-testid="roster-no-match">
          <p className="text-ink-muted">{t("members.noMatch")}</p>
          <Button type="button" variant="raised-light" className="mt-tight" onClick={clearFilters}>
            {t("members.clearFilters")}
          </Button>
        </div>
      ) : null}

      <ul
        data-testid="roster-cards"
        className="mt-block grid gap-related sm:grid-cols-2 xl:grid-cols-3"
      >
        {members.map((member) => (
          <li key={member.id} data-member={member.id} className={`${OUTLINED_CARD} p-4`}>
            <p className="font-semibold">
              {member.firstName} <span data-testid="member-last-name">{member.lastName}</span>
            </p>
            {/* Every field is labelled, so "perrine", "Trompettes" and
                "Membre" are not unexplained lines, and a screen reader hears
                the meaning beside the value.

                The label and its colon are one string: French spaces a colon
                and German does not. */}
            <p className="text-sm text-ink-muted">
              {t("members.usernameLabel", { value: member.username })}
            </p>
            <p className="text-sm">
              {t("members.sectionLabel", {
                value: labelForSection(member) ?? t("members.noSection"),
              })}
            </p>
            <p className="text-sm">
              {t("members.rolesLabel", { value: rolesOf(member, labelForRole) })}
            </p>
            {/* A register without a role that answers is almost always a
                role somebody forgot to tick: a register grants nothing
                (#189), so this person is never asked about an event. The same
                pink pill as the login state below. Waits for the roles, or
                every card would flash it. */}
            {member.sectionId !== null && roleList.length > 0 && !answersEvents(member) ? (
              // A flex child, not `inline-block`: that class also sets the
              // width to the `block` spacing token, 32px (docs/traps.md).
              <div className="mt-tight flex">
                <span
                  aria-label={t("members.notAnsweringName")}
                  className="rounded-full bg-pink px-2 py-0.5 text-xs font-semibold text-ink"
                >
                  {t("members.notAnswering")}
                </span>
              </div>
            ) : null}
            {/* No `Label : value` prefix: a pill is not a field with a value,
                and "Dernière connexion le …" carries its own label. */}
            <LoginState member={member} />
            <div className="mt-related">
              <MemberActions
                member={member}
                busy={opening === member.id}
                onEdit={openEdit}
                onDelete={openDelete}
                onResetPassword={setResetting}
              />
            </div>
          </li>
        ))}
      </ul>

      <ConfirmByTypingName
        open={deleting !== null}
        title={t("members.deleteTitle", {
          name: `${deleting?.member.firstName} ${deleting?.member.lastName}`,
        })}
        // Names the damage, including the attendance answers the delete
        // cascades, so the committee knows the planning loses them.
        //
        // What goes, not how much. A count would need a field on
        // MemberResource, and App\Support\EntityTag hashes the rendered
        // resource: the member's tag would move with every answer, and
        // answering would refuse a roster edit somebody had open. The event
        // dialog makes the same call.
        //
        // Registrations are not in it: no registration row names a member.
        //
        // "Cette personne", not the name, which is in the title and the typed
        // phrase anyway: a name would need a participle agreeing with its
        // gender (#91), and "personne" agrees for everybody.
        description={t("members.deleteDescription")}
        confirmLabel={t("common.delete")}
        confirmPhrase={
          deleting ? `${deleting.member.firstName} ${deleting.member.lastName}` : undefined
        }
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
        title={t("members.resetTitle", {
          name: `${resetting?.firstName} ${resetting?.lastName}`,
        })}
        // No typed phrase: this is disruptive rather than irreversible, so it
        // names the damage and asks for a press. "Cette personne" for the
        // reason given on the delete dialog above.
        description={t("members.resetDescription")}
        confirmLabel={t("members.reset")}
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

/** The roles a person holds, by name, or the fact that they hold none. */
function rolesOf(member: MemberResource, labelForRole: (id: number) => string): string {
  return member.roleIds.length === 0
    ? t("members.noRoles")
    : member.roleIds.map(labelForRole).filter(Boolean).join(", ");
}

/**
 * The three per-person actions, laid out by `RowActions`: `Modifier` inline,
 * `Mot de passe` and `Supprimer` behind the "..." (#118).
 *
 * Every accessible name carries the person's name, so a screen-reader user
 * hears which row's action they are on rather than the twelfth "Supprimer".
 * The 44px floor is `RowActions`'s concern.
 */
function MemberActions({
  member,
  busy,
  onEdit,
  onDelete,
  onResetPassword,
}: {
  member: MemberResource;
  busy: boolean;
  onEdit: (member: MemberResource) => void;
  onDelete: (member: MemberResource) => void;
  onResetPassword: (member: MemberResource) => void;
}) {
  const name = `${member.firstName} ${member.lastName}`;

  const actions: RowAction[] = [
    {
      key: "edit",
      label: t("common.edit"),
      ariaLabel: t("members.editPerson", { name }),
      disabled: busy,
      onSelect: () => void onEdit(member),
    },
    {
      key: "password",
      label: t("members.password"),
      // The same key as the dialog this opens, so the item's accessible name
      // and the dialog's title cannot disagree.
      ariaLabel: t("members.resetTitle", { name }),
      onSelect: () => onResetPassword(member),
    },
    {
      key: "delete",
      label: t("common.delete"),
      ariaLabel: t("members.deleteTitle", { name }),
      disabled: busy,
      // Not raised-danger: a filled red block would outweigh the person's
      // name for a rare action, and the planning shows the same action the
      // same way (#118). ConfirmByTypingName is the actual guard.
      destructive: true,
      onSelect: () => void onDelete(member),
    },
  ];

  return <RowActions actions={actions} inlineKey="edit" rowName={name} />;
}
