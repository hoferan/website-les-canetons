import { keepPreviousData, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { roleLabel } from "../i18n";
import { ConfirmByTypingName } from "../components/ConfirmByTypingName";
import { GeneratedPasswordDialog } from "../members/GeneratedPasswordDialog";
import { LoginState } from "../members/LoginState";
import { MemberForm, type MemberDraft } from "../members/MemberForm";

/**
 * The roster: everybody in the band.
 *
 * ONE ROSTER (ADR 0015), and since 2026_09_08_000001 everybody on it has an
 * account — the roster is the people the band tracks for events, and all of
 * them are answerable for one. People the band merely displays, such as
 * instructors or honorary members, are CONTENT and are not here at all.
 *
 * ONE LAYOUT: CARDS, AT EVERY WIDTH, in a grid that widens (#130). The screen
 * this replaces rendered a table that scrolled sideways at 390px, which is the
 * width most of this band's phones actually are; the rebuild answered that
 * with a card below `md` and a table above it, hand-maintained side by side,
 * which is the arrangement that left the guest list with no address column for
 * the whole life of that screen. There is one description of a person here
 * now, and the card labels each of its fields because the column heads that
 * used to name them went with the table.
 *
 * ROLES ARE SHOWN BY THEIR FRENCH LABEL, joined from GET /api/roles. Never the
 * key, and never the permission strings: "why does she have this?" is answered
 * with "because she is in Team Direction" (ADR 0014).
 *
 * SEARCHED AND FILTERED ON THE SERVER (#97), never over the rows this screen
 * happens to hold: the collection envelope slices on the server, so a filter
 * here would search one page of a roster that had been cut short and say
 * nothing about the rest. See App\Support\Search.
 *
 * INVARIANT REFUSALS COME FROM THE SERVER. This screen does not pre-empt
 * cannot_delete_self or cannot_remove_last_administrator with its own copy of
 * the rule — a duplicated rule drifts, and then the two disagree in front of
 * somebody trying to fix a lockout. It renders what the API says, translated.
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

  // THE PREVIOUS ANSWER STAYS ON SCREEN while the next one loads, so typing
  // narrows the list rather than blanking it into "Chargement" per keystroke.
  const roster = useMemberIndex(filtering ? filters : undefined, {
    query: { placeholderData: keepPreviousData },
  });
  // The whole roster, for the "3 sur 45" count. Unfiltered it is the SAME
  // query as the one above — same key — so it costs no second request; while
  // filtering it is the cached answer from before the first keystroke.
  const wholeRoster = useMemberIndex();
  const sections = useSectionIndex();
  const committeeFunctions = useCommitteeFunctionIndex();
  const roles = useRoleIndex();

  const queryClient = useQueryClient();
  const form = useApiFormError(t("members.saveFailed"));
  const destructive = useApiFormError(t("members.actionFailed"));

  const create = useMemberStore();
  const issuePassword = useMemberPasswordReset();

  // THE THREE CONDITIONAL WRITES, built by hand over the generated functions.
  // Each has to carry an `If-Match` that differs per call, and orval's mutation
  // hooks take their request options once when the hook is created — see
  // web/src/api/ifMatch.ts. The functions, their types and their errors are
  // still the generated ones.
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
  // AN EDIT CARRIES THE TAG OF THE READ IT WAS OPENED FROM, and the member it
  // shows is that read's — not the row from the list. The tag has to describe
  // what the person was looking at when they decided what to change, so
  // seeding the form from a possibly-stale list row and writing with a fresh
  // tag would satisfy the server while protecting nobody.
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

  // Through rowsOf, which owns the status narrowing and the collection
  // envelope's own `data` hop — see web/src/api/collection.ts. Written out here
  // it reads `roster.data.data.data`, three identically named hops of which
  // only the middle one is the envelope.
  const members = rowsOf<MemberResource>(roster.data);
  const rosterCount = totalOf(wholeRoster.data);
  const matchCount = totalOf(roster.data);
  const sectionList = rowsOf<SectionResource>(sections.data);
  const committeeFunctionList = rowsOf<CommitteeFunctionResource>(committeeFunctions.data);
  const roleList = rowsOf<RoleResource>(roles.data);

  const labelForRole = (id: number) => {
    const key = roleList.find((role) => role.id === id)?.key;
    return key === undefined ? "" : roleLabel(key);
  };

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
   * Both the edit form and the delete confirmation go through this, because
   * both end in a conditional write and both need a tag describing what the
   * administrator was shown. The roster list hands out none — one tag cannot
   * validate forty-five rows — so this read is also the moment the concurrency
   * window opens: "while this dialog was open".
   */
  async function read(id: number): Promise<{ member: MemberResource; etag: string | null } | null> {
    setReadError(null);
    setOpening(id);
    try {
      const response = await memberShow(id);
      if (response.status !== 200) {
        // Unreachable: the mutator throws on every non-2xx. The declared union
        // says otherwise and tsc is right that it does.
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
          // No tag means the write would be refused with 428, which reads as a
          // broken screen. Saying so and stopping is the honest answer.
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
          // THE TAG FROM THE WRITE JUST MADE, not the one this form opened
          // with: the PATCH above changed the member, so the tag it was
          // checked against describes a state that is now gone and the roles
          // call would answer 412. A successful write hands back the new tag
          // for exactly this.
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
      <div className="flex flex-wrap items-baseline gap-tight">
        <h1 className="font-display text-4xl">{t("members.heading")}</h1>
        {/* Straight off `meta.total`, which counts the roster on the SERVER
            rather than counting the rows that happened to arrive. Today they
            are the same number; the point is that they stay the same number
            the day this list is ever cut short. */}
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
          {t("members.add")}
        </Button>
      )}

      {readError ? (
        <p role="alert" className="mt-block text-danger">
          {readError}
        </p>
      ) : null}

      {/* THE FILTERS. The labels are visually hidden, for the reason
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
              {section.name}
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
              {roleLabel(role.key)}
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

      {/* THE CARD IS THE ONLY LAYOUT (#130). There was a table from md up as
          well, hand-maintained beside this with nothing forcing the two to
          agree — the bug class that left the guest list with no address column
          for the whole life of that screen. The grid widens rather than the
          layout changing, so a roster read on a phone and a roster read on a
          laptop are the same thing.

          EVERY FIELD IS LABELLED, which is what the column heads used to do.
          Without them "perrine", "Trompettes" and "Membre" are three
          unexplained lines under a name — and the label also puts the meaning
          next to the value in the reading order, which is the part a screen
          reader lost when the real <th> went. */}
      {/* A SEARCH THAT FOUND NOBODY SAYS SO, and offers the way back. Without
          it the screen is a heading, a count and nothing, which reads as a
          roster that failed to load. */}
      {filtering && !roster.isPending && !roster.isError && members.length === 0 ? (
        <div className="mt-block" data-testid="roster-no-match">
          <p className="text-ink-muted">{t("members.noMatch")}</p>
          <Button type="button" variant="outline" className="mt-tight" onClick={clearFilters}>
            {t("members.clearFilters")}
          </Button>
        </div>
      ) : null}

      <ul
        data-testid="roster-cards"
        className="mt-block grid gap-related sm:grid-cols-2 xl:grid-cols-3"
      >
        {members.map((member) => (
          <li
            key={member.id}
            data-member={member.id}
            className="rounded-md border border-line bg-panel p-4"
          >
            <p className="font-semibold">
              {member.firstName} <span data-testid="member-last-name">{member.lastName}</span>
            </p>
            {/* THE LABEL AND ITS COLON ARE ONE STRING. French spaces a colon
                and German does not, so "Pupitre" plus ": " composed here is
                French typography on a German card (#152, #155, #167). */}
            <p className="text-sm text-ink-muted">
              {t("members.usernameLabel", { value: member.username })}
            </p>
            <p className="text-sm">
              {t("members.sectionLabel", {
                value: member.sectionName ?? t("members.noSection"),
              })}
            </p>
            <p className="text-sm">
              {t("members.rolesLabel", { value: rolesOf(member, labelForRole) })}
            </p>
            {/* NO `Label : value` PREFIX, unlike every field above it, and
                that is not an oversight. The card labels each field because
                the real <th> went when the card became the only layout
                (#130) — the label is what puts the meaning beside the value
                in the reading order. A pill is not a field with a value, and
                "Dernière connexion le …" already carries its own label. */}
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
        // NAMES THE DAMAGE, and now that attendance exists it names that
        // too: deleting a member cascades their answers, and the committee
        // should know the planning loses them before they press this.
        //
        // WHAT GOES, NOT HOW MUCH. A count is the obvious addition —
        // "3 réponses à venir seront effacées" — and it is deliberately
        // absent. Nothing reads it before the delete, and the obvious way to
        // supply it, a field on MemberResource, is the one place it must not
        // go: App\Support\EntityTag hashes the RENDERED resource, so a member's
        // tag would then move every time they answered an event, and answering
        // would refuse a roster edit somebody had open. That is the exact
        // coupling EntityTag's own docblock says it avoids for events. The
        // event dialog made the same call for the same reason.
        //
        // Registrations are not in it: they belong to an event and a guest,
        // and no registration row names a member.
        //
        // "CETTE PERSONNE", NOT THE NAME. The name is in the title and in the
        // phrase that has to be typed, so the description loses nothing by
        // dropping it — and interpolating it here meant a fixed masculine
        // participle agreeing over whoever it named (#91). Agreeing with
        // "personne" is right for everybody, and costs the roster no gender
        // field the band has no reason to hold.
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
        // No typed phrase: this is disruptive rather than irreversible — it can
        // simply be done again — so it names the damage and asks for a press.
        //
        // The title names who; this sentence says "cette personne" rather than
        // interpolating the first name, for the agreement reason given on the
        // delete dialog above (#91).
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

/** The roles a person holds, in French, or the fact that they hold none. */
function rolesOf(member: MemberResource, labelForRole: (id: number) => string): string {
  return member.roleIds.length === 0
    ? t("members.noRoles")
    : member.roleIds.map(labelForRole).filter(Boolean).join(", ");
}

/**
 * The three per-person actions, laid out by `RowActions`: `Modifier` inline,
 * `Mot de passe` and `Supprimer` behind the "..." (#118).
 *
 * Extracted while the roster still had two layouts, because two copies of
 * three actions is where a fourth ends up in one of them and not the other —
 * and the phone layout was the one that got forgotten. #130 removed the
 * second layout; this stays a component because three actions and their
 * accessible names are worth reading in one place.
 *
 * Every accessible name carries the person's name, so a screen-reader user
 * hears which row's action they are on rather than the twelfth "Supprimer" on
 * the page. The 44px floor is `RowActions`'s concern now, not this
 * component's — a plain `Button` inline, `DropdownMenuItem`'s own min-height
 * in the menu.
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
      // THE SAME KEY AS THE DIALOG THIS OPENS, so the item's accessible name
      // and the dialog's title cannot come to disagree.
      ariaLabel: t("members.resetTitle", { name }),
      onSelect: () => onResetPassword(member),
    },
    {
      key: "delete",
      label: t("common.delete"),
      ariaLabel: t("members.deleteTitle", { name }),
      disabled: busy,
      // NOT variant="destructive" any more. A filled red block was the most
      // prominent thing on the card, above the person's own name, for an
      // action taken a handful of times a season — and the planning rendered
      // the same action as an outline button, so one action had two answers
      // (#118). ConfirmByTypingName is the actual guard.
      destructive: true,
      onSelect: () => void onDelete(member),
    },
  ];

  return <RowActions actions={actions} inlineKey="edit" rowName={name} />;
}
