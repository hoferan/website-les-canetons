import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";

import { rowsOf } from "../api/collection";
import {
  registrationOptionIndex,
  registrationOptionReplace,
  useEventShow,
} from "../api/generated/endpoints";
import type {
  RegistrationOptionResource,
  ReplaceRegistrationOptionsRequestOptionsItem,
} from "../api/generated/model";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField, RequiredLegend } from "../components/FormField";
import { PageSection } from "../components/PageSection";
import { formatEventWhen } from "../events/formatEventWhen";
import { t } from "../i18n";
import { francsInput, parseFrancs } from "../money";
import { OUTLINED_CARD } from "../carnival/raised";

/** One row of the editor: an existing option, or one being invented. */
type Draft = {
  /** Null for a row that does not exist on the server yet. */
  id: number | null;
  label: string;
  description: string;
  /** Francs as typed, not centimes: see web/src/money.ts. */
  price: string;
  /** A stable key for React, since a new row has no id. */
  key: string;
};

let nextKey = 0;

function draftFrom(option: RegistrationOptionResource): Draft {
  return {
    id: option.id,
    label: option.label,
    description: option.description ?? "",
    price: francsInput(option.priceCents),
    key: `option-${option.id}`,
  };
}

function blankDraft(): Draft {
  return { id: null, label: "", description: "", price: "", key: `new-${nextKey++}` };
}

/**
 * What can be booked at one event.
 *
 * Gated on `events.manage`, not a registration permission: configuring what
 * an event offers is configuring the event. The registration permissions are
 * about the people who booked.
 *
 * Replace-all, like `PUT /members/{member}/roles`: the whole list is sent
 * every time (an entry with an id updates, one without creates, anything
 * missing is deleted), because an "add one" API cannot express removal.
 * Removing an option people have already booked is refused.
 *
 * The list is read once, imperatively, and the tag is kept: a `useQuery`
 * refetch would advance the tag while the form still shows what it opened
 * with, which satisfies the server and protects nobody.
 *
 * The write has its own facet, `etag:event.options`. The options are absent
 * from EventResource, so the event's tag would miss every option change and
 * refuse an options edit because somebody corrected the dress code.
 */
