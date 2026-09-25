import { useState } from "react";

import { Button } from "@/components/ui/button";

import type {
  CommitteeFunctionResource,
  MemberResource,
  RoleResource,
  SectionResource,
} from "../api/generated/model";
import { FormError, FormField, RequiredLegend, formIsValid } from "../components/FormField";
import type { TranslatedError } from "../i18n";
import { roleHint, roleLabel, t } from "../i18n";

export type MemberDraft = {
  firstName: string;
  lastName: string;
  username: string;
  sectionId: number | null;
  committeeFunctionId: number | null;
  instructorOfSectionId: number | null;
  publicVisible: boolean;
  roleIds: number[];
};

/** An existing person as an editable draft, or an empty one for a new person. */
export function draftFrom(member: MemberResource | null): MemberDraft {
  return {
    firstName: member?.firstName ?? "",
    lastName: member?.lastName ?? "",
    username: member?.username ?? "",
    sectionId: member?.sectionId ?? null,
    committeeFunctionId: member?.committeeFunctionId ?? null,
    instructorOfSectionId: member?.instructorOfSectionId ?? null,
    publicVisible: member?.publicVisible ?? false,
    roleIds: member?.roleIds ?? [],
  };
}

/**
 * Create or edit one person.
 *
 * A PERSON, NOT A PROFILE FORM WITH A PASSWORD BOX. There is no password field
 * at all: issuing a credential is its own action (§4.4), and it is the same
 * action as resetting one. The form says so rather than leaving an empty
 * password box that would imply otherwise.
 *
 * The username is REQUIRED, because every member has an account
 * (2026_09_08_000001) — the roster is the people the band tracks for events,
 * and all of them are answerable. People the band merely displays are content,
 * not members.
 *
 * ROLES ARE INERT WHILE CREATING, and that is the API's shape rather than a
 * simplification: POST /api/members grants no roles, because granting a
 * permission is exactly one operation (PUT /members/{id}/roles) with its own
 * lockout invariants and its own audit entry. Accepting roles at creation would
 * make the unguarded path strictly easier than the guarded one.
 *
 * THE `disabled` ATTRIBUTE ON THOSE CHECKBOXES IS THE ONE LEGITIMATE USE in
 * this app. The rule against it exists because disabling a FOCUSED SUBMIT
 * BUTTON throws focus to <body> mid-request; a checkbox that is inert for the
 * whole lifetime of the form is a different thing, and `aria-disabled` on an
 * input does not actually stop it being toggled. The explanatory copy beneath
 * it stays — an inert control with no explanation is worse than either.
 *
 * `publicVisible` is a checkbox written out by hand rather than through
 * FormField: FormField's own comment explains why it handles no checkboxes —
 * the value is a boolean and the label belongs after the control. It carries
 * min-h-touch explicitly, because it is neither a Button nor an Input and so
 * inherits nothing.
 */
