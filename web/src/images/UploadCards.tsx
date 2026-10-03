import { Button } from "@/components/ui/button";
import { t } from "../i18n";
import type { Card } from "./useUploadQueue";

/**
 * The cards still worth showing. A photo that landed, new or duplicate, and
 * that the refreshed library already lists is dropped: its tile in the library
 * is where to find it, and showing both would count the photo twice. What stays
 * is the work in progress and the failures, which are what need attention.
 */
export function unlisted(cards: Card[], listed: Set<number>): Card[] {
  return cards.filter(
    (card) =>
      !(
        (card.state === "done" || card.state === "duplicate") &&
        card.imageId != null &&
        listed.has(card.imageId)
      ),
  );
}

/**
 * One card per file in the upload queue, with its state, and Réessayer on a
 * failed one. Tout réessayer appears only from two failures up, since with one
 * the card's own button already does it.
 *
 * Shared by the picker and /media, so a photo going through either one reads
 * the same.
 */
export function UploadCards({
  cards,
  onRetry,
  onRetryAll,
  testId,
}: {
  cards: Card[];
  onRetry: (id: string) => void;
  onRetryAll: () => void;
  testId: string;
}) {
  if (cards.length === 0) {
    return null;
  }
  const failed = cards.filter((card) => card.state === "failed").length;

  return (
    <div className="flex flex-col gap-2">
      {failed > 1 ? (
        <div>
          <Button type="button" variant="outline" onClick={onRetryAll}>
            {t("photos.retryAll")}
          </Button>
        </div>
      ) : null}
      <ul
        // Filled by width rather than by breakpoint: the same list sits in the
        // picker's narrow dialog and across the full page.
        className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] items-start gap-2"
        aria-label={t("photos.queueLabel")}
        data-testid={testId}
      >
        {cards.map((card) => (
          <li key={card.id} className="min-w-0 rounded-md border border-line bg-panel p-2 text-sm">
            <p className="truncate font-medium">{card.file.name}</p>
            <p className={card.state === "failed" ? "text-danger" : "text-ink-muted"}>
              {card.state === "failed" && card.reason
                ? t(`photos.reason.${card.reason}`)
                : t(`photos.state.${card.state}`)}
            </p>
            {card.state === "failed" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => onRetry(card.id)}
              >
                {t("photos.retry")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
