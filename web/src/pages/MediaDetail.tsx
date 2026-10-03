import { useQueryClient } from "@tanstack/react-query";
import { Download, Pencil, RotateCcw, RotateCw, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  getImageIndexQueryKey,
  getImageShowQueryKey,
  getImageSummaryQueryKey,
  imageDestroy,
  imageUpdate,
  useImageShow,
} from "../api/generated/endpoints";
import type { ImageResource } from "../api/generated/model";
import { ApiError } from "../api/http";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { FormField } from "../components/FormField";
import { PageSection } from "../components/PageSection";
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
import { t, translateApiError } from "../i18n";
import { kilobytes } from "../images/kilobytes";
import { Photo, PHOTO_SIZES } from "../images/Photo";
import { downloadName, MAX_NAME_LENGTH } from "../images/photoName";
import { rotatePhoto, type Turn } from "../images/rotate";
import { shrink, ShrinkError } from "../images/shrink";
import type { ShrinkFn } from "../images/uploadQueue";
import { UsageLinks } from "../images/usages";
import { type ReplaceFn, replaceViaApi } from "../images/useUploadQueue";
import { formatDay } from "../lib/date";

type Props = {
  /** Injected by tests: jsdom has no canvas and cannot send a multipart body. */
  replacer?: ReplaceFn;
  rotator?: (url: string, turn: Turn) => Promise<Blob[]>;
  shrinker?: ShrinkFn;
};

type Work = "rotating" | "preparing" | "sending";

/** The reads that carry a photo's name or URL, by the path that keys their query. */
const PHOTO_READS = ["/images", "/photo-placements", "/band", "/site-photos", "/history"];
type Outcome = { ok: boolean; message: string };

/** A write's answer as the show query holds it: the image and the headers carrying its new tag. */
type Written = { data: ImageResource; status: 200; headers: Headers };

/** What a failed rotation or replacement says after "La photo n'a pas changé :". */
function problemOf(thrown: unknown): string {
  if (thrown instanceof ApiError) return translateApiError(thrown).message;
  if (thrown instanceof ShrinkError) return t(`photos.reason.${thrown.reason}`);
  return t("photos.detail.sendFailed");
}

/**
 * One photo of the library (#105): it large, its stored sizes, where it is
 * shown, and the actions on it. Rename, rotate, replace and delete are
 * conditional writes, each quoting the tag of the photo as the page shows it
 * (see web/src/api/ifMatch.ts); a write answers the photo with its new tag,
 * which replaces the read, so a second action needs no reload.
 *
 * A rotation and a replacement both end in a replacement on the server, so
 * the photo keeps its id and every page that shows it shows the new one. When
 * either fails, the photo is unchanged and the page says why.
 */
