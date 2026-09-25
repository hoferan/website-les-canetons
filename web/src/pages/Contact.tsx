import { useMutation } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";

import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { contactStore, useFormTokenShow } from "../api/generated/endpoints";
import type { ContactRequest } from "../api/generated/model";
import { newIdempotencyKey, publicWriteHeaders } from "../api/publicWrite";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField, RequiredLegend, formIsValid } from "../components/FormField";
import { Notice } from "../components/Notice";
import { type TranslationKey, t } from "../i18n";
import { useSession } from "../session/SessionProvider";

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
 * Field order is the legacy page's. The labels carry no colon, as on the
 * booking form: each sits above its control, where a colon points at nothing
 * (#102).
 */
const FIELDS: {
  name: Exclude<keyof ContactRequest, "website">;
  labelKey: TranslationKey;
  type?: string;
  as?: "input" | "textarea";
  autoComplete?: string;
}[] = [
  { name: "lastName", labelKey: "contact.fields.lastName", autoComplete: "family-name" },
  { name: "firstName", labelKey: "contact.fields.firstName", autoComplete: "given-name" },
  { name: "email", labelKey: "contact.fields.email", type: "email", autoComplete: "email" },
  { name: "subject", labelKey: "contact.fields.subject" },
  { name: "message", labelKey: "contact.fields.message", as: "textarea" },
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
  const { user } = useSession();
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

  const { error, setFromThrown, clear, messageFor } = useApiFormError(t("contact.sendFailed"));

  const send = useMutation({
    mutationFn: (token: string) =>
      contactStore(values, publicWriteHeaders(token, idempotencyKey.current)),
    onSuccess: () => setSent(true),
    onError: setFromThrown,
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Explicit, not implied by the button: aria-disabled leaves the control
    // clickable, and Enter in a field submits through the default button
    // regardless. This early return is the only thing preventing a double send.
    if (send.isPending) return;
    clear();
    if (!formIsValid(event.currentTarget)) return;

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
        <h1 className="font-display text-3xl">{t("contact.sentHeading")}</h1>
        <p className="mt-related text-ink-muted">{t("contact.sentBody")}</p>
      </PageSection>
    );
  }

  return (
    <PageSection width="text">
      <h1 className="font-display text-3xl">{t("contact.heading")}</h1>
      <p className="mt-related text-ink-muted">{t("contact.intro")}</p>

      {/* A MEMBER IS TOLD, NOT STOPPED. They would retype a name the session is
          already holding and go through three protections meant for strangers
          — honeypot, form token, idempotency key — to reach a committee most of
          them can reach faster on WhatsApp. But the site publishes no direct
          contact detail anywhere (comite@lescanetons.org was pulled from
          /committee in the 2026-08-31 audit; /join's contacts are
          placeholders, see Join.tsx:26), so a member who has not got the
          number has only this form. Hiding it behind a reveal was built and
          rejected on 2026-09-18 for exactly that reason: it charges a click of
          everybody it does not help, and does not spare the one it does a
          single keystroke, since /api/v1/me carries no e-mail address to
          prefill with. Attributing a member's message to their account is a
          real fix and belongs with the committee inbox (#88). */}
      {user ? <Notice className="mt-related">{t("contact.memberNotice")}</Notice> : null}

      <FormError error={error} />

      {/* The values are NOT cleared on failure: a rejected message must not
          make someone retype it. Same rule as the event form. */}
      <Card asChild className="mt-related gap-0 p-5">
        <form onSubmit={submit} noValidate className="space-y-related">
          <RequiredLegend />
          {FIELDS.map((field) => (
            <FormField
              key={field.name}
              id={`contact-${field.name}`}
              label={t(field.labelKey)}
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
            {t("contact.submit")}
          </Button>
        </form>
      </Card>
    </PageSection>
  );
}
