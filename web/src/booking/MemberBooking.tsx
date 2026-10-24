import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import {
  getEventIndexQueryKey,
  myRegistrationDestroy,
  myRegistrationPut,
  useMyRegistrationShow,
} from "../api/generated/endpoints";
import type { RegistrationFormResource, RegistrationResource } from "../api/generated/model";
import { ApiError } from "../api/http";
import { useApiFormError } from "../api/useApiFormError";
import { PageHero } from "../carnival/PageHero";
import { RAISED_CARD } from "../carnival/raised";
import { FormError, formIsValid } from "../components/FormField";
import { PageSection } from "../components/PageSection";
import { formatEventWhen } from "../events/formatEventWhen";
import { t } from "../i18n";
import { formatDay } from "../lib/date";
import { useSession } from "../session/SessionProvider";
import { AnswerFields } from "./AnswerFields";
import { AnswersSummary } from "./AnswersSummary";
import { useAnswers } from "./useAnswers";

/**
 * A member's own answers to a form for members only (#318, ADR 0034).
 *
 * The same blocks as the guest's form, without contact details, honeypot or
 * form token: the name comes from the account. One booking per member, which
 * they change or withdraw until the form closes. After that their answers
 * stay readable.
 */
export function MemberBooking({
  eventId,
  offer,
  editLink,
}: {
  eventId: number;
  offer: RegistrationFormResource;
  editLink: ReactNode;
}) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const typed = useAnswers(offer);
  const { error, setFromThrown, clear, messageFor } = useApiFormError(t("booking.submitFailed"));
  const heading = useRef<HTMLHeadingElement>(null);

  // A 404 is "no booking yet", which is the ordinary first visit.
  const read = useMyRegistrationShow(eventId, { query: { retry: false } });
  const readFailed = read.isError && !(read.error instanceof ApiError && read.error.status === 404);
  // What a save or a withdrawal answered, over the first read: the page
  // shows the booking as it now stands without reading it again.
  const [settled, setSettled] = useState<RegistrationResource | null | undefined>(undefined);
  const mine: RegistrationResource | null =
    settled !== undefined ? settled : read.data?.status === 200 ? read.data.data : null;
  const notYetOpen = offer.opensAt !== null && Date.parse(offer.opensAt) > Date.now();

  // Editing until there is a booking to show; then the answers, with a way
  // back into the form.
  const [editing, setEditing] = useState<boolean | null>(null);
  const [withdrawn, setWithdrawn] = useState(false);
  const showForm = offer.open && (editing ?? mine === null);

  function settle(next: RegistrationResource | null) {
    setSettled(next);
    // The planning card says "fill in" or "my answers".
    void queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });
  }

  const save = useMutation({
    mutationFn: () => myRegistrationPut(eventId, { choices: typed.lines }),
    onSuccess: (result) => {
      if (result.status === 200 || result.status === 201) {
        settle(result.data);
        setWithdrawn(false);
        setEditing(false);
        window.scrollTo(0, 0);
        heading.current?.focus({ preventScroll: true });
      }
    },
    onError: setFromThrown,
  });

  const withdraw = useMutation({
    mutationFn: () => myRegistrationDestroy(eventId),
    onSuccess: () => {
      settle(null);
      typed.reset();
      setWithdrawn(true);
      setEditing(true);
    },
    onError: setFromThrown,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // aria-disabled leaves the control clickable, so this is what stops a
    // second PUT. The server would take it, as a change.
    if (save.isPending) return;
    clear();
    if (!formIsValid(event.currentTarget)) return;
    save.mutate();
  }

  function change() {
    if (mine) typed.load(mine);
    clear();
    setEditing(true);
  }

  const name = user ? `${user.firstName} ${user.lastName}` : "";

  return (
    <>
      <PageHero title={offer.event.title} seed={13} width="text" headingRef={heading}>
        <p>
          {formatEventWhen(offer.event.startsAt, offer.event.endsAt)} — {offer.event.location}
        </p>
      </PageHero>

      <PageSection width="text">
        {editLink}

        {!offer.open ? (
          <p className={cn(RAISED_CARD, "bg-yellow p-4")} role="status">
            {notYetOpen && offer.opensAt !== null
              ? t("booking.opensOn", { date: formatDay(offer.opensAt) })
              : t("booking.memberClosed")}
          </p>
        ) : offer.closesAt !== null ? (
          <p className="text-ink-muted">
            {t("booking.memberUntil", { date: formatDay(offer.closesAt) })}
          </p>
        ) : null}

        <FormError error={error} />

        {read.isPending ? (
          <p className="mt-related text-ink-muted">{t("common.loading")}</p>
        ) : readFailed ? (
          <p className="mt-related text-danger" role="alert">
            {t("booking.loadFailed")}
          </p>
        ) : showForm ? (
          <Card asChild className={cn(RAISED_CARD, "mt-related gap-0 p-5")}>
            <form onSubmit={submit} noValidate className="space-y-related">
              {withdrawn ? (
                <p role="status" className="text-ink-muted">
                  {t("booking.memberWithdrawn")}
                </p>
              ) : null}
              <p className="text-ink-muted" data-testid="member-name">
                {t("booking.memberAs", { name })}
              </p>

              <AnswerFields offer={offer} form={typed} messageFor={messageFor} />

              <div className="flex flex-wrap gap-related">
                <Button
                  type="submit"
                  variant="raised-violet"
                  className="h-12 px-5 text-base"
                  aria-disabled={save.isPending}
                >
                  {save.isPending
                    ? t("booking.sending")
                    : mine
                      ? t("booking.memberSave")
                      : t("booking.memberSubmit")}
                </Button>
                {mine ? (
                  <Button type="button" variant="raised-light" onClick={() => setEditing(false)}>
                    {t("common.cancel")}
                  </Button>
                ) : null}
              </div>
            </form>
          </Card>
        ) : mine ? (
          <Card className={cn(RAISED_CARD, "mt-related gap-tight p-5")}>
            <p className="font-display text-xl">{t("booking.memberAnswersHeading")}</p>
            <AnswersSummary booking={mine} countsPeople={typed.countsPeople} />
            {offer.open ? (
              <div className="mt-related flex flex-wrap gap-related">
                <Button type="button" variant="raised-violet" onClick={change}>
                  {t("booking.memberChange")}
                </Button>
                <Button
                  type="button"
                  variant="raised-light"
                  aria-disabled={withdraw.isPending}
                  onClick={() => {
                    if (withdraw.isPending) return;
                    clear();
                    withdraw.mutate();
                  }}
                >
                  {t("booking.memberWithdraw")}
                </Button>
              </div>
            ) : null}
          </Card>
        ) : !offer.open && !notYetOpen ? (
          <p className="mt-related text-ink-muted">{t("booking.memberNoAnswer")}</p>
        ) : null}
      </PageSection>
    </>
  );
}