export function MemberForm({
  member,
  sections,
  committeeFunctions,
  roles,
  busy,
  error,
  problemFor,
  onSubmit,
  onCancel,
}: {
  member: MemberResource | null;
  sections: SectionResource[];
  committeeFunctions: CommitteeFunctionResource[];
  roles: RoleResource[];
  busy: boolean;
  error: TranslatedError | null;
  problemFor: (field: string) => string | undefined;
  onSubmit: (draft: MemberDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<MemberDraft>(() => draftFrom(member));
  const creating = member === null;

  function set<K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <form
      noValidate
      className="mt-block flex flex-col gap-related rounded-md border border-line bg-panel p-4"
      onSubmit={(event) => {
        event.preventDefault();
        // aria-disabled, not disabled — so this early return is what actually
        // prevents a double submit.
        if (busy || !formIsValid(event.currentTarget)) {
          return;
        }
        onSubmit(draft);
      }}
    >
      <h2 className="font-display text-2xl">
        {creating
          ? t("members.add")
          : t("members.editPerson", { name: `${member.firstName} ${member.lastName}` })}
      </h2>

      <RequiredLegend />

      <FormField
        id="firstName"
        label={t("memberForm.firstName")}
        value={draft.firstName}
        onChange={(value) => set("firstName", value)}
        problem={problemFor("firstName")}
        required
      />

      <FormField
        id="lastName"
        label={t("memberForm.lastName")}
        value={draft.lastName}
        onChange={(value) => set("lastName", value)}
        problem={problemFor("lastName")}
        required
      />

      <FormField
        id="username"
        label={t("memberForm.username")}
        value={draft.username}
        onChange={(value) => set("username", value)}
        problem={problemFor("username")}
        required
        autoComplete="off"
      />
      <p className="text-sm text-ink-muted">
        {creating ? t("memberForm.passwordHintNew") : t("memberForm.passwordHintEdit")}
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor="sectionId">{t("memberForm.section")}</label>
        <select
          id="sectionId"
          className="focus-ring min-h-touch rounded-md border border-line bg-panel px-3 text-ink"
          value={draft.sectionId ?? ""}
          onChange={(event) =>
            set("sectionId", event.target.value === "" ? null : Number(event.target.value))
          }
        >
          {/* Empty is a real answer: somebody who organises and does not play
              belongs to no register and never appears in an attendance list. */}
          <option value="">{t("members.noSection")}</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </div>

      {/* A SELECT SINCE 2026-09-14, and it was free text before that. Three
          things went wrong with typing it: a typo reached a page the band hands
          out, nothing beside the text ranked the seats so /committee could only
          sort alphabetically, and a typed name is content no translation layer
          can ever reach. The list is reference data on the same rung as the
          registers, which is why this renders exactly like the two selects
          around it. */}
      <div className="flex flex-col gap-1">
        <label htmlFor="committeeFunctionId">{t("memberForm.committeeFunction")}</label>
        <select
          id="committeeFunctionId"
          className="focus-ring min-h-touch rounded-md border border-line bg-panel px-3 text-ink"
          value={draft.committeeFunctionId ?? ""}
          onChange={(event) =>
            set(
              "committeeFunctionId",
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        >
          {/* Empty is the ordinary answer: most of the band sit on no
              committee, and holding no seat is what keeps them off the public
              committee page. */}
          <option value="">{t("memberForm.noFunction")}</option>
          {committeeFunctions.map((seat) => (
            <option key={seat.id} value={seat.id}>
              {seat.name}
            </option>
          ))}
        </select>
      </div>

      {/* A SECOND REGISTER FIELD, and it is not a duplicate of the one above.
          `sectionId` is where somebody PLAYS and is what makes them answerable
          for an event; this is the register they TEACH. An instructor commonly
          teaches one and plays in another, and the public band page lists them
          under both — correctly, because both are true.

          IT HAD NO CONTROL UNTIL 2026-09-14. The column shipped in R1a, the
          draft carried it, and Members.tsx sent it on every write — but nothing
          ever rendered an input, so the value could only ever be whatever it
          already was, which for every member was null. Found by André during
          R2's manual pass, on the first release where anything READ it. */}
      <div className="flex flex-col gap-1">
        <label htmlFor="instructorOfSectionId">{t("memberForm.instructorOf")}</label>
        <select
          id="instructorOfSectionId"
          className="focus-ring min-h-touch rounded-md border border-line bg-panel px-3 text-ink"
          value={draft.instructorOfSectionId ?? ""}
          onChange={(event) =>
            set(
              "instructorOfSectionId",
              event.target.value === "" ? null : Number(event.target.value),
            )
          }
        >
          {/* Empty is the ordinary answer: most of the band teach nothing. */}
          <option value="">{t("memberForm.notInstructor")}</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </div>

      <label className="flex min-h-touch items-center gap-2">
        <input
          type="checkbox"
          className="size-5"
          checked={draft.publicVisible}
          onChange={(event) => set("publicVisible", event.target.checked)}
        />
        {t("memberForm.publicVisible")}
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend>{t("memberForm.rolesLegend")}</legend>
        {roles.map((role) => (
          /*
            The hint is DESCRIBED BY, not part of the label. Wrapping both in
            one <label> makes the control's accessible name "Team Direction
            Organise les événements…" — the whole paragraph read out on every
            focus, and a name nothing can query by.
          */
          <div key={role.id} className="flex min-h-touch items-start gap-2 py-1">
            <input
              id={`role-${role.id}`}
              type="checkbox"
              className="mt-1 size-5"
              disabled={creating}
              aria-describedby={`role-${role.id}-hint`}
              checked={draft.roleIds.includes(role.id)}
              onChange={(event) =>
                set(
                  "roleIds",
                  event.target.checked
                    ? [...draft.roleIds, role.id]
                    : draft.roleIds.filter((id) => id !== role.id),
                )
              }
            />
            <div>
              <label htmlFor={`role-${role.id}`}>{roleLabel(role.key)}</label>
              <span id={`role-${role.id}-hint`} className="block text-sm text-ink-muted">
                {roleHint(role.key)}
              </span>
            </div>
          </div>
        ))}
        {creating ? (
          <p className="text-sm text-ink-muted">{t("memberForm.rolesAfterSave")}</p>
        ) : null}
      </fieldset>

      <FormError error={error} />

      <div className="flex flex-wrap gap-related">
        <Button type="submit" aria-disabled={busy}>
          {busy ? t("memberForm.saving") : t("common.save")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
