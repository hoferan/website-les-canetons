import { useMutation } from "@tanstack/react-query";
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
import { FormError, FormField } from "../components/FormField";
import { PageSection } from "../components/PageSection";
import { formatEventWhen } from "../events/formatEventWhen";
import { francsInput, parseFrancs } from "../money";

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
 * `events.manage`, NOT a registration permission: configuring what an event
 * offers is configuring the event, the same act as setting its date. The two
 * registration permissions are about the people who booked.
 *
 * REPLACE-ALL, matching `PUT /members/{member}/roles`. The whole list is sent
 * every time — an entry with an id updates, one without creates, and anything
 * missing is deleted — because an "add one" API cannot express removal, which
 * is the half the booked-option invariant exists for. Removing something
 * people have already booked is refused rather than silently rewriting what
 * those people ordered.
 *
 * THE LIST IS READ ONCE, IMPERATIVELY, AND THE TAG IS KEPT. This screen IS the
 * form, so `useQuery` would be wrong for the same reason it is wrong behind a
 * dialog: a refetch on a focus change advances the tag while the form still
 * shows what it opened with, which satisfies the server and protects nobody.
 *
 * ITS OWN FACET, `etag:event.options`, and not the event's. The options are
 * absent from EventResource, so conditioning this write on the event's tag
 * would miss every option change — a lost update would go straight through —
 * and would refuse a perfectly good options edit because somebody corrected
 * the dress code.
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
  // Beside the button rather than in a toast, for the same reason the guest
  // list's refusal is: this screen's whole answer to "did that work?" is one
  // line, and a toast is gone by the time somebody looks up from the form.
  const [saved, setSaved] = useState(false);

  const form = useApiFormError("L’enregistrement a échoué.");

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
          setReadError("La liste n’a pas pu être chargée. Rechargez la page.");
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
    // Any edit retracts the confirmation: "Enregistré" over a form somebody
    // has since changed is a claim about the wrong list.
    setSaved(false);
    setDrafts((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function move(index: number, by: -1 | 1) {
    setDrafts((current) => {
      const next = [...current];
      const row = next[index];
      const swap = next[index + by];
      // Reading both rows IS the bounds check: noUncheckedIndexedAccess makes
      // each `Draft | undefined`, which replaces an index comparison rather
      // than sitting after one.
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
      setReadError("La liste n’a pas pu être chargée. Rechargez la page.");
      return;
    }

    form.clear();

    // Prices are parsed BEFORE anything is sent, because a malformed one has
    // to be reported against the row it was typed in. The API takes integer
    // centimes and would refuse "quarante-cinq" against `options.2.priceCents`,
    // which is a path the committee cannot map back to a row on screen.
    const problems: Record<string, string> = {};
    const options: ReplaceRegistrationOptionsRequestOptionsItem[] = [];

    drafts.forEach((row, index) => {
      const price = parseFrancs(row.price);

      if (price === "invalid") {
        problems[row.key] = "Indiquez un montant, par exemple 45 ou 45.50.";
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

      // The write hands back the new list and the new tag, so the screen can
      // be saved twice without a reload. Without this the second save quotes
      // a tag the first one moved and answers 412 — which reads as somebody
      // else editing, when it was this screen.
      setDrafts(rowsOf<RegistrationOptionResource>(written).map(draftFrom));
      setEtag(entityTagOf(written));
      setSaved(true);
    } catch (thrown) {
      // The form stays as it is. A refused save — a booked option removed, or
      // a stale tag — must not throw away the rest of the edit.
      form.setFromThrown(thrown);
    }
  }

  const title = event.data?.status === 200 ? event.data.data : null;

  return (
    <PageSection>
      <Link to="/events" className="text-sm text-ink-muted underline">
        ← Retour au planning
      </Link>

      <h1 className="mt-tight font-display text-3xl">Ce qu’on réserve</h1>

      {title ? (
        <p data-testid="options-event" className="mt-tight text-ink-muted">
          {title.title} — {formatEventWhen(title.startsAt, title.endsAt)}
        </p>
      ) : null}

      <p className="mt-related text-ink-muted">
        Ce que le public peut réserver, et à quel prix. Laissez le prix vide pour une option qui
        n’en a pas&nbsp;; écrivez 0 pour une option gratuite. Ce n’est pas la même chose.
      </p>

      {loading ? <p className="mt-block text-ink-muted">Chargement…</p> : null}

      {readError ? (
        <p role="alert" className="mt-block text-danger">
          {readError}
        </p>
      ) : null}

      {!loading && !readError ? (
        <>
          {drafts.length === 0 ? (
            <p className="mt-block text-ink-muted">
              Rien n’est proposé pour l’instant. Le formulaire public affichera l’événement sans
              rien à choisir.
            </p>
          ) : null}

          <ul className="mt-block grid gap-related">
            {drafts.map((row, index) => (
              <li
                key={row.key}
                className="flex flex-col gap-related rounded-md border border-line bg-panel p-4"
              >
                {/* THE ROW IS NUMBERED, and it earns its place on a screen
                    that repeats "Intitulé / Description / Prix" once per
                    option: without it the third block is reachable only by
                    counting, and by keyboard it is three identical labels in a
                    row. The number is the position, which is also what
                    `sortOrder` is sent as. */}
                <h2 className="font-display text-lg">Option {index + 1}</h2>

                <FormField
                  id={`label-${row.key}`}
                  label="Intitulé"
                  value={row.label}
                  onChange={(value) => update(row.key, { label: value })}
                  // THE FULL PATH, INDEX AND ALL. `translateApiError` keeps
                  // `field` as the server sent it — `options.2.label` — and
                  // reduces only the LOOKUP to its last segment, precisely so
                  // a screen can highlight the right input. Matching on a bare
                  // "label" was the first version of this and lit every row at
                  // once, which tells the committee a refusal happened and not
                  // where.
                  problem={form.messageFor(`options.${index}.label`)}
                  required
                />
                <FormField
                  id={`description-${row.key}`}
                  label="Description"
                  value={row.description}
                  onChange={(value) => update(row.key, { description: value })}
                  problem={form.messageFor(`options.${index}.description`)}
                />
                <FormField
                  id={`price-${row.key}`}
                  label="Prix en francs"
                  value={row.price}
                  onChange={(value) => update(row.key, { price: value })}
                  // The local parse failure first: when it fires, nothing was
                  // sent, so there is no server answer to show underneath it.
                  problem={priceProblems[row.key] ?? form.messageFor(`options.${index}.priceCents`)}
                />

                <div className="flex flex-wrap gap-tight">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Monter ${row.label || "cette option"}`}
                    onClick={() => move(index, -1)}
                  >
                    Monter
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Descendre ${row.label || "cette option"}`}
                    onClick={() => move(index, 1)}
                  >
                    Descendre
                  </Button>
                  {/* REMOVING IS LOCAL UNTIL THE SAVE, because the write is
                      replace-all: a row taken out here is simply absent from
                      the list that is sent. Somebody may still have booked it,
                      and the SERVER is what refuses that — this screen does
                      not keep a second copy of the rule to drift from it. */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Retirer ${row.label || "cette option"}`}
                    onClick={() =>
                      setDrafts((current) => current.filter((other) => other.key !== row.key))
                    }
                  >
                    Retirer
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <FormError error={form.error} />

          <div className="mt-block flex flex-wrap gap-related">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDrafts((current) => [...current, blankDraft()])}
            >
              Ajouter une option
            </Button>
            {saved ? (
              <p role="status" className="self-center text-ink-muted">
                Enregistré.
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
              {replace.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </>
      ) : null}
    </PageSection>
  );
}
