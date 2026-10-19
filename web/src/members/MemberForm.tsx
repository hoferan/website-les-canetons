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
import { registerName, roleDescription, roleName, t } from "../i18n";
import { OUTLINED_CARD } from "../carnival/raised";

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

/**
 * The role list with a role granting attendance.respond added, unless one in
 * it already does.
 *
 * Found by what the role grants, never by its key (ADR 0014), because roles
 * are editable data and the one that answers events can be renamed. When
 * several grant it, the first in the API's order is ticked.
 */
function withAnsweringRole(roleIds: number[], roles: RoleResource[]): number[] {
  const answering = roles.filter((role) => role.permissions.includes("attendance.respond"));

  if (answering.some((role) => roleIds.includes(role.id))) {
    return roleIds;
  }

  const first = answering[0];
  return first ? [...roleIds, first.id] : roleIds;
}

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
 * There is no password field: issuing a credential is its own action, the
 * same as resetting one (ADR 0016). The form says so instead of showing an
 * empty password box that would imply otherwise.
 *
 * The username is required because every member has an account: the roster
 * is the people the band tracks for events. People the band merely displays
 * are content, not members.
 *
 * Roles are inert while creating, because that is the API's shape: POST
 * /members grants only the baseline role and ignores any roleIds. Granting
 * anything else is one operation (PUT /members/{id}/roles) with its own
 * lockout invariants and audit entry, and accepting roles at creation would
 * make the unguarded path easier than the guarded one.
 *
 * The `disabled` attribute on those checkboxes is the one legitimate use in
 * this app. The rule against it exists because disabling a focused submit
 * button throws focus to <body> mid-request; a checkbox inert for the whole
 * life of the form is different, and `aria-disabled` on an input does not
 * stop it being toggled. The copy beneath explains why it is inert.
 *
 * `publicVisible` is a hand-written checkbox rather than a FormField, for the
 * reason FormField's comment gives: the value is a boolean and the label
 * follows the control. It carries min-h-touch itself, being neither a Button
 * nor an Input.
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
      className={`${OUTLINED_CARD} mt-block flex flex-col gap-related p-4`}
      onSubmit={(event) => {
        event.preventDefault();
        // The button is aria-disabled, not disabled, so this early return is
        // what prevents a double submit.
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
          onChange={(event) => {
            const sectionId = event.target.value === "" ? null : Number(event.target.value);
            // Choosing a register pre-ticks a role that answers events,
            // because somebody given one almost always plays. The register
            // grants nothing; the tick is what the save turns into a grant,
            // and it can be unticked first. Not on the create form, whose
            // roles are inert until the person exists.
            setDraft((current) => ({
              ...current,
              sectionId,
              roleIds:
                creating || sectionId === null
                  ? current.roleIds
                  : withAnsweringRole(current.roleIds, roles),
            }));
          }}
        >
          {/* Empty is a real answer: somebody who organises and does not play
              belongs to no register. Whether they answer for events is their
              roles' business, not this field's. */}
          <option value="">{t("members.noSection")}</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {registerName(section.name, section.nameDe)}
            </option>
          ))}
        </select>
      </div>

      {/* A select over reference data, like the registers: the seats are
          ranked for /committee, and a typo cannot reach a public page. */}
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

      {/* A second register field, not a duplicate: `sectionId` is where
          somebody plays, and this is the register they teach. An instructor
          often teaches one and plays in another, and the public band page
          lists them under both. */}
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
              {registerName(section.name, section.nameDe)}
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
            The hint describes the checkbox and is not part of its label.
            Wrapped in one <label>, the whole paragraph would be read out as
            the name on every focus, and nothing could query by it.
          */
          <div key={role.id} className="flex min-h-touch items-start gap-2 py-1">
            <input
              id={`role-${role.id}`}
              type="checkbox"
              className="mt-1 size-5"
              // The baseline is fixed: the API refuses any role list without
              // it, so the box stays ticked rather than offering a save that
              // can only fail.
              disabled={creating || role.isBaseline}
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
              <label htmlFor={`role-${role.id}`}>{roleName(role)}</label>
              <span id={`role-${role.id}-hint`} className="block text-sm text-ink-muted">
                {roleDescription(role)}
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
        <Button type="button" variant="raised-light" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
