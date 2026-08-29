import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useContact } from "../api/generated/endpoints";
import type { ContactRequest } from "../api/generated/model";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField } from "../components/FormField";

const EMPTY: ContactRequest = {
  lastName: "",
  firstName: "",
  email: "",
  subject: "",
  message: "",
};

/**
 * Field order and labels are the old page's, colons and all — including the
 * missing space before them, which the planning page does have. That
 * inconsistency is in the live site and is not being tidied here.
 */
const FIELDS: {
  name: keyof ContactRequest;
  label: string;
  type?: string;
  as?: "input" | "textarea";
  autoComplete?: string;
}[] = [
  { name: "lastName", label: "Nom:", autoComplete: "family-name" },
  { name: "firstName", label: "Prénom:", autoComplete: "given-name" },
  { name: "email", label: "E-mail:", type: "email", autoComplete: "email" },
  { name: "subject", label: "Sujet:" },
  { name: "message", label: "Contenu du message:", as: "textarea" },
];

export function Contact() {
  const [values, setValues] = useState<ContactRequest>(EMPTY);
  const { error, setFromThrown, clear, messageFor } = useApiFormError(
    "L’envoi du formulaire a échoué. Veuillez réessayer.",
  );
  const navigate = useNavigate();

  const send = useContact({
    mutation: {
      // Pushed, not replaced: the old page assigned window.location.href, so
      // Back returned to the form. Keep that.
      onSuccess: () => navigate("/confirmation"),
      onError: setFromThrown,
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // Explicit, not implied by the button: aria-disabled leaves the control
    // clickable, and Enter in a field submits through the default button
    // regardless. This early return is the only thing preventing a double send.
    if (send.isPending) return;
    clear();
    send.mutate({ data: values });
  };

  return (
    <section className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl">Contact</h1>

      <FormError error={error} />

      {/* The values are NOT cleared on failure: a rejected message must not
          make someone retype it. Same rule as the event form. */}
      <form onSubmit={submit} className="mt-4 space-y-3 rounded-lg border border-line bg-panel p-5">
        {FIELDS.map((field) => (
          <FormField
            key={field.name}
            id={`contact-${field.name}`}
            label={field.label}
            type={field.type}
            as={field.as}
            /* Every field is required, `subject` included — which the old
               markup was NOT, even though ContactRequest has always required
               it. A blank subject used to pass the browser, make a round trip,
               be rejected, and surface as a generic "Échec de l'envoi du
               formulaire" alert that named no field. Deliberate fix, pinned by
               a test. */
            required
            autoComplete={field.autoComplete}
            problem={messageFor(field.name)}
            value={values[field.name]}
            onChange={(next) => setValues((previous) => ({ ...previous, [field.name]: next }))}
          />
        ))}
        {/* aria-disabled, not disabled — see Login.tsx. The submit handler's
            early return is the real guard. */}
        <button
          type="submit"
          aria-disabled={send.isPending}
          className="rounded bg-violet px-4 py-2 font-semibold text-white hover:bg-violet/90 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          Envoyer
        </button>
      </form>
    </section>
  );
}
