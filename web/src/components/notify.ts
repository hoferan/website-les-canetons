import { dismissToast, raiseToast, type ToastAction, type ToastLevel } from "@ds";

import { t } from "../i18n";

/**
 * How the app raises a toast (ADR 0042): the design system's toast stack, with
 * the close button named in the page's language. Call sites use `notify` and
 * never sonner's `toast`, which an ESLint rule enforces.
 */

type NotifyOptions = {
  /** Raising a toast under the id of one on screen replaces it. */
  id?: string;
  action?: ToastAction;
};

function raise(level: ToastLevel, message: string, options: NotifyOptions = {}) {
  return raiseToast(level, message, { ...options, closeLabel: t("toast.close") });
}

export const notify = {
  success: (message: string, options?: NotifyOptions) => raise("success", message, options),
  info: (message: string, options?: NotifyOptions) => raise("info", message, options),
  warning: (message: string, options?: NotifyOptions) => raise("warning", message, options),
  error: (message: string, options?: NotifyOptions) => raise("error", message, options),
  /** Closes one toast, or every toast when no id is given. */
  dismiss: (id?: string | number) => dismissToast(id),
};
