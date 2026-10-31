import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { AccountInfo } from "@/api/types";

/**
 * Whether this deployment gives visitors their own sandbox accounts, and the
 * signed-in visitor's account. null while loading or on an error (treated
 * as the household mode, which needs no extra UI).
 */
export function useSandbox(): { sandbox: boolean | null; account: AccountInfo | null } {
  const [state, setState] = useState<{ sandbox: boolean | null; account: AccountInfo | null }>({ sandbox: null, account: null });
  useEffect(() => {
    let live = true;
    api
      .session()
      .then(async (s) => {
        const account = s.sandbox && s.caregiver ? (await api.account().catch(() => null))?.account ?? null : null;
        if (live) setState({ sandbox: Boolean(s.sandbox), account });
      })
      .catch(() => live && setState({ sandbox: false, account: null }));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** "Thursday 6 November" for an account's Unix-seconds timestamp. */
export function formatAccountDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}
