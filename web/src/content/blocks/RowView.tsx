import type { ReactNode } from "react";

import { Tbd } from "@/components/Tbd";

import { mailtoHref, swissTelHref } from "../../lib/contactHref";
import { useShowsGaps } from "../EditMode";
import { StyledText } from "../StyledText";
import { type TranslationKey, t } from "../../i18n";
import { tr } from "../translated";
import { isHttpsUrl, type Row } from "../types";

/** What each placeholder token stands for, in the words of `placeholders.*`. */
const TBD_WHAT: Record<string, TranslationKey> = {
  "join-contact": "placeholders.joinContact",
  "booking-number": "placeholders.bookingNumber",
};

const LINK = "text-violet underline";

/**
 * One row of a card, as a visitor reads it: a paragraph, or one per line of a
 * text row. Only what can safely be a link becomes one: a link row's URL must
 * be https, since a read lets any string through (see types.ts).
 *
 * `plain` shows every row as text, for a card that is a link itself: a link
 * inside a link is invalid, and a click would not know which one it meant.
 */
export function RowView({ row, plain = false }: { row: Row; plain?: boolean }) {
  if (plain && row.type !== "text" && row.type !== "labelValue") return <PlainRow row={row} />;
  switch (row.type) {
    case "text":
      return lines(tr(row.text)).map((line, index) => (
        <p key={index} className="mt-tight">
          <StyledText text={line} />
        </p>
      ));
    case "labelValue":
      return (
        <Labelled label={tr(row.label)}>
          <StyledText text={tr(row.value)} />
        </Labelled>
      );
    case "phone": {
      if (row.number.trim() === "") return <EmptyPhone label={tr(row.label)} token={row.tbd} />;
      // A read does not check the number (see types.ts), so one the editor
      // would refuse renders as text: a guessed prefix can ring abroad.
      const href = swissTelHref(row.number);
      return (
        <Labelled label={tr(row.label)}>
          {href ? (
            <a href={href} className={`whitespace-nowrap ${LINK}`}>
              {row.number}
            </a>
          ) : (
            row.number
          )}
        </Labelled>
      );
    }
    case "email": {
      const href = mailtoHref(row.address);
      return (
        <Labelled label={tr(row.label)}>
          {href ? (
            <a href={href} className={LINK}>
              {row.address}
            </a>
          ) : (
            row.address
          )}
        </Labelled>
      );
    }
    case "address": {
      const place = row.label ? tr(row.label) : "";
      return (
        <p className="mt-tight">
          <a
            href={mapHref(place, row.address)}
            target="_blank"
            rel="noreferrer"
            className="text-violet hover:underline"
          >
            {place || row.address}
          </a>
        </p>
      );
    }
    case "link":
      return (
        <p className="mt-tight">
          {isHttpsUrl(row.url) ? (
            <a href={row.url} target="_blank" rel="noreferrer" className={LINK}>
              {tr(row.label)}
            </a>
          ) : (
            tr(row.label)
          )}
        </p>
      );
  }
}

/** A row that would be a link, shown as its words alone. */
function PlainRow({ row }: { row: Exclude<Row, { type: "text" | "labelValue" }> }) {
  switch (row.type) {
    case "phone":
      if (row.number.trim() === "") return <EmptyPhone label={tr(row.label)} token={row.tbd} />;
      return <Labelled label={tr(row.label)}>{row.number}</Labelled>;
    case "email":
      return <Labelled label={tr(row.label)}>{row.address}</Labelled>;
    case "address":
      return <p className="mt-tight">{(row.label ? tr(row.label) : "") || row.address}</p>;
    case "link":
      return <p className="mt-tight">{tr(row.label)}</p>;
  }
}

/**
 * A label, the locale's separator, then the value. A label typed with its own
 * colon ("Pour réserver les Canetons :") keeps a single one, and a blank label
 * leaves the value on its own.
 */
function Labelled({ label, children }: { label: string; children: ReactNode }) {
  const bare = label.trim().replace(/\s*:$/, "");
  return (
    <p className="mt-tight">
      {bare === "" ? null : `${bare}${t("blockEditor.separator")}`}
      {children}
    </p>
  );
}

/**
 * A phone row still waiting for its number. A visitor gets no row at all, not
 * a label with nothing after it; an editor sees the gap in edit mode (ADR
 * 0048). Its own component, so only an empty row asks for edit mode, and a
 * row with a number renders anywhere, router or not.
 */
function EmptyPhone({ label, token }: { label: string; token: string | undefined }) {
  if (!useShowsGaps()) {
    return null;
  }
  return (
    <Labelled label={label}>
      <Placeholder token={token} />
    </Labelled>
  );
}

/** The gap in a phone row, counted by its `data-tbd` token. */
function Placeholder({ token }: { token: string | undefined }) {
  const what = token === undefined ? undefined : TBD_WHAT[token];
  return <Tbd {...(what ? { what: t(what) } : {})} {...(token ? { token } : {})} />;
}

function lines(text: string): string[] {
  return text.split("\n").filter((line) => line.trim() !== "");
}

/**
 * A place link, not a directions link: a place query lets Google route from
 * the visitor's own location if they ask for directions. The place's name and
 * its address are searched together.
 */
function mapHref(place: string, address: string): string {
  const query = place === "" ? address : `${place}, ${address}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
