import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { MemberResource, RoleResource, SectionResource } from "../api/generated/model";
import { FormError, FormField } from "../components/FormField";
import type { TranslatedError } from "../i18n";
import { roleHint, roleLabel } from "../i18n";

export type MemberDraft = {
  firstName: string;
  lastName: string;
  username: string;
  sectionId: number | null;
  committeeTitle: string;
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
    committeeTitle: member?.committeeTitle ?? "",
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
  roles,
  busy,
  error,
  problemFor,
  onSubmit,
  onCancel,
}: {
  member: MemberResource | null;
  sections: SectionResource[];
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
      className="mt-block flex flex-col gap-related rounded-md border border-line bg-panel p-4"
      onSubmit={(event) => {
        event.preventDefault();
        // aria-disabled, not disabled — so this early return is what actually
        // prevents a double submit.
        if (busy) {
          return;
        }
        onSubmit(draft);
      }}
    >
      <h2 className="font-display text-2xl">
        {creating ? "Ajouter une personne" : `Modifier ${member.firstName} ${member.lastName}`}
      </h2>

      <FormField
        id="firstName"
        label="Prénom"
        value={draft.firstName}
        onChange={(value) => set("firstName", value)}
        problem={problemFor("firstName")}
        required
      />

      <FormField
        id="lastName"
        label="Nom"
        value={draft.lastName}
        onChange={(value) => set("lastName", value)}
        problem={problemFor("lastName")}
        required
      />

      <FormField
        id="username"
        label="Identifiant"
        value={draft.username}
        onChange={(value) => set("username", value)}
        problem={problemFor("username")}
        required
        autoComplete="off"
      />
      <p className="text-sm text-ink-muted">
        {creating
          ? "Un mot de passe sera généré et affiché une seule fois après l’enregistrement."
          : "Le mot de passe se réinitialise depuis la liste, jamais depuis ce formulaire."}
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor="sectionId">Pupitre</label>
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
          <option value="">Aucun pupitre</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.name}
            </option>
          ))}
        </select>
      </div>

      <FormField
        id="committeeTitle"
        label="Fonction au comité"
        value={draft.committeeTitle}
        onChange={(value) => set("committeeTitle", value)}
        problem={problemFor("committeeTitle")}
      />

      <label className="flex min-h-touch items-center gap-2">
        <input
          type="checkbox"
          className="size-5"
          checked={draft.publicVisible}
          onChange={(event) => set("publicVisible", event.target.checked)}
        />
        Visible sur le site public
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend>Rôles</legend>
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
          <p className="text-sm text-ink-muted">
            Les rôles s’attribuent après avoir enregistré la personne&nbsp;: donner des droits est
            une action à part, qui coupe les sessions en cours et laisse une trace.
          </p>
        ) : null}
      </fieldset>

      <FormError error={error} />

      <div className="flex flex-wrap gap-related">
        <Button type="submit" aria-disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
