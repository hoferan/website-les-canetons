import {
  Copy,
  Drum,
  MessageCircle,
  Music,
  Pencil,
  Star,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import {
  ACTION_STRIP_ROOM,
  ActionBar,
  type ActionBarAction,
  ActionBarList,
  useListMoves,
} from "@ds";
import { cn } from "@/lib/utils";

// The action bar of ADR 0043 in every look and state, in French and German.
// Developer copy, written inline like the rest of /dev/ui.

type Lang = "fr" | "de";

const WORDS = {
  fr: {
    before: "Avant",
    after: "Après",
    up: "Monter",
    down: "Descendre",
    edit: "Modifier",
    editSite: "Modifier le site",
    duplicate: "Dupliquer la carte",
    deleteCard: "Supprimer la carte",
    deleteEntry: "Supprimer l’entrée",
    deleteLine: "Supprimer la ligne",
    beforeLabel: (name: string) => `Déplacer « ${name} » avant`,
    afterLabel: (name: string) => `Déplacer « ${name} » après`,
    upLabel: (name: string) => `Monter « ${name} »`,
    downLabel: (name: string) => `Descendre « ${name} »`,
    editLabel: (name: string) => `Modifier : ${name}`,
    moreLabel: (name: string) => `Plus d’actions : ${name}`,
    missingGerman: (said: string) => `${said} (sans allemand)`,
    place: (name: string, n: number, of: number) => `${name}, carte ${n} sur ${of}`,
    moved: (name: string, n: number, of: number) => `${name} : position ${n} sur ${of}`,
    copy: (name: string) => `${name} (copie)`,
  },
  de: {
    before: "Nach vorn",
    after: "Nach hinten",
    up: "Nach oben",
    down: "Nach unten",
    edit: "Bearbeiten",
    editSite: "Website bearbeiten",
    duplicate: "Karte duplizieren",
    deleteCard: "Karte löschen",
    deleteEntry: "Eintrag löschen",
    deleteLine: "Zeile löschen",
    beforeLabel: (name: string) => `„${name}“ nach vorn verschieben`,
    afterLabel: (name: string) => `„${name}“ nach hinten verschieben`,
    upLabel: (name: string) => `„${name}“ nach oben verschieben`,
    downLabel: (name: string) => `„${name}“ nach unten verschieben`,
    editLabel: (name: string) => `Bearbeiten: ${name}`,
    moreLabel: (name: string) => `Weitere Aktionen: ${name}`,
    missingGerman: (said: string) => `${said} (ohne Deutsch)`,
    place: (name: string, n: number, of: number) => `${name}, Karte ${n} von ${of}`,
    moved: (name: string, n: number, of: number) => `${name}: Position ${n} von ${of}`,
    copy: (name: string) => `${name} (Kopie)`,
  },
} satisfies Record<Lang, unknown>;

type Tile = {
  id: string;
  title: Record<Lang, string>;
  icon: LucideIcon;
  color: string;
  text: string;
};

const TILES: Tile[] = [
  {
    id: "join",
    title: { fr: "Nous rejoindre", de: "Mitmachen" },
    icon: Music,
    color: "bg-pink",
    text: "Les instruments recherchés, les horaires et les critères d’âge.",
  },
  {
    id: "band",
    title: { fr: "Les canetons", de: "Die Canetons" },
    icon: Drum,
    color: "bg-cyan",
    text: "Les musiciens du groupe, registre par registre.",
  },
  {
    // The one tile whose text has no German: it wears the corner flag.
    id: "history",
    title: { fr: "Notre histoire", de: "Geschichte" },
    icon: Star,
    color: "bg-lime",
    text: "Comment la guggen est née en 2002, et qui l’a dirigée depuis.",
  },
  {
    id: "committee",
    title: { fr: "Le comité", de: "Der Vorstand" },
    icon: MessageCircle,
    color: "bg-lilac",
    text: "Nous écrire depuis la page de contact, et le comité.",
  },
];

/** Moves `key` to index `to`, for a list kept in local state. */
function reorder<T extends { id: string }>(list: T[], key: string, to: number) {
  const item = list.find((entry) => entry.id === key);
  if (!item) return list;
  const next = list.filter((entry) => entry.id !== key);
  next.splice(to, 0, item);
  return next;
}

function CardBand({
  lang,
  tile,
  columns,
  count = 4,
  tilt = false,
  yellow = false,
}: {
  lang: Lang;
  tile: number;
  columns: number;
  count?: number;
  tilt?: boolean;
  yellow?: boolean;
}) {
  const w = WORDS[lang];
  const [tiles, setTiles] = useState(() => TILES.slice(0, count));
  const moves = useListMoves({
    keys: tiles.map((entry) => entry.id),
    onMove: (key, to) => setTiles((list) => reorder(list, key, to)),
    announce: (key, position, of) =>
      w.moved(tiles.find((entry) => entry.id === key)?.title[lang] ?? key, position, of),
  });

  return (
    // One column is the phone, whose page has a 16px gutter.
    <div
      className={cn(
        "rounded-md py-9",
        columns === 1 ? "px-4" : "px-6",
        yellow ? "bg-yellow" : "bg-ground",
      )}
    >
      <ActionBarList>
        <ul
          className="grid gap-5"
          style={{
            gridTemplateColumns: `repeat(${columns}, ${columns === 1 ? "1fr" : `${tile}px`})`,
          }}
        >
          {tiles.map((entry, index) => {
            const name = entry.title[lang];
            const place = w.place(name, index + 1, tiles.length);
            const lacksGerman = entry.id === "history";
            const Icon = entry.icon;
            const actions: ActionBarAction[] = [
              moves.moveAction(entry.id, "before", { label: w.beforeLabel(place), word: w.before }),
              moves.moveAction(entry.id, "after", { label: w.afterLabel(place), word: w.after }),
              {
                id: "more",
                label: w.moreLabel(place),
                menu: [
                  {
                    id: "duplicate",
                    label: w.duplicate,
                    icon: Copy,
                    onSelect: () =>
                      setTiles((list) => {
                        const copy = {
                          ...entry,
                          id: `${entry.id}-${list.length}`,
                          title: {
                            fr: WORDS.fr.copy(entry.title.fr),
                            de: WORDS.de.copy(entry.title.de),
                          },
                        };
                        const next = [...list];
                        next.splice(index + 1, 0, copy);
                        return next;
                      }),
                  },
                  {
                    id: "delete",
                    label: w.deleteCard,
                    icon: Trash2,
                    destructive: true,
                    onSelect: () =>
                      setTiles((list) => list.filter((other) => other.id !== entry.id)),
                  },
                ],
              },
              {
                id: "edit",
                icon: Pencil,
                word: w.edit,
                label: lacksGerman ? w.missingGerman(w.editLabel(place)) : w.editLabel(place),
                flag: lacksGerman,
                onSelect: () => undefined,
              },
            ];
            return (
              <li key={entry.id} ref={moves.itemRef(entry.id)}>
                <div
                  className={cn(
                    "relative min-h-[13.75rem] rounded-[20px] border-3 border-ink bg-white px-4 pb-4.5 shadow-raised",
                    ACTION_STRIP_ROOM,
                    tilt && (index % 2 === 0 ? "-rotate-[1.2deg]" : "rotate-1"),
                  )}
                >
                  <ActionBar look="strip" label={name} actions={actions} main="edit" />
                  <span
                    className={cn(
                      "mb-3 grid size-13 place-items-center rounded-[14px] border-3 border-ink",
                      entry.color,
                    )}
                  >
                    <Icon aria-hidden="true" className="size-7" />
                  </span>
                  <h3 className="mb-2 font-display text-lg leading-tight uppercase">{name}</h3>
                  <p className="leading-normal text-muted-foreground">{entry.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </ActionBarList>
      {moves.liveRegion}
    </div>
  );
}

const ENTRIES = [
  {
    id: "2002",
    year: "2002",
    title: "La fondation",
    text: "Une poignée de parents lancent la guggen.",
  },
  { id: "2012", year: "2012", title: "Dix ans", text: "Premier voyage au carnaval de Bâle." },
];

/** History entries: their order is fixed by year, so only ⋯ and ✎. */
function HistoryEntries({ lang, columns }: { lang: Lang; columns: number }) {
  const w = WORDS[lang];
  return (
    <div className="rounded-md bg-ground px-6 py-7">
      <ActionBarList>
        <ul className={cn("grid gap-5", columns === 2 && "sm:grid-cols-2")}>
          {ENTRIES.slice(0, columns === 1 ? 1 : 2).map((entry, index) => (
            <li
              key={entry.id}
              className={cn(
                "relative rounded-2xl border-3 border-ink bg-white px-4.5 pb-4.5 shadow-raised",
                ACTION_STRIP_ROOM,
              )}
            >
              <ActionBar
                look="strip"
                label={entry.title}
                main="edit"
                actions={[
                  {
                    id: "more",
                    label: w.moreLabel(entry.title),
                    menu: [
                      {
                        id: "delete",
                        label: w.deleteEntry,
                        icon: Trash2,
                        destructive: true,
                        onSelect: () => undefined,
                      },
                    ],
                  },
                  {
                    id: "edit",
                    icon: Pencil,
                    word: w.edit,
                    label:
                      index === 0
                        ? w.missingGerman(w.editLabel(entry.title))
                        : w.editLabel(entry.title),
                    flag: index === 0,
                    onSelect: () => undefined,
                  },
                ]}
              />
              <span className="font-display text-sm text-violet">{entry.year}</span>
              <h3 className="mt-1 mb-2 font-display text-lg uppercase">{entry.title}</h3>
              <p className="text-muted-foreground">{entry.text}</p>
            </li>
          ))}
        </ul>
      </ActionBarList>
    </div>
  );
}

/** A single block's chip on each ground it meets, with and without the flag. */
function Chips({ lang }: { lang: Lang }) {
  const w = WORDS[lang];
  const chip = (flag: boolean, word = w.edit, surface: "page" | "stage" = "page") => (
    <ActionBar
      look="chip"
      label={word}
      main="edit"
      surface={surface}
      actions={[
        {
          id: "edit",
          icon: Pencil,
          word,
          label: flag ? w.missingGerman(w.editLabel("Hero")) : w.editLabel("Hero"),
          flag,
          onSelect: () => undefined,
        },
      ]}
    />
  );
  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex gap-3 rounded-md bg-ground p-5">
        {chip(false)}
        {chip(true)}
      </div>
      <div className="flex gap-3 rounded-md bg-yellow p-5">
        {chip(false)}
        {chip(true)}
      </div>
      <div className="flex gap-3 rounded-md bg-stage p-5">
        {chip(false, w.editSite, "stage")}
        {chip(true, w.edit, "stage")}
      </div>
    </div>
  );
}

const LINES = [
  { id: "phone", name: "Téléphone" },
  { id: "whatsapp", name: "WhatsApp" },
  { id: "email", name: "E-mail" },
];

/** The lines inside an editor panel: a quiet row bar, ↑ ↓ ⋯. */
function EditorLines({ lang }: { lang: Lang }) {
  const w = WORDS[lang];
  const [lines, setLines] = useState(LINES);
  const moves = useListMoves({
    keys: lines.map((line) => line.id),
    onMove: (key, to) => setLines((list) => reorder(list, key, to)),
    announce: (key, position, of) =>
      w.moved(lines.find((line) => line.id === key)?.name ?? key, position, of),
  });
  return (
    <div className="max-w-[25rem] border-l-3 border-ink bg-white px-5 py-4">
      <ActionBarList stacked>
        <ul className="grid gap-3.5">
          {lines.map((line) => (
            <li
              key={line.id}
              ref={moves.itemRef(line.id)}
              className="grid gap-3 rounded-2xl border-3 border-ink bg-white px-3.5 pt-3 pb-4"
            >
              <div className="flex items-center justify-between gap-3 font-extrabold">
                {line.name}
                <ActionBar
                  look="row"
                  label={line.name}
                  actions={[
                    moves.moveAction(line.id, "before", {
                      label: w.upLabel(line.name),
                      word: w.up,
                    }),
                    moves.moveAction(line.id, "after", {
                      label: w.downLabel(line.name),
                      word: w.down,
                    }),
                    {
                      id: "more",
                      label: w.moreLabel(line.name),
                      menu: [
                        {
                          id: "delete",
                          label: w.deleteLine,
                          icon: Trash2,
                          destructive: true,
                          onSelect: () =>
                            setLines((list) => list.filter((other) => other.id !== line.id)),
                        },
                      ],
                    },
                  ]}
                />
              </div>
              <div className="h-11 rounded-lg border border-line" />
            </li>
          ))}
        </ul>
      </ActionBarList>
      {moves.liveRegion}
    </div>
  );
}

function Frame({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="grid gap-2">
      <figcaption className="text-sm font-bold">{caption}</figcaption>
      {/* Frames keep the site's real widths, so a narrow screen scrolls them sideways. */}
      <div className="max-w-full overflow-x-auto">{children}</div>
    </figure>
  );
}

export function ActionBarShowcase() {
  return (
    <div className="grid gap-12">
      {(["fr", "de"] as const).map((lang) => (
        <div key={lang} lang={lang === "fr" ? "fr-CH" : "de-CH"} className="grid gap-6">
          <h3 className="font-display text-xl">{lang === "fr" ? "Français" : "Deutsch"}</h3>
          <Frame caption="Bande d’accueil à 1024px : quatre cartes de 237px, ← → ⋯ ✎">
            <div className="w-[1056px]">
              <CardBand lang={lang} tile={237} columns={4} tilt yellow />
            </div>
          </Frame>
          <Frame caption="Bande d’accueil à 1280px : cartes de 270px">
            <div className="w-[1188px]">
              <CardBand lang={lang} tile={270} columns={4} tilt yellow />
            </div>
          </Frame>
          <Frame caption="Deux colonnes à 640px : cartes de 299px">
            <div className="w-[666px]">
              <CardBand lang={lang} tile={299} columns={2} />
            </div>
          </Frame>
          <Frame caption="Téléphone à 390px : une colonne, les flèches montent et descendent">
            <div className="w-full max-w-[390px]">
              <CardBand lang={lang} tile={310} columns={1} count={3} yellow />
            </div>
          </Frame>
          <Frame caption="Entrées d’historique : ⋯ ✎, l’ordre suit les années">
            <HistoryEntries lang={lang} columns={2} />
          </Frame>
          <Frame caption="Chip d’un bloc seul, sur la crème, la bande jaune et la scène">
            <Chips lang={lang} />
          </Frame>
          <Frame caption="Lignes dans un éditeur : barre discrète ↑ ↓ ⋯">
            <EditorLines lang={lang} />
          </Frame>
        </div>
      ))}
    </div>
  );
}
