import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  reload: () => void;
  setData: (updater: T | undefined | ((prev: T | undefined) => T | undefined)) => void;
}

/**
 * Run an async loader on mount (and whenever `deps` change), tracking
 * loading/error state. Results from a superseded run are ignored, so a slow
 * earlier response can never overwrite a newer one.
 *
 * Data is remembered together with the deps it was loaded for: when the deps
 * change (say, /family/A → /family/B), the old data disappears on that same
 * render instead of showing under the new address until the new answer
 * arrives. reload() keeps the current data on screen while refreshing.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const key = JSON.stringify(deps);
  const [state, setState] = useState<{ key: string; value: T | undefined }>({ key, value: undefined });
  const [failure, setFailure] = useState<{ key: string; error: Error } | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const runId = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const id = ++runId.current;
    setLoading(true);
    setFailure(null);
    loaderRef
      .current()
      .then((result) => {
        if (id === runId.current) setState({ key, value: result });
      })
      .catch((err: Error) => {
        if (id === runId.current) setFailure({ key, error: err });
      })
      .finally(() => {
        if (id === runId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback(
    (updater: T | undefined | ((prev: T | undefined) => T | undefined)) => {
      setState((prev) => {
        const current = prev.key === key ? prev.value : undefined;
        const value = typeof updater === "function" ? (updater as (p: T | undefined) => T | undefined)(current) : updater;
        return { key, value };
      });
    },
    [key],
  );

  const current = state.key === key;
  return {
    data: current ? state.value : undefined,
    error: failure?.key === key ? failure.error : null,
    // A new key with no answer yet is loading, even before the effect has run.
    loading: loading || (!current && failure?.key !== key),
    reload,
    setData,
  };
}
