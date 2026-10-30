import { useEffect, useState } from "react";
import { api } from "@/api/client";
import type { FamilyMemberDetail } from "@/api/types";

export interface VisitorMemories {
  /** Detail for exactly the requested person, or null. */
  data: FamilyMemberDetail | null;
  loading: boolean;
  error: boolean;
}

const NONE: VisitorMemories = { data: null, loading: false, error: false };

/**
 * Fuller memories (and family photos) for the visitor the camera has
 * CONFIRMED — pass null for anything else (uncertain, unknown, nobody).
 *
 * A late answer can never land on the wrong person. Three independent guards:
 *  1. switching person aborts the previous request;
 *  2. a response is accepted only if it is still the current request AND
 *     its person id matches the one asked for;
 *  3. the hook only returns data stored for the person it is called with,
 *     so on the very render where the visitor changes, the old visitor's
 *     memories are already gone — before any effect has run.
 */
export function useVisitorMemories(personId: string | null): VisitorMemories {
  const [state, setState] = useState<VisitorMemories & { for: string | null }>({ ...NONE, for: null });

  useEffect(() => {
    if (!personId) {
      setState({ ...NONE, for: null });
      return;
    }
    const controller = new AbortController();
    let current = true;
    setState({ data: null, loading: true, error: false, for: personId });
    api
      .familyMember(personId, controller.signal)
      .then((detail) => {
        if (!current || detail.person.id !== personId) return;
        setState({ data: detail, loading: false, error: false, for: personId });
      })
      .catch((err: Error) => {
        if (!current || err.name === "AbortError") return;
        setState({ data: null, loading: false, error: true, for: personId });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [personId]);

  if (!personId || state.for !== personId) return personId ? { ...NONE, loading: true } : NONE;
  return { data: state.data, loading: state.loading, error: state.error };
}
