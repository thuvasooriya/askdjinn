/**
 * Toast notification store: unified error/success/warning/info reporting.
 * Uses svelte-sonner under the hood. Import { toasts } anywhere and call
 * toasts.error(), toasts.success(), etc.
 */

import { toast as sonnerToast } from "svelte-sonner";

export type ToastVariant = "success" | "error" | "warning" | "info";

export function toast(message: string, variant: ToastVariant = "info") {
  switch (variant) {
    case "success": sonnerToast.success(message); break;
    case "error": sonnerToast.error(message); break;
    case "warning": sonnerToast.warning(message); break;
    default: sonnerToast.info(message); break;
  }
}

export const toasts = {
  success: (msg: string) => sonnerToast.success(msg),
  error: (msg: string) => sonnerToast.error(msg),
  warning: (msg: string) => sonnerToast.warning(msg),
  info: (msg: string) => sonnerToast.info(msg),

  /** Handle an unknown error safely -- extracts message, logs, and shows toast */
  fromError: (err: unknown, fallback = "Something went wrong") => {
    const msg = err instanceof Error ? err.message : typeof err === "string" ? err : fallback;
    console.error("[djinn]", err);
    sonnerToast.error(msg);
    return msg;
  },

  /** Handle a failed fetch with status code awareness */
  fromFetchError: async (res: Response, fallback = "Request failed") => {
    let msg = fallback;
    try {
      const data = await res.json();
      msg = data.error ?? data.message ?? fallback;
    } catch { /* use fallback */ }
    if (res.status === 429) msg = "Too many requests. Please wait a moment.";
    else if (res.status === 503) msg = "Service unavailable. Please try again later.";
    sonnerToast.error(msg);
    return msg;
  },
};
