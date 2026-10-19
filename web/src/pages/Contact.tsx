import { useMutation } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";

import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { contactStore, useFormTokenShow } from "../api/generated/endpoints";
import type { ContactRequest } from "../api/generated/model";
import { newIdempotencyKey, publicWriteHeaders } from "../api/publicWrite";
import { useApiFormError } from "../api/useApiFormError";
import { PageHero } from "../carnival/PageHero";
import { RAISED_CARD } from "../carnival/raised";
import { FormError, FormField, RequiredLegend, formIsValid } from "../components/FormField";
import { Notice } from "../components/Notice";
import { type TranslationKey, t } from "../i18n";
import { useSession } from "../session/SessionProvider";

/**
 * `website` is the honeypot and is always the empty string. It must arrive
 * present: a body that omits it is refused too, so a hand-written POST cannot
 * pass the guard by leaving the field out.
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
 * The labels carry no colon, as on the booking form: each sits above its
 * control, where a colon points at nothing (#102).
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
 * A public write a stranger can trigger. Its three protections are in
 * `web/src/api/publicWrite.ts`; what matters here is when each is obtained.
 *
 * The form token is fetched as the page renders and pinned. A token under two
 * seconds old is refused, so fetching on submit guarantees a rejection, and a
 * refetch on focus would swap a good token for a too-fresh one.
 * `staleTime: Infinity` and the two refetch opt-outs pin it; it stays valid
 * for two hours.
 *
 * The idempotency key is minted once per mount, in a ref, so a retry after a
 * refusal reuses it (a failed attempt releases its key server-side), while a
 * fresh visit gets a fresh one.
 *
 * Success is rendered in place: a thank-you route reachable by URL, Back or
 * bookmark would say a message was sent when none was.
 */
export function Contact() {
  const { user } = useSession();
  const [values, setValues] = useState<ContactRequest>(EMPTY);
  const [sent, setSent] = useState(false);
  const sentHeading = useRef<HTMLHeadingElement>(null);
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
    onSuccess: () => {
      // As in the booking confirmation: the panel replaces the form, and the
      // window would keep the submit button's offset, leaving the sender on
      // the footer at 390px with focus on <body>. flushSync renders the
      // heading so it can be scrolled to and focused before the paint.
      flushSync(() => setSent(true));
      window.scrollTo(0, 0);
      sentHeading.current?.focus({ preventScroll: true });
    },
    onError: setFromThrown,
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // aria-disabled leaves the button clickable, and Enter in a field submits
    // regardless, so this return is the only guard against a double send.
    if (send.isPending) return;
    clear();
    if (!formIsValid(event.currentTarget)) return;

    // The query fires on mount and the form takes longer to fill in, so a
    // missing token means the fetch failed (429 or 503). Hence "réessayer"
    // rather than "patienter".
    const token = formToken.data?.status === 200 ? formToken.data.data.token : null;
    if (!token) {
      setFromThrown(new Error("no form token"));
      return;
    }

    send.mutate(token);
  };

  if (sent) {
    return (
      <>
        <PageHero
          title={t("contact.sentHeading")}
          seed={23}
          width="text"
          headingRef={sentHeading}
        />
        <PageSection width="text">
          <p className="text-ink-muted">{t("contact.sentBody")}</p>
        </PageSection>
      </>
    );
  }

  return (
    <>
      <PageHero title={t("contact.heading")} seed={23} width="text">
        <p>{t("contact.intro")}</p>
      </PageHero>

      <PageSection width="text">
        {/* A member is told, not stopped. Most can reach the committee faster
            on WhatsApp, but the site publishes no direct contact detail (the
            /join contacts are placeholders, see JOINING_CONTACTS in Join.tsx),
            so a member without the number has only this form. Hiding the form
            behind a reveal would cost everybody a click and save nobody a
            keystroke: /api/v1/me carries no e-mail address to prefill. */}
        {user ? <Notice className="mb-related">{t("contact.memberNotice")}</Notice> : null}

        <FormError error={error} />

        {/* The values are kept on failure, as on the event form, so a
            rejected message need not be retyped.

            Raised like every card on cream, while the fields stay plain
            vendored inputs: no decoration on what a person types into
            (ADR 0029). */}
        <Card asChild className={cn(RAISED_CARD, "gap-0 p-5", error && "mt-related")}>
          <form onSubmit={submit} noValidate className="space-y-related">
            <RequiredLegend />
            {FIELDS.map((field) => (
              <FormField
                key={field.name}
                id={`contact-${field.name}`}
                label={t(field.labelKey)}
                type={field.type}
                as={field.as}
                /* Every field is required, `subject` included, as
                 ContactRequest requires it; otherwise a blank subject comes
                 back as a generic failure that names no field. */
                required
                autoComplete={field.autoComplete}
                problem={messageFor(field.name)}
                value={values[field.name]}
                onChange={(next) => setValues((previous) => ({ ...previous, [field.name]: next }))}
              />
            ))}

            {/* The honeypot. `hidden` keeps it out of the accessibility tree
                while it stays a real, submitted control. tabIndex -1 and
                autoComplete "off" keep a keyboard user and a password manager
                from filling it by accident. */}
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

            {/* aria-disabled, not disabled: see components/ui/button.tsx. The
                submit handler's early return is the real guard. */}
            <Button
              type="submit"
              variant="raised-violet"
              className="h-12 px-5 text-base"
              aria-disabled={send.isPending}
            >
              {t("contact.submit")}
            </Button>
          </form>
        </Card>
      </PageSection>
    </>
  );
}
