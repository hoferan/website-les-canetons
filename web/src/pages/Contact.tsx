import { useMutation } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";

import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { contactStore, useFormTokenShow } from "../api/generated/endpoints";
import type { ContactRequest } from "../api/generated/model";
import { newIdempotencyKey, publicWriteHeaders } from "../api/publicWrite";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField } from "../components/FormField";

/**
 * `website` is the honeypot and is ALWAYS the empty string. It is part of the
 * body rather than of the headers, and it must arrive present: a body that
 * merely omits it is refused too, which is what stops a hand-written POST
 * walking past the guard by leaving the field out.
 */
const EMPTY: ContactRequest = {
  lastName: "",
  firstName: "",
  email: "",
  subject: "",
  message: "",
  website: "",
};

/**
 * Field order and labels are the legacy page's, colons and all — including the
 * missing space before them. That inconsistency is in the live site and is not
 * being tidied here.
 */
const FIELDS: {
  name: Exclude<keyof ContactRequest, "website">;
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

/**
 * Write to the committee.
 *
 * THE ONLY THING ON THE PUBLIC SITE THAT WRITES, and the only screen a
 * stranger can make the server do work with. The three protections it owes are
 * in `web/src/api/publicWrite.ts`; what matters here is WHEN each is obtained.
 *
 * The form token is fetched AS THE PAGE RENDERS and pinned. A token under two
 * seconds old is refused, so fetching one on submit guarantees a rejection,
 * and letting the query refetch on a focus change would replace a good token
 * with a too-fresh one at the worst possible moment. `staleTime: Infinity` and
 * the two refetch opt-outs are what pin it; the token stays valid for two
 * hours, which is longer than anybody has this form open.
 *
 * The idempotency key is minted once per mount, in a ref, so a retry after a
 * refusal reuses it — a failed attempt releases its key server-side, so the
 * same key is exactly right — while a fresh visit to the page gets a fresh
 * one.
 *
 * SUCCESS IS RENDERED IN PLACE rather than on a /confirmation route, unlike
 * the legacy site. A thank-you page that is reachable by URL, by Back, and by
 * a bookmark says a message was sent when none was; replacing the form with
 * its own answer cannot.
 */
export function Contact() {
  const [values, setValues] = useState<ContactRequest>(EMPTY);
  const [sent, setSent] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  const formToken = useFormTokenShow({
    query: {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  });

  const { error, setFromThrown, clear, messageFor } = useApiFormError(
    "L’envoi du formulaire a échoué. Veuillez réessayer.",
  );

  const send = useMutation({
    mutationFn: (token: string) =>
      contactStore(values, publicWriteHeaders(token, idempotencyKey.current)),
    onSuccess: () => setSent(true),
    onError: setFromThrown,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // Explicit, not implied by the button: aria-disabled leaves the control
    // clickable, and Enter in a field submits through the default button
    // regardless. This early return is the only thing preventing a double send.
    if (send.isPending) return;
    clear();

    // No token, no submission. The query is fired on mount and the form takes
    // longer than that to fill in, so this is the failed-fetch case (429 or
    // 503), not a race — which is why it says "réessayer" rather than
    // "patienter".
    const token = formToken.data?.status === 200 ? formToken.data.data.token : null;
    if (!token) {
      setFromThrown(new Error("no form token"));
      return;
    }

    send.mutate(token);
  };

  if (sent) {
    return (
      <PageSection width="text">
        <h1 className="font-display text-3xl">Message envoyé</h1>
        <p className="mt-related text-ink-muted">
          Merci&nbsp;! Le comité a reçu votre message et vous répondra à l’adresse que vous avez
          indiquée.
        </p>
      </PageSection>
    );
  }

  return (
    <PageSection width="text">
      <h1 className="font-display text-3xl">Contact</h1>
      <p className="mt-related text-ink-muted">
        Une question, une demande de prestation, ou l’envie de nous rejoindre&nbsp;? Écrivez au
        comité.
      </p>

      <FormError error={error} />

      {/* The values are NOT cleared on failure: a rejected message must not
          make someone retype it. Same rule as the event form. */}
      <Card asChild className="mt-related gap-0 p-5">
        <form onSubmit={submit} className="space-y-related">
          {FIELDS.map((field) => (
            <FormField
              key={field.name}
              id={`contact-${field.name}`}
              label={field.label}
              type={field.type}
              as={field.as}
              /* Every field is required, `subject` included — which the legacy
                 markup was NOT, even though ContactRequest has always required
                 it. A blank subject used to pass the browser, make a round
                 trip, be rejected, and surface as a generic failure that named
                 no field. Deliberate fix, pinned by a test. */
              required
              autoComplete={field.autoComplete}
              problem={messageFor(field.name)}
              value={values[field.name]}
              onChange={(next) => setValues((previous) => ({ ...previous, [field.name]: next }))}
            />
          ))}

          {/* THE HONEYPOT. Hidden from people and from assistive technology
              both — `hidden` keeps it out of the accessibility tree, so a
              screen-reader user is never asked to fill in a field that must
              stay empty — while remaining a real control whose value is
              submitted. tabIndex -1 and autoComplete "off" stop a keyboard
              user and a password manager reaching it by accident, which is the
              other way a real person trips this. */}
          <input
            type="text"
            name="website"
            hidden
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={(event) =>
              setValues((previous) => ({ ...previous, website: event.target.value }))
            }
          />

          {/* aria-disabled, not disabled — see Login.tsx. The submit handler's
              early return is the real guard. */}
          <Button type="submit" aria-disabled={send.isPending}>
            Envoyer
          </Button>
        </form>
      </Card>
    </PageSection>
  );
}