export function MediaDetail({
  replacer = replaceViaApi,
  rotator = rotatePhoto,
  shrinker = shrink,
}: Props = {}) {
  const { id } = useParams();
  const imageId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const show = useImageShow(imageId, {
    query: { enabled: Number.isInteger(imageId) && imageId > 0 },
  });
  const read = show.data?.status === 200 ? show.data : null;
  const image = read?.data ?? null;
  const etag = read ? entityTagOf(read) : null;

  const [work, setWork] = useState<Work | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [renaming, setRenaming] = useState<{ value: string; etag: string } | null>(null);
  const [savingName, setSavingName] = useState(false);
  // Read by the submit handler, which may run twice before React re-renders
  // with `savingName` set: two Enters in a row are two submits.
  const nameInFlight = useRef(false);
  const nameError = useApiFormError(t("photos.detail.renameFailed"));
  const [deleting, setDeleting] = useState<{ etag: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // An open rename form holds the tag it was opened with, so nothing else
  // may change the photo underneath it until it is saved or cancelled.
  const busy = work !== null || savingName || renaming !== null;

  /**
   * The write's answer becomes the read, and everything else that names the
   * photo is read again: the library and its summary, the placements, and the
   * three public reads that carry a photo's URL (the band and its registers,
   * the two site photos, the history).
   */
  function written(response: Written) {
    const own = getImageShowQueryKey(imageId)[0];
    queryClient.setQueryData(getImageShowQueryKey(imageId), response);
    void queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return (
          typeof key === "string" &&
          key !== own &&
          PHOTO_READS.some((read) => key === read || key.startsWith(`${read}/`))
        );
      },
    });
  }

  async function sendSizes(makeSizes: () => Promise<Blob[]>, first: Work, done: string) {
    if (image === null || etag === null || busy) return;
    // The tag of the photo the person is looking at when they ask.
    const tag = etag;
    setOutcome(null);
    setWork(first);
    try {
      const sizes = await makeSizes();
      setWork("sending");
      written(await replacer(image.id, sizes, tag));
      setOutcome({ ok: true, message: done });
    } catch (thrown) {
      setOutcome({
        ok: false,
        message: t("photos.detail.unchanged", { message: problemOf(thrown) }),
      });
    } finally {
      setWork(null);
    }
  }

  function turn(direction: Turn) {
    if (image === null) return;
    const url = image.url;
    void sendSizes(() => rotator(url, direction), "rotating", t("photos.detail.rotated"));
  }

  function replaceWith(file: File) {
    void sendSizes(() => shrinker(file), "preparing", t("photos.detail.replaced"));
  }

  async function saveName() {
    // A second Enter while the first save is on its way would send the same
    // tag twice, and the second would answer 412 into a closed form.
    if (renaming === null || image === null || nameInFlight.current) return;
    nameInFlight.current = true;
    nameError.clear();
    setSavingName(true);
    try {
      const response = await imageUpdate(
        image.id,
        { name: renaming.value },
        ifMatch(renaming.etag),
      );
      if (response.status === 200) written(response);
      setRenaming(null);
      setOutcome({ ok: true, message: t("photos.detail.renamed") });
    } catch (thrown) {
      nameError.setFromThrown(thrown);
    } finally {
      nameInFlight.current = false;
      setSavingName(false);
    }
  }

  async function confirmDelete() {
    if (deleting === null || image === null || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await imageDestroy(image.id, ifMatch(deleting.etag));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getImageIndexQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getImageSummaryQueryKey() }),
      ]);
      queryClient.removeQueries({ queryKey: getImageShowQueryKey(imageId) });
      navigate("/media");
    } catch (thrown) {
      setDeleteError(
        thrown instanceof ApiError
          ? translateApiError(thrown).message
          : t("photos.deleteFailedFallback"),
      );
      setDeleteBusy(false);
    }
  }

  const back = (
    <Link
      to="/media"
      className="inline-flex min-h-touch items-center text-violet underline underline-offset-2"
    >
      {t("photos.detail.back")}
    </Link>
  );

  if (image === null) {
    return (
      <PageSection width="text">
        {back}
        {show.isError || !(Number.isInteger(imageId) && imageId > 0) ? (
          <p role="alert" className="mt-block text-danger">
            {t("photos.detail.loadFailed")}
          </p>
        ) : (
          <p className="mt-block text-ink-muted">{t("common.loading")}</p>
        )}
      </PageSection>
    );
  }

  const inUse = image.usages.length > 0;

  return (
    <PageSection width="text">
      {back}
      <h1 className="mt-related font-display text-3xl wrap-anywhere">{image.name}</h1>

      {renaming ? (
        <form
          className="mt-related flex flex-col gap-related"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void saveName();
          }}
        >
          <FormField
            id="photo-name"
            label={t("photos.detail.nameLabel")}
            value={renaming.value}
            onChange={(value) => setRenaming({ ...renaming, value })}
            problem={nameError.messageFor("name")}
            maxLength={MAX_NAME_LENGTH}
            required
          />
          {nameError.error && nameError.error.fields.length === 0 ? (
            <p role="alert" className="text-danger">
              {nameError.error.message}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-tight">
            <Button type="submit" aria-disabled={savingName}>
              {savingName ? t("common.busy") : t("common.save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                nameError.clear();
                setRenaming(null);
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : null}

      <Photo
        photo={{ ...image, altFr: null, altDe: null }}
        fallbackAlt={image.name}
        sizes={PHOTO_SIZES.textColumn}
        // At most 60% of the screen's height, so a portrait photo leaves the
        // actions in view on a laptop. It keeps its shape and narrows.
        className="mt-related h-auto max-h-[60vh] w-auto max-w-full rounded-md border border-line bg-panel"
      />

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="photo-replace-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) replaceWith(file);
          // The same file chosen twice must still fire a change.
          event.target.value = "";
        }}
      />

      <div
        role="group"
        aria-label={t("photos.detail.actionsLabel")}
        className="mt-related flex flex-wrap gap-tight"
      >
        <Button
          type="button"
          variant="outline"
          disabled={busy || etag === null}
          onClick={() => {
            if (etag === null) return;
            nameError.clear();
            setOutcome(null);
            setRenaming({ value: image.name, etag });
          }}
        >
          <Pencil aria-hidden="true" />
          {t("photos.detail.rename")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || etag === null}
          onClick={() => turn("left")}
        >
          <RotateCcw aria-hidden="true" />
          {t("photos.detail.rotateLeft")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || etag === null}
          onClick={() => turn("right")}
        >
          <RotateCw aria-hidden="true" />
          {t("photos.detail.rotateRight")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || etag === null}
          onClick={() => input.current?.click()}
        >
          <Upload aria-hidden="true" />
          {t("photos.detail.replace")}
        </Button>
        <Button asChild variant="outline">
          <a href={image.url} download={downloadName(image.name)}>
            <Download aria-hidden="true" />
            {t("photos.detail.download")}
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || etag === null}
          onClick={() => {
            if (etag === null) return;
            setDeleteError(null);
            setDeleting({ etag });
          }}
        >
          <Trash2 aria-hidden="true" />
          {t("common.delete")}
        </Button>
      </div>

      <div role="status" className="mt-related">
        {work ? <p className="text-ink-muted">{t(`photos.detail.${work}`)}</p> : null}
        {outcome?.ok ? <p className="text-ink">{outcome.message}</p> : null}
      </div>
      <div role="alert">
        {outcome && !outcome.ok ? <p className="text-danger">{outcome.message}</p> : null}
      </div>

      <dl className="mt-block flex flex-col gap-related">
        <div>
          <dt className="font-medium">{t("photos.detail.sizesHeading")}</dt>
          <dd>
            <ul data-testid="photo-sizes">
              {[...image.sizes].reverse().map((size) => (
                <li key={size.width} className="text-ink-muted">
                  {t("photos.detail.size", {
                    width: size.width,
                    height: size.height,
                    size: kilobytes(size.bytes),
                  })}
                </li>
              ))}
            </ul>
            <p className="text-sm text-ink-muted">
              {t("photos.addedOn", { date: formatDay(image.createdAt) })}
            </p>
          </dd>
        </div>
        <div>
          <dt className="font-medium">{t("photos.detail.usedOnHeading")}</dt>
          <dd>
            {inUse ? (
              <UsageLinks usages={image.usages} />
            ) : (
              <p className="text-ink-muted">{t("photos.unused")}</p>
            )}
          </dd>
        </div>
      </dl>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next && !deleteBusy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {inUse ? t("photos.detail.deleteInUseTitle") : t("photos.deleteTitle", { count: 1 })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {inUse ? t("photos.detail.deleteInUse") : t("photos.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {inUse ? <UsageLinks usages={image.usages} /> : null}
          <div role="alert">
            {deleteError ? <p className="text-danger">{deleteError}</p> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>
              {inUse ? t("photos.detail.close") : t("common.cancel")}
            </AlertDialogCancel>
            {inUse ? null : (
              <Button
                type="button"
                variant="destructive"
                aria-disabled={deleteBusy}
                onClick={() => void confirmDelete()}
              >
                {deleteBusy ? t("common.busy") : t("photos.deleteConfirm")}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageSection>
  );
}
