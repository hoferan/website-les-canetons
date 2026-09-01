import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { solveChallenge } from "../api/altcha";
import { altcha, useSignupStore } from "../api/generated/endpoints";
import type { Altcha200 } from "../api/generated/model";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField } from "../components/FormField";
import { useSession } from "../session/SessionProvider";
import { GuestMenus } from "./GuestMenus";
import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * The public reservation form — the ONLY place in this system where an
 * anonymous member of the public writes to the database. Everything unusual
 * about this page follows from that.
 *
 * Field names are snake_case, unlike the contact form's camelCase, because
 * App\Http\Requests\SignupRequest validates them that way and ApiError echoes
 * the name straight into fields[].field, where translateApiError() looks it up.
 * The two forms genuinely differ; do not normalise either to the other.
 */

type Contact = {
  first_name: string;
  last_name: string;
  address: string;
  phone: string;
  email: string;
  table_name: string;
};

const EMPTY: Contact = {
  first_name: "",
  last_name: "",
  address: "",
  phone: "",
  email: "",
  table_name: "",
};

const FIELDS: { name: keyof Contact; label: string; type?: string; autoComplete?: string }[] = [
  { name: "first_name", label: "Prénom", autoComplete: "given-name" },
  { name: "last_name", label: "Nom", autoComplete: "family-name" },
  { name: "address", label: "Adresse", autoComplete: "street-address" },
  { name: "phone", label: "Téléphone", type: "tel", autoComplete: "tel" },
  { name: "email", label: "E-mail", type: "email", autoComplete: "email" },
  { name: "table_name", label: "Table (nom de famille ou nom de table)" },
];

export function Signup() {
  const { config } = useSession();
  const occasion = config.occasion;

  const [values, setValues] = useState<Contact>(EMPTY);
  const [menus, setMenus] = useState<string[]>([]);
  const [verifying, setVerifying] = useState(false);
  const { error, setFromThrown, clear, messageFor } = useApiFormError(
    "L’envoi du formulaire a échoué. Veuillez réessayer.",
  );
  const navigate = useNavigate();

  const send = useSignupStore({
    mutation: {
      // Pushed, not replaced — the old page assigned window.location.href, so
      // Back returned to the form. Keep that.
      onSuccess: () => navigate("/signup_thanks"),
      onError: setFromThrown,
    },
  });

  // The route only exists while the feature is on, and ConfigController ties
  // `occasion` to the same flag — so this narrows the type rather than guarding
  // against a state the API produces.
  if (!occasion) return null;

  const guests = menus.length > 0 ? menus : [occasion.menus[0]?.value ?? ""];
  const pending = verifying || send.isPending;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Explicit, not implied by the button: aria-disabled leaves the control
    // clickable, and Enter in a field submits regardless. This early return is
    // the only thing preventing a double send.
    if (pending) return;
    clear();

    const form = event.currentTarget;
    const trap = (form.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";

    setVerifying(true);
    let solution: string;
    try {
      const challenge = await altcha();
      solution = await solveChallenge(challenge.data as Altcha200);
    } catch (thrown) {
      // Fail closed and SAY SO, rather than the old alert() that lumped a
      // 503 from /altcha in with a validation rejection. `captcha_failed`
      // already has French copy in web/src/i18n/fr.ts.
      setFromThrown(thrown);
      setVerifying(false);
      return;
    }
    setVerifying(false);

    // Built as a VARIABLE, not passed as a fresh object literal. `hp` is
    // deliberately absent from SignupStoreBody — the honeypot is undocumented
    // so the public OpenAPI contract does not hand abuse tooling a "leave this
    // empty to pass" instruction — and TypeScript's excess-property check
    // rejects an unknown key on a fresh literal. Freshness is lost on
    // assignment, so this compiles while still sending the field the server
    // reads first.
    const data = { ...values, menus: guests, altcha: solution, hp: trap };
    send.mutate({ data });
  };

  return (
    <PageSection width="text">
      <h1 className="font-display text-3xl">{occasion.title}</h1>
      <p className="mt-1 text-ink-muted">{occasion.subtitle}</p>
      <p className="mt-4">{occasion.teaser}</p>
      <p className="mt-2">{occasion.invitation}</p>

      <FormError error={error} />

      {/* The values are NOT cleared on failure — a rejected reservation must
          not make someone retype it. Same rule as the contact form. */}
      <form onSubmit={submit} className="mt-6 space-y-6">
        {/* Honeypot: hidden from real users; bots that autofill it are dropped
            server-side, which answers a plain 201 so they never learn it. It
            must keep being rendered and submitted. */}
        <div aria-hidden="true" className="absolute h-px w-px overflow-hidden opacity-0">
          <label htmlFor="website">Ne pas remplir ce champ</label>
          <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        <Card asChild className="gap-0 p-5">
          <fieldset>
            <legend className="px-2 font-display text-xl">Vos coordonnées</legend>
            <div className="mt-2 space-y-3">
              {FIELDS.map((field) => (
                <FormField
                  key={field.name}
                  id={`signup-${field.name}`}
                  label={field.label}
                  type={field.type}
                  required
                  autoComplete={field.autoComplete}
                  problem={messageFor(field.name)}
                  value={values[field.name]}
                  onChange={(next) =>
                    setValues((previous) => ({ ...previous, [field.name]: next }))
                  }
                />
              ))}
              {/* No datalist of existing table names, deliberately: the old form
                published every reserving guest's surname to anonymous
                visitors. The affordance it carried survives in this hint. */}
              <p className="text-sm text-ink-muted">
                Tapez exactement le même nom de table que vos proches pour être placés ensemble.
              </p>
            </div>
          </fieldset>
        </Card>

        <Card asChild className="gap-0 p-5">
          <fieldset>
            <legend className="px-2 font-display text-xl">Menus</legend>
            <p className="mt-2">Choisissez un menu par personne.</p>

            <ul aria-label="Menus proposés" className="mt-4 space-y-3">
              {occasion.menus.map((menu) => (
                <li key={menu.value} className="rounded border border-line p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{menu.label}</span>
                    <span className="text-violet">{menu.price}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{menu.description}</p>
                </li>
              ))}
            </ul>

            <div className="mt-5">
              <GuestMenus
                menus={guests}
                onChange={setMenus}
                options={occasion.menus}
                maxGuests={occasion.maxGuests}
              />
            </div>
            {messageFor("menus") ? (
              <p className="mt-2 text-sm text-danger">{messageFor("menus")}</p>
            ) : null}
          </fieldset>
        </Card>

        {/* aria-disabled, not disabled — see Login.tsx. The submit handler's
            early return is the real guard. */}
        <Button type="submit" aria-disabled={pending}>
          {verifying ? "Vérification…" : "Envoyer l’inscription"}
        </Button>
      </form>
    </PageSection>
  );
}
