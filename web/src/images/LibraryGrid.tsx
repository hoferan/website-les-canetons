import { useQueryClient } from "@tanstack/react-query";
import { Eye, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  getImageIndexQueryKey,
  getImageSummaryQueryKey,
  imageDestroy,
  imageShow,
} from "../api/generated/endpoints";
import type { ImageResource } from "../api/generated/model";
import { ApiError } from "../api/http";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { SearchField } from "../components/SearchField";
import { currentLocale, t, translateApiError } from "../i18n";
import { intlTag } from "../i18n/locale";
import { formatDay } from "../lib/date";
import { kilobytes } from "./kilobytes";
import { LIBRARY_ORDERS, type LibraryOrder, matchesName, sortImages } from "./librarySearch";
import { PHOTO_SIZES } from "./Photo";
import { usageLabel } from "./usages";

type Filter = "all" | "used" | "unused";
const FILTERS: {
  key: Filter;
  label: "photos.filterAll" | "photos.filterUsed" | "photos.filterUnused";
}[] = [
  { key: "all", label: "photos.filterAll" },
  { key: "used", label: "photos.filterUsed" },
  { key: "unused", label: "photos.filterUnused" },
];

type Failure = { image: ImageResource; message: string };

/**
 * The library as cards (ADR 0024), newest first as the API lists it unless
 * another order is chosen. The search, the order and the used/unused filter
 * all work on the list in hand: see librarySearch.ts.
 *
 * ONLY AN UNUSED PHOTO CAN BE SELECTED. The server refuses to delete a photo
 * that is shown anywhere (`image_in_use`), so a box on a used card would only
 * lead to a refusal. The card says where the photo is shown instead.
 *
 * EACH DELETE CARRIES ITS OWN TAG, read through GET /images/{id} as the
 * confirm dialog opens (see web/src/api/ifMatch.ts for why the read and not
 * the list). The deletes run one after the other and a refusal settles that
 * photo only: if somebody placed one of them meanwhile, the rest still go.
 */
