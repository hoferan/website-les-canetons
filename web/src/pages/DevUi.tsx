import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@ds";
import { DialogFooter } from "@/components/ui/dialog";
import { FormActions } from "@/components/ui/form-actions";
import { IconButton } from "@/components/ui/icon-button";
import { Indicator } from "@/components/ui/indicator";
import { notify, ToastCard, type ToastLevel } from "@/components/ui/toast";

import { PageSection } from "../components/PageSection";
import { EditChip } from "../content/editor/EditChip";

// A developer page, mounted only under `import.meta.env.DEV` (routes.tsx).
// Its copy is French and written inline on purpose: it never reaches a visitor,
// so it has no catalogue keys.

const VARIANTS = ["primary", "secondary", "danger", "quiet", "accent"] as const;
const SIZES = ["default", "sm"] as const;
const INDICATOR_COLORS = ["cyan", "pink", "lime", "yellow", "violet", "danger", "ink"] as const;
const INDICATOR_SIZES = ["sm", "md", "lg"] as const;
const LEVELS: Array<{ level: ToastLevel; message: string; frozenAt?: number }> = [
  { level: "success", message: "Texte enregistré.", frozenAt: 0.65 },
  { level: "info", message: "Une version plus récente de la page a été chargée.", frozenAt: 0.3 },
  { level: "warning", message: "Le contenu est rétabli, mais pas sa photo. Placez-la à nouveau." },
  { level: "error", message: "Votre réponse n’a pas pu être enregistrée." },
];
const UNDO = { label: "Annuler", icon: Undo2, onClick: () => undefined };
const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
const OFFSETS = [
  { x: -4, y: 4 },
  { x: -8, y: 8 },
  { x: 4, y: -4 },
];

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl">{title}</h2>
      {note ? <p className="mt-1 text-sm text-muted-foreground">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stage({ children }: { children: ReactNode }) {
  return <div className="rounded-xl bg-stage p-6 text-white">{children}</div>;
}

export function DevUi() {
  return (
    <PageSection>
      <h1 className="font-display text-4xl">Catalogue des composants</h1>
      <p className="mt-2 max-w-text text-muted-foreground">
        Les boutons tels que le site les rend, sans mise en page propre. Page de développement :
        elle n&apos;existe pas dans le build de production.
      </p>

      <Block
        title="Variantes et tailles"
        note="Chaque variante en taille par défaut et sm, puis la même rangée désactivée (aria-disabled), puis un bouton en cours d'envoi."
      >
        <div className="grid gap-6">
          {[false, true].map((disabled) => (
            <div key={String(disabled)} className="flex flex-wrap items-center gap-3">
              {VARIANTS.flatMap((variant) =>
                SIZES.map((size) => (
                  <Button
                    key={`${variant}-${size}`}
                    variant={variant}
                    size={size}
                    aria-disabled={disabled || undefined}
                  >
                    {variant} {size}
                  </Button>
                )),
              )}
            </div>
          ))}
          {/* Pending is aria-disabled plus a pending word, as in BlockEditor's Save. */}
          <div className="flex flex-wrap items-center gap-3">
            <Button aria-disabled>Enregistrement…</Button>
          </div>
        </div>
      </Block>

      <Block
        title="Icône et mot"
        note="Deuxième niveau de l'ADR 0025 : le mot reste, l'icône le précède."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary">
            <Plus aria-hidden="true" />
            Ajouter
          </Button>
          <Button variant="danger">
            <Trash2 aria-hidden="true" />
            Supprimer
          </Button>
          <Button variant="secondary" size="sm">
            <Plus aria-hidden="true" />
            Ajouter
          </Button>
        </div>
      </Block>

      <Block
        title="Icône seule, étiquette au survol (tip)"
        note="Pour une rangée de liste. Une étiquette est ouverte ; les autres s'ouvrent au survol ou au clavier."
      >
        <ul className="grid max-w-md gap-3">
          {[
            { name: "Cloches", open: true },
            { name: "Trompettes", open: false },
          ].map(({ name, open }) => (
            <li
              key={name}
              className="flex items-center justify-between gap-3 rounded-xl border-3 border-ink bg-white p-3 pt-10"
            >
              <span className="font-bold">{name}</span>
              <span className="flex gap-2">
                <IconButton icon={ArrowUp} label={`Monter ${name}`} word="Monter" showWord={open} />
                <IconButton icon={ArrowDown} label={`Descendre ${name}`} word="Descendre" />
                <IconButton
                  icon={Trash2}
                  label={`Supprimer ${name}`}
                  word="Supprimer"
                  variant="danger"
                />
              </span>
            </li>
          ))}
        </ul>
      </Block>

      <Block
        title="Icône seule, puce qui s'ouvre (grow)"
        note="Sur le fond sombre. La première puce montre son mot, la seconde est fermée."
      >
        <Stage>
          <div className="flex flex-wrap items-center gap-4">
            <IconButton
              icon={Pencil}
              label="Modifier le bloc"
              word="Modifier"
              mode="grow"
              variant="accent"
              surface="stage"
              showWord
            />
            <IconButton
              icon={Pencil}
              label="Modifier le titre"
              word="Modifier"
              mode="grow"
              variant="accent"
              surface="stage"
            />
          </div>
        </Stage>
        <p className="mt-4 text-sm text-muted-foreground">
          EditChip, en haut à droite d&apos;un bloc (il montre son mot au survol) :
        </p>
        <div className="relative mt-2 min-h-24 rounded-xl border-3 border-dashed border-ink bg-white p-4 pt-14">
          Un bloc éditable.
          <EditChip label="Bloc d'essai" onClick={() => undefined} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Le même, sur un bloc dont un texte n'a pas d'allemand (le point) :
        </p>
        <div className="relative mt-2 min-h-24 rounded-xl border-3 border-dashed border-ink bg-white p-4 pt-14">
          Un bloc sans allemand.
          <EditChip label="Bloc sans allemand" missingGerman onClick={() => undefined} />
        </div>
      </Block>

      <Block
        title="Indicator"
        note="Un point ou un petit nombre posé sur un coin de n'importe quel élément. Le sens vit dans le nom de l'hôte : le point est masqué aux lecteurs d'écran."
      >
        <div className="grid gap-8">
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              Couleurs, taille md, sur le coin, anneau encre
            </p>
            <div className="flex flex-wrap items-center gap-5">
              {INDICATOR_COLORS.map((color) => (
                <Indicator key={color} color={color}>
                  <IconButton icon={Pencil} label={color} mode="grow" variant="accent" />
                </Indicator>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              Tailles sm, md, lg, puis anneau blanc et sans anneau
            </p>
            <div className="flex flex-wrap items-center gap-5">
              {INDICATOR_SIZES.map((size) => (
                <Indicator key={size} size={size}>
                  <IconButton icon={Pencil} label={size} mode="grow" variant="accent" />
                </Indicator>
              ))}
              <Indicator ring="white" color="danger">
                <IconButton icon={Pencil} label="anneau blanc" mode="grow" variant="accent" />
              </Indicator>
              <Indicator ring="none" color="ink">
                <IconButton icon={Pencil} label="sans anneau" mode="grow" variant="accent" />
              </Indicator>
            </div>
          </div>
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              Les quatre coins, toujours centré sur le coin ; puis un décalage (offset, en px : x
              vers la droite, y vers le bas) depuis le coin en haut à droite
            </p>
            <div className="flex flex-wrap items-center gap-6">
              {CORNERS.map((position) => (
                <Indicator key={position} position={position}>
                  <span className="flex h-14 w-24 items-center justify-center rounded-lg border-3 border-ink bg-white text-xs">
                    {position}
                  </span>
                </Indicator>
              ))}
              {OFFSETS.map((offset) => (
                <Indicator key={`${offset.x},${offset.y}`} offset={offset}>
                  <span className="flex h-14 w-24 items-center justify-center rounded-lg border-3 border-ink bg-white text-xs">
                    x {offset.x}, y {offset.y}
                  </span>
                </Indicator>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              Un nombre : 3, 12, 120 (plafonné à 99+), en sm, md et lg
            </p>
            <div className="flex flex-wrap items-center gap-6">
              {INDICATOR_SIZES.flatMap((size) =>
                [3, 12, 120].map((count) => (
                  <Indicator
                    key={size + count}
                    count={count}
                    size={size}
                    color="danger"
                    ring="white"
                  >
                    <Button variant="secondary" size="sm">
                      Boîte
                    </Button>
                  </Indicator>
                )),
              )}
            </div>
          </div>
        </div>
      </Block>

      <Block title="Appel à l'action sur le fond sombre">
        <Stage>
          <div className="flex flex-wrap gap-3">
            <Button variant="accent" surface="stage">
              Nous rejoindre
            </Button>
            <Button variant="secondary" surface="stage">
              Nous contacter
            </Button>
          </div>
        </Stage>
      </Block>

      <Block
        title="Pied de formulaire"
        note="Enregistrer d'abord et à gauche, puis Annuler, puis l'action discrète au bout. Jamais de jaune."
      >
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-bold">Dans une boîte de dialogue</p>
            {/* Mirrors DialogContent's frame by hand: the real one is a portal. */}
            <div className="grid gap-4 rounded-lg border bg-background p-4 shadow-lg sm:p-6">
              <div>
                <p className="text-lg font-semibold">Modifier le pupitre</p>
                <p className="text-sm text-muted-foreground">Une boîte rendue à plat.</p>
              </div>
              <DialogFooter>
                <Button>Enregistrer</Button>
                <Button variant="secondary">Annuler</Button>
                <Button variant="quiet">Réinitialiser</Button>
              </DialogFooter>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold">Dans une page</p>
            <form
              className="grid gap-4 rounded-xl border-3 border-ink bg-white p-4"
              onSubmit={(event) => event.preventDefault()}
            >
              <label className="grid gap-1 text-sm font-bold">
                Nom
                <input className="min-h-touch rounded-md border px-3 font-normal" />
              </label>
              <FormActions>
                <Button type="submit">Enregistrer</Button>
                <Button type="button" variant="secondary">
                  Annuler
                </Button>
                <Button type="button" variant="quiet">
                  Réinitialiser
                </Button>
              </FormActions>
            </form>
          </div>
        </div>
      </Block>
      <Block
        title="Toasts"
        note="ADR 0042. La colonne dit le niveau et se vide en haut tant que le temps passe : 5 s sans action, 10 s avec une action. Un avertissement et une erreur restent jusqu'à fermeture. Les cartes ci-dessous sont figées ; les boutons lèvent de vrais toasts, dont l'horloge s'arrête au survol et au focus."
      >
        <div className="grid max-w-[380px] gap-5">
          {LEVELS.map(({ level, message, frozenAt }) => (
            <ToastCard
              key={level}
              level={level}
              message={message}
              frozenAt={frozenAt}
              onClose={() => undefined}
            />
          ))}
          <ToastCard
            level="success"
            message="Modifié"
            action={UNDO}
            frozenAt={0.8}
            onClose={() => undefined}
          />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          {LEVELS.map(({ level, message }) => (
            <Button key={level} variant="secondary" onClick={() => notify[level](message)}>
              {level}
            </Button>
          ))}
          <Button variant="secondary" onClick={() => notify.success("Modifié", { action: UNDO })}>
            success + action
          </Button>
        </div>
      </Block>
    </PageSection>
  );
}
