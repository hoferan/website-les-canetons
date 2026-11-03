import { useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { useId, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";

import { imageSummary, websiteExport, websiteImport } from "../api/generated/endpoints";
import type { WebsiteExport200, WebsiteImport200 } from "../api/generated/model";
import { ApiError } from "../api/http";
import { ConfirmByTypingName } from "../components/ConfirmByTypingName";
import { PageSection } from "../components/PageSection";
import { t, translateApiError, type TranslationKey } from "../i18n";
import type { UploadFn } from "../images/uploadQueue";
import { uploadViaApi } from "../images/useUploadQueue";
import { buildBundle, readBundle, type Bundle } from "../website/bundle";
import { ImportRefused, runImport } from "../website/importRunner";

const OUTLINED_CARD = "rounded-xl border-3 border-ink bg-panel p-5";

const BUNDLE_ERRORS: Record<"not_a_bundle" | "unknown_format" | "missing_image", TranslationKey> = {
  not_a_bundle: "website.notABundle",
  unknown_format: "website.unknownFormat",
  missing_image: "website.missingImage",
};

/**
 * The whole public website, carried from one server to another (#336, ADR
 * 0039): the Direction sets the site up on QA, downloads it here, and loads
 * the file on PROD's page of the same name.
 *
 * Both directions run in the browser, one request per photo, so nothing comes
 * near the host's upload limit. Members, events and bookings never travel.
 */
export function Website({
  upload = uploadViaApi,
  readFile = bytesOf,
}: {
  /** Injected by tests, which cannot send a multipart body through jsdom. */
  upload?: UploadFn;
  /** Injected by tests: jsdom's File turns a typed array from Node's realm into text. */
  readFile?: (file: File) => Promise<Uint8Array>;
}) {
  return (
    <PageSection width="form">
      <h1 className="font-display text-3xl">{t("website.heading")}</h1>
      <p className="mt-tight text-ink-muted">{t("website.intro")}</p>
      <ExportCard />
      <ImportCard upload={upload} readFile={readFile} />
    </PageSection>
  );
}

function ExportCard() {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);

  const download = async () => {
    if (progress) return;
    setFailed(false);
    try {
      const response = await websiteExport();
      if (response.status !== 200) throw new Error("export");
      const site = response.data;
      const total = site.images.reduce((sum, image) => sum + image.sizes.length, 0);
      let done = 0;
      setProgress({ done, total });
      const zip = await buildBundle(site, async (url) => {
        // A photo file, not an API call: public, cached for a year, and read
        // as bytes, which the JSON mutator does not do.
        const file = await fetch(url);
        // An error page saved as a photo would only fail on the other
        // server, half way through an import.
        if (!file.ok) throw new Error(`photo ${url}: ${file.status}`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        done += 1;
        setProgress({ done, total });
        return bytes;
      });
      save(zip, `site-${window.location.hostname}-${site.exportedAt.slice(0, 10)}.zip`);
    } catch {
      setFailed(true);
    } finally {
      setProgress(null);
    }
  };

  return (
    <section aria-labelledby="export-heading" className={`mt-block ${OUTLINED_CARD}`}>
      <h2 id="export-heading" className="font-display text-xl">
        {t("website.exportHeading")}
      </h2>
      <p className="mt-tight">{t("website.exportBody")}</p>
      <Button
        type="button"
        variant="raised"
        className="mt-related"
        aria-disabled={progress !== null}
        onClick={() => void download()}
      >
        <Download aria-hidden="true" />
        {t("website.exportButton")}
      </Button>
      <p role="status" className="mt-tight text-sm text-ink-muted">
        {progress ? t("website.exporting", progress) : null}
      </p>
      {failed ? <p className="mt-tight text-danger">{t("website.exportFailed")}</p> : null}
    </section>
  );
}

function save(zip: Uint8Array, name: string) {
  const url = URL.createObjectURL(
    new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Later, not at once: some browsers cancel a download whose URL goes away
  // while it starts.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

type Stage =
  | { kind: "idle" }
  | { kind: "read"; bundle: Bundle }
  | { kind: "running"; done: number; total: number }
  | { kind: "done"; result: WebsiteImport200 }
  | { kind: "failed"; message: string };

function ImportCard({
  upload,
  readFile,
}: {
  upload: UploadFn;
  readFile: (file: File) => Promise<Uint8Array>;
}) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [confirming, setConfirming] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setStage({ kind: "idle" });
    setBundleError(null);
    if (!file) return;
    const read = readBundle(await readFile(file));
    if ("reason" in read) {
      setBundleError(t(BUNDLE_ERRORS[read.reason]));
      return;
    }
    setStage({ kind: "read", bundle: read });
  };

  const replace = async (bundle: Bundle) => {
    setConfirming(false);
    setStage({ kind: "running", done: 0, total: 0 });
    try {
      const result = await runImport(bundle, {
        summary: async () => {
          const response = await imageSummary();
          if (response.status !== 200) throw new Error("summary");
          return response.data;
        },
        librarySha256s: async () => {
          const response = await websiteExport();
          if (response.status !== 200) throw new Error("library");
          return new Set(response.data.images.map((image) => image.sha256));
        },
        upload,
        importSite: async (body) => {
          const response = await websiteImport(body);
          if (response.status !== 200) throw new Error("import");
          return response.data;
        },
        wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        onProgress: (done, total) => setStage({ kind: "running", done, total }),
      });
      // Every page the site shows may have changed.
      await queryClient.invalidateQueries();
      setStage({ kind: "done", result });
    } catch (error) {
      setStage({ kind: "failed", message: messageFor(error) });
    }
  };

  const site = stage.kind === "read" ? stage.bundle.site : null;

  return (
    <section aria-labelledby="import-heading" className={`mt-block ${OUTLINED_CARD}`}>
      <h2 id="import-heading" className="font-display text-xl">
        {t("website.importHeading")}
      </h2>
      <p className="mt-tight">{t("website.importBody")}</p>

      <label htmlFor={inputId} className="mt-related block font-semibold">
        {t("website.fileLabel")}
      </label>
      <input
        id={inputId}
        type="file"
        accept=".zip,application/zip"
        className="mt-tight block w-full text-sm"
        disabled={stage.kind === "running"}
        onChange={(event) => void onFile(event)}
      />
      {bundleError ? <p className="mt-tight text-danger">{bundleError}</p> : null}

      {site ? <Summary site={site} onReplace={() => setConfirming(true)} /> : null}

      <div role="status" className="mt-related">
        {stage.kind === "running" ? (
          <p className="text-ink-muted">
            {t("website.uploading", { done: stage.done, total: stage.total })}
          </p>
        ) : null}
        {stage.kind === "done" ? <Result result={stage.result} /> : null}
        {stage.kind === "failed" ? <p className="text-danger">{stage.message}</p> : null}
      </div>

      {stage.kind === "read" ? (
        <ConfirmByTypingName
          open={confirming}
          title={t("website.confirmTitle")}
          description={t("website.confirmBody")}
          confirmLabel={t("website.replace")}
          confirmPhrase={t("website.confirmPhrase")}
          busy={false}
          error={null}
          onConfirm={() => void replace(stage.bundle)}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </section>
  );
}

function Summary({ site, onReplace }: { site: WebsiteExport200; onReplace: () => void }) {
  return (
    <section aria-label={t("website.summaryRegion")} className="mt-related">
      <ul className="list-inside list-disc text-sm">
        <li>{t("website.countBlocks", { count: site.blocks.length })}</li>
        <li>{t("website.countPhotos", { count: site.images.length })}</li>
        <li>{t("website.countSlots", { count: site.slots.length })}</li>
        <li>{t("website.countHistory", { count: site.history.length })}</li>
      </ul>
      <Button type="button" variant="raised-danger" className="mt-related" onClick={onReplace}>
        <Upload aria-hidden="true" />
        {t("website.replace")}
      </Button>
    </section>
  );
}

function Result({ result }: { result: WebsiteImport200 }) {
  return (
    <>
      <p>{t("website.done", result)}</p>
      {result.skipped.map((skipped) => (
        <p key={skipped.slot} className="text-sm text-ink-muted">
          {t("website.skipped", { name: skipped.registerName })}
        </p>
      ))}
    </>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof ImportRefused) {
    return t(error.reason === "corrupt" ? "website.missingImage" : "website.libraryFull");
  }
  if (error instanceof ApiError) return translateApiError(error).message;
  return t("website.importFailed");
}

/** The file's bytes. FileReader, which every browser has, rather than Blob.arrayBuffer(). */
function bytesOf(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("read"));
    reader.readAsArrayBuffer(file);
  });
}
