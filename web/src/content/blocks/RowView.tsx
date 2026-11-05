import type { ReactNode } from "react";

import { Tbd } from "@/components/Tbd";

import { mailtoHref, swissTelHref } from "../../lib/contactHref";
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
 */
export function RowView({ row }: { row: Row }) {
  switch (row.type) {
    case "text":
      return lines(tr(row.text)).map((line, index) => (
        <p key={index} className="mt-tight">
          {line}
        </p>
      ));
    case "labelValue":
      return <Labelled label={tr(row.label)}>{tr(row.value)}</Labelled>;
    case "phone": {
      // A read does not check the number (see types.ts), so one the editor
      // would refuse renders as text: a guessed prefix can ring abroad.
      const href = swissTelHref(row.number);
      return (
        <Labelled label={tr(row.label)}>
          {row.number.trim() === "" ? (
            <Placeholder token={row.tbd} />
          ) : href ? (
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

/** A phone row still waiting for its number, counted by its `data-tbd` token. */
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
