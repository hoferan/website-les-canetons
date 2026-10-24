import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { rowsOf } from "../../api/collection";
import { eventIndex, registrationOptionIndex } from "../../api/generated/endpoints";
import type { EditableRegistrationOptionResource, EventResource } from "../../api/generated/model";
import { formatEventWhen } from "../../events/formatEventWhen";
import { t } from "../../i18n";

/**
 * "Copy from…" on an empty form: the other events that have a form, newest
 * first, and a tap reads that form's blocks into this one.
 *
 * Both halves of the planning, since last year's souper is the usual source
 * and it sits in the history. No endpoint of its own: two reads of the
 * planning and one of the options.
 */
export function CopyFrom({
  eventId,
  onCopy,
}: {
  eventId: number;
  onCopy: (options: EditableRegistrationOptionResource[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copying, setCopying] = useState<number | null>(null);

  const sources = useQuery({
    queryKey: ["form-sources", eventId],
    enabled: open,
    queryFn: async () => {
      const [upcoming, past] = await Promise.all([eventIndex(), eventIndex({ past: "1" })]);

      return [...rowsOf<EventResource>(upcoming), ...rowsOf<EventResource>(past)]
        .filter((event) => event.takesRegistrations && event.id !== eventId)
        .sort((a, b) => (b.startsAt ?? "").localeCompare(a.startsAt ?? ""));
    },
  });

  async function copy(source: EventResource) {
    setCopying(source.id);
    try {
      onCopy(rowsOf<EditableRegistrationOptionResource>(await registrationOptionIndex(source.id)));
      setOpen(false);
    } finally {
      setCopying(null);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="raised-light" className="w-fit" onClick={() => setOpen(true)}>
        <Copy aria-hidden="true" />
        {t("registrationOptions.copyFrom")}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-tight">
      <p className="text-sm text-ink-muted">{t("registrationOptions.copyHint")}</p>
      {sources.isPending ? <p className="text-ink-muted">{t("common.loading")}</p> : null}
      {sources.data?.length === 0 ? (
        <p className="text-ink-muted">{t("registrationOptions.copyNone")}</p>
      ) : null}
      <ul className="grid gap-tight">
        {sources.data?.map((source) => (
          <li key={source.id}>
            <button
              type="button"
              aria-disabled={copying !== null}
              onClick={() => copying === null && void copy(source)}
              className="flex min-h-touch w-full flex-col rounded-xl border-2 border-ink bg-panel p-3 text-left hover:bg-ground focus-visible:outline-3 focus-visible:outline-violet"
            >
              <span className="font-semibold">{source.title}</span>
              <span className="text-sm text-ink-muted">
                {formatEventWhen(source.startsAt, source.endsAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="raised-light" className="w-fit" onClick={() => setOpen(false)}>
        {t("registrationOptions.cancel")}
      </Button>
    </div>
  );
}