export function EventRegistrationOptions() {
  const { id } = useParams();
  const eventId = Number(id);

  const event = useEventShow(eventId);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [etag, setEtag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [priceProblems, setPriceProblems] = useState<Record<string, string>>({});
  // Beside the button, not in a toast: a toast is gone by the time somebody
  // looks up from the form.
  const [saved, setSaved] = useState(false);

  const form = useApiFormError(t("registrationOptions.saveFailed"));

  const replace = useMutation({
    mutationFn: ({
      options,
      tag,
    }: {
      options: ReplaceRegistrationOptionsRequestOptionsItem[];
      tag: string;
    }) => registrationOptionReplace(eventId, { options }, ifMatch(tag)),
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const response = await registrationOptionIndex(eventId);
        if (cancelled) {
          return;
        }
        setDrafts(rowsOf<RegistrationOptionResource>(response).map(draftFrom));
        setEtag(entityTagOf(response));
      } catch {
        if (!cancelled) {
          setReadError(t("registrationOptions.loadFailedReload"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  function update(key: string, patch: Partial<Draft>) {
    // Any edit retracts the confirmation, which would otherwise describe a
    // list that has since changed.
    setSaved(false);
    setDrafts((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function move(index: number, by: -1 | 1) {
    setDrafts((current) => {
      const next = [...current];
      const row = next[index];
      const swap = next[index + by];
      // Reading both rows is the bounds check: noUncheckedIndexedAccess makes
      // each `Draft | undefined`.
      if (!row || !swap) {
        return current;
      }
      next[index] = swap;
      next[index + by] = row;
      return next;
    });
  }

  async function save() {
    if (etag === null) {
      setReadError(t("registrationOptions.loadFailedReload"));
      return;
    }

    form.clear();

    // Prices are parsed before anything is sent, so a malformed one is
    // reported against its row. The API takes integer centimes, so the typed
    // text never reaches it.
    const problems: Record<string, string> = {};
    const options: ReplaceRegistrationOptionsRequestOptionsItem[] = [];

    drafts.forEach((row, index) => {
      const price = parseFrancs(row.price);

      if (price === "invalid") {
        problems[row.key] = t("registrationOptions.priceInvalid");
        return;
      }

      options.push({
        id: row.id,
        label: row.label,
        description: row.description.trim() === "" ? null : row.description,
        priceCents: price,
        sortOrder: index,
      });
    });

    setPriceProblems(problems);
    if (Object.keys(problems).length > 0) {
      return;
    }

    try {
      const written = await replace.mutateAsync({ options, tag: etag });

      // The write hands back the new list and tag, so a second save does not
      // quote a stale tag and get a 412 for this screen's own edit.
      setDrafts(rowsOf<RegistrationOptionResource>(written).map(draftFrom));
      setEtag(entityTagOf(written));
      setSaved(true);
    } catch (thrown) {
      // The form stays as it is: a refused save (a booked option removed, or
      // a stale tag) must not throw away the rest of the edit.
      form.setFromThrown(thrown);
    }
  }

  const title = event.data?.status === 200 ? event.data.data : null;

  return (
    <PageSection>
      <Link to="/events" className="text-sm text-ink-muted underline">
        {t("common.backToPlanning")}
      </Link>

      {/* The same key as the planning's link to this screen. */}
      <h1 className="mt-tight font-display text-3xl">{t("events.options")}</h1>

      {title ? (
        <p data-testid="options-event" className="mt-tight text-ink-muted">
          {title.title} — {formatEventWhen(title.startsAt, title.endsAt)}
        </p>
      ) : null}

      <p className="mt-related text-ink-muted">{t("registrationOptions.intro")}</p>

      {loading ? <p className="mt-block text-ink-muted">{t("common.loading")}</p> : null}

      {readError ? (
        <p role="alert" className="mt-block text-danger">
          {readError}
        </p>
      ) : null}

      {!loading && !readError ? (
        <>
          {drafts.length === 0 ? (
            <p className="mt-block text-ink-muted">{t("registrationOptions.empty")}</p>
          ) : (
            <div className="mt-related">
              <RequiredLegend />
            </div>
          )}

          <ul className="mt-block grid gap-related">
            {drafts.map((row, index) => (
              <li key={row.key} className={`${OUTLINED_CARD} flex flex-col gap-related p-4`}>
                {/* Numbered, because the same three labels repeat per option.
                    The number is the position, which is also what `sortOrder`
                    is sent as. */}
                <h2 className="font-display text-lg">
                  {t("registrationOptions.optionNumber", { n: index + 1 })}
                </h2>

                <FormField
                  id={`label-${row.key}`}
                  label={t("registrationOptions.label")}
                  value={row.label}
                  onChange={(value) => update(row.key, { label: value })}
                  // The full path, index and all: `translateApiError` keeps
                  // `field` as sent (`options.2.label`), so a bare "label"
                  // would light every row at once.
                  problem={form.messageFor(`options.${index}.label`)}
                  required
                />
                <FormField
                  id={`description-${row.key}`}
                  label={t("registrationOptions.description")}
                  value={row.description}
                  onChange={(value) => update(row.key, { description: value })}
                  problem={form.messageFor(`options.${index}.description`)}
                />
                <FormField
                  id={`price-${row.key}`}
                  label={t("registrationOptions.price")}
                  value={row.price}
                  onChange={(value) => update(row.key, { price: value })}
                  // The local parse failure first: when it fires, nothing was
                  // sent.
                  problem={priceProblems[row.key] ?? form.messageFor(`options.${index}.priceCents`)}
                />

                {/* Icon-only, so the aria-label carries the option and a
                    screen reader hears which row moves. Remove sits at the far
                    end, away from the arrows. See ADR 0025. */}
                <div className="flex gap-tight">
                  <Button
                    type="button"
                    variant="raised-light"
                    size="icon"
                    aria-label={t("registrationOptions.moveUp", {
                      option: row.label || t("registrationOptions.thisOption"),
                    })}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="raised-light"
                    size="icon"
                    aria-label={t("registrationOptions.moveDown", {
                      option: row.label || t("registrationOptions.thisOption"),
                    })}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  {/* Removing is local until the save: the write is
                      replace-all, so the row is absent from the list sent. The
                      server refuses removing a booked option; this screen
                      keeps no copy of that rule. */}
                  <Button
                    type="button"
                    variant="raised-light"
                    size="icon"
                    className="ml-auto"
                    aria-label={t("registrationOptions.remove", {
                      option: row.label || t("registrationOptions.thisOption"),
                    })}
                    onClick={() =>
                      setDrafts((current) => current.filter((other) => other.key !== row.key))
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <FormError error={form.error} />

          <div className="mt-block flex flex-wrap gap-related">
            <Button
              type="button"
              variant="raised-light"
              onClick={() => setDrafts((current) => [...current, blankDraft()])}
            >
              <Plus aria-hidden="true" />
              {t("registrationOptions.addOption")}
            </Button>
            {saved ? (
              <p role="status" className="self-center text-ink-muted">
                {t("registrationOptions.saved")}
              </p>
            ) : null}
            <Button
              type="button"
              aria-disabled={replace.isPending}
              onClick={() => {
                if (replace.isPending) {
                  return;
                }
                void save();
              }}
            >
              {replace.isPending ? t("registrationOptions.saving") : t("common.save")}
            </Button>
          </div>
        </>
      ) : null}
    </PageSection>
  );
}