export function LibraryGrid({ images }: { images: ImageResource[] }) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<LibraryOrder>("newest");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState<ImageResource[] | null>(null);
  const [tags, setTags] = useState<Map<number, string | null> | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [outcome, setOutcome] = useState<{ deleted: number; failures: Failure[] } | null>(null);
  // Bumped each time the dialog opens, so a slow tag read from an earlier
  // opening cannot land in this one.
  const opening = useRef(0);

  const unused = images.filter((image) => image.usages.length === 0);
  const visible = sortImages(
    images.filter(
      (image) =>
        (filter === "all" || (image.usages.length === 0) === (filter === "unused")) &&
        matchesName(image.name, query),
    ),
    order,
    intlTag(currentLocale()),
  );
  // Only what is on screen is deleted: a photo placed since it was ticked,
  // or hidden by the search or the filter, is left out of the count and the
  // delete.
  const shown = new Set(visible.map((image) => image.id));
  const chosen = unused.filter((image) => selected.has(image.id) && shown.has(image.id));

  function toggle(id: number, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function openConfirm() {
    const token = ++opening.current;
    setOutcome(null);
    setTags(null);
    setConfirming(chosen);
    const read = await Promise.all(
      chosen.map(async (image) => {
        try {
          return [image.id, entityTagOf(await imageShow(image.id))] as const;
        } catch {
          return [image.id, null] as const;
        }
      }),
    );
    if (token === opening.current) {
      setTags(new Map(read));
    }
  }

  function closeConfirm() {
    opening.current++;
    setConfirming(null);
    setTags(null);
  }

  async function confirmDelete() {
    if (!confirming || !tags || deleting) {
      return;
    }
    setDeleting(true);
    const failures: Failure[] = [];
    let deleted = 0;
    for (const image of confirming) {
      const tag = tags.get(image.id);
      try {
        if (tag == null) {
          throw new Error("No entity tag for this image");
        }
        await imageDestroy(image.id, ifMatch(tag));
        deleted++;
      } catch (thrown) {
        failures.push({
          image,
          message:
            thrown instanceof ApiError
              ? translateApiError(thrown).message
              : t("photos.deleteFailedFallback"),
        });
      }
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getImageIndexQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getImageSummaryQueryKey() }),
    ]);
    setDeleting(false);
    setSelected(new Set());
    setConfirming(null);
    setTags(null);
    setOutcome({ deleted, failures });
  }

  return (
    <div className="flex flex-col gap-related">
      <div className="flex flex-wrap gap-tight">
        <SearchField
          id="library-search"
          label={t("photos.searchLabel")}
          placeholder={t("photos.searchPlaceholder")}
          value={query}
          onChange={setQuery}
          className="w-full sm:w-72"
        />
        <label htmlFor="library-order" className="sr-only">
          {t("photos.sortLabel")}
        </label>
        <select
          id="library-order"
          className="focus-ring min-h-touch rounded-md border border-line bg-panel px-3 text-ink"
          value={order}
          onChange={(event) => setOrder(event.target.value as LibraryOrder)}
        >
          {LIBRARY_ORDERS.map((key) => (
            <option key={key} value={key}>
              {t(`photos.sort.${key}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-tight">
        <div className="flex flex-wrap gap-tight" role="group" aria-label={t("photos.filterLabel")}>
          {FILTERS.map(({ key, label }) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={filter === key ? "default" : "outline"}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {t(label)}
            </Button>
          ))}
        </div>
        {filter === "used" ? null : (
          <Button
            type="button"
            variant="outline"
            className="ml-auto"
            disabled={chosen.length === 0}
            onClick={() => void openConfirm()}
          >
            <Trash2 aria-hidden="true" />
            {t("photos.deleteSelected", { n: chosen.length })}
          </Button>
        )}
      </div>

      <div role="status">
        {outcome && outcome.deleted > 0 ? (
          <p className="text-ink">{t("photos.deleted", { count: outcome.deleted })}</p>
        ) : null}
      </div>
      <div role="alert">
        {outcome && outcome.failures.length > 0 ? (
          <div className="rounded-md border border-danger p-3">
            <p className="font-medium text-danger">{t("photos.deleteFailedHeading")}</p>
            <ul className="mt-tight flex flex-col gap-tight">
              {outcome.failures.map(({ image, message }) => (
                <li key={image.id} className="flex items-start gap-2 text-sm">
                  <img
                    src={image.url}
                    srcSet={image.srcset}
                    sizes={PHOTO_SIZES.icon}
                    width={image.width}
                    height={image.height}
                    alt=""
                    className="size-12 shrink-0 rounded object-cover"
                  />
                  <span>{t("photos.deleteFailed", { name: image.name, message })}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {images.length === 0 ? (
        <p className="text-ink-muted">{t("photos.pickerEmpty")}</p>
      ) : visible.length === 0 ? (
        <p className="text-ink-muted">{t("photos.emptyFiltered")}</p>
      ) : (
        <ul
          className="grid grid-cols-2 gap-related sm:grid-cols-3 lg:grid-cols-4"
          data-testid="library-grid"
        >
          {visible.map((image) => (
            <li
              key={image.id}
              data-testid={`library-card-${image.id}`}
              className="flex min-w-0 flex-col gap-tight rounded-md border border-line bg-panel p-2"
            >
              {/* One link for the photo and its name, so the card is not two
                  stops for a keyboard on the way to the same page. */}
              <Link
                to={`/media/${image.id}`}
                className="flex flex-col gap-tight rounded outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <img
                  src={image.url}
                  srcSet={image.srcset}
                  sizes={PHOTO_SIZES.libraryCard}
                  width={image.width}
                  height={image.height}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/3] w-full rounded object-cover"
                />
                <span className="line-clamp-2 font-medium wrap-anywhere text-violet underline underline-offset-2">
                  {image.name}
                </span>
              </Link>
              <p className="text-sm text-ink-muted">
                {t("photos.addedOn", { date: formatDay(image.createdAt) })} ·{" "}
                {kilobytes(image.bytes)}
              </p>
              {/* ONE LINE, NOT A LIST OF LINKS. Each link on its own 44px row
                  made a card twice as tall for two places, and the card's own
                  link leads to the photo's page, which lists every place as a
                  link anyway. Two lines at most; the title holds the rest. */}
              {image.usages.length > 0 ? (
                <p
                  className="flex items-start gap-1.5 text-sm text-ink-muted"
                  title={image.usages.map(usageLabel).join(" · ")}
                >
                  <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span className="sr-only">{t("photos.usedOn")}</span>
                  <span className="line-clamp-2 wrap-anywhere">
                    {image.usages.map(usageLabel).join(" · ")}
                  </span>
                </p>
              ) : (
                <>
                  <span className="self-start rounded-full border border-line bg-panel px-2 py-0.5 text-sm text-ink-muted">
                    {t("photos.unused")}
                  </span>
                  <label className="mt-auto flex min-h-touch cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-5"
                      aria-label={t("photos.selectPhoto", { name: image.name })}
                      checked={selected.has(image.id)}
                      onChange={(event) => toggle(image.id, event.target.checked)}
                    />
                    <span aria-hidden="true">{t("photos.select")}</span>
                  </label>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(next) => {
          if (!next && !deleting) closeConfirm();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("photos.deleteTitle", { count: confirming?.length ?? 0 })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t("photos.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="flex flex-wrap gap-tight">
            {(confirming ?? []).map((image) => (
              <li key={image.id}>
                <img
                  src={image.url}
                  srcSet={image.srcset}
                  sizes={PHOTO_SIZES.icon}
                  width={image.width}
                  height={image.height}
                  alt=""
                  className="size-12 rounded object-cover"
                />
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            {/* The deletes keep running once the dialog is gone, so cancelling
                mid-batch would hide an outcome the person is waiting for. */}
            <AlertDialogCancel disabled={deleting} onClick={closeConfirm}>
              {t("common.cancel")}
            </AlertDialogCancel>
            {/* A plain Button, not AlertDialogAction, which would close the
                dialog before the deletes have run. */}
            <Button
              type="button"
              variant="destructive"
              aria-disabled={tags === null || deleting}
              onClick={() => void confirmDelete()}
            >
              {tags === null || deleting ? t("common.busy") : t("photos.deleteConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
