import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { getTextIndexQueryKey, useTextUpdate } from "../api/generated/endpoints";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField } from "../components/FormField";
import { t, type TranslationKey } from "../i18n";
import { catalogueValue, storedText } from "../i18n/overrides";

type Props = {
  k: TranslationKey;
  label: string;
  neutral: boolean;
  multiline: boolean;
  validate?: ((value: string) => string | null) | undefined;
  onClose: () => void;
};

/**
 * The French and German of one text, or a single field for a text that is
 * the same in both (a number, a name, a link).
 *
 * Opens on the wording the page shows now. Saving the original unchanged
 * stores nothing, so a look inside never pins today's catalogue wording over a
 * later correction in the code. "Rétablir le texte d'origine" does the same on
 * purpose, whatever is in the fields.
 */
export function TextDialog({ k, label, neutral, multiline, validate, onClose }: Props) {
  const queryClient = useQueryClient();
  const stored = storedText(k);
  const frDefault = catalogueValue("fr", k) ?? "";
  const deDefault = catalogueValue("de-CH", k) ?? "";

  const [french, setFrench] = useState(stored?.fr ?? frDefault);
  const [german, setGerman] = useState(stored?.de ?? deDefault);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const { error, setFromThrown, messageFor } = useApiFormError(t("texts.saveFailed"));

  const update = useTextUpdate({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getTextIndexQueryKey() });
        onClose();
      },
      onError: setFromThrown,
    },
  });

  const save = (fr: string | null, de: string | null) => {
    if (update.isPending) return;
    update.mutate({ key: k, data: { fr, de } });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const fr = french.trim() === "" ? null : french;
    if (fr !== null && validate) {
      const refusal = validate(fr);
      setProblem(refusal ?? undefined);
      if (refusal) return;
    }
    if (neutral) {
      save(fr === frDefault ? null : fr, fr === frDefault ? null : fr);
      return;
    }
    const de = german.trim() === "" ? null : german;
    if (fr === frDefault && de === deDefault) {
      save(null, null);
      return;
    }
    save(fr, de);
  };

  const as = multiline ? "textarea" : "input";

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{t("texts.title")}</DialogTitle>
            <DialogDescription>{label}</DialogDescription>
          </DialogHeader>

          <div className="mt-related space-y-4">
            <FormField
              id={`text-${k}-fr`}
              label={neutral ? t("texts.single") : t("texts.french")}
              value={french}
              onChange={setFrench}
              as={as}
              maxLength={2000}
              problem={problem ?? messageFor("fr")}
              hint={multiline ? t("texts.multilineHint") : undefined}
            />
            {neutral ? null : (
              <FormField
                id={`text-${k}-de`}
                label={t("texts.german")}
                value={german}
                onChange={setGerman}
                as={as}
                maxLength={2000}
                problem={messageFor("de")}
              />
            )}
          </div>

          <FormError error={error} />

          <div className="mt-block flex flex-wrap justify-end gap-2">
            {stored ? (
              <Button
                type="button"
                variant="ghost"
                aria-disabled={update.isPending}
                onClick={() => save(null, null)}
              >
                <RotateCcw aria-hidden="true" />
                {t("texts.reset")}
              </Button>
            ) : null}
            <Button type="button" variant="raised-light" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="raised" aria-disabled={update.isPending}>
              {t("texts.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
