import { act, renderHook, waitFor } from "@testing-library/react";
import { useAsync } from "./useAsync";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("useAsync", () => {
  it("never shows the previous key's data while the new key loads (e.g. Back from /family/B to /family/A)", async () => {
    const pending: Record<string, ReturnType<typeof deferred<string>>> = { a: deferred(), b: deferred() };
    const { result, rerender } = renderHook(({ id }) => useAsync(() => pending[id].promise, [id]), { initialProps: { id: "a" } });
    await act(async () => pending.a.resolve("Sarah's page"));
    expect(result.current.data).toBe("Sarah's page");

    rerender({ id: "b" });
    expect(result.current.data).toBeUndefined(); // not Sarah's page under John's address
    expect(result.current.loading).toBe(true);
    await act(async () => pending.b.resolve("John's page"));
    expect(result.current.data).toBe("John's page");
  });

  it("a late answer for an old key is ignored", async () => {
    const pending: Record<string, ReturnType<typeof deferred<string>>> = { a: deferred(), b: deferred() };
    const { result, rerender } = renderHook(({ id }) => useAsync(() => pending[id].promise, [id]), { initialProps: { id: "a" } });
    rerender({ id: "b" });
    await act(async () => pending.b.resolve("John's page"));
    await act(async () => pending.a.resolve("Sarah's page")); // late
    expect(result.current.data).toBe("John's page");
  });

  it("reload keeps showing the current data until the fresh copy arrives", async () => {
    let n = 0;
    const next = deferred<string>();
    const { result } = renderHook(() => useAsync(() => (n++ === 0 ? Promise.resolve("v1") : next.promise), []));
    await waitFor(() => expect(result.current.data).toBe("v1"));
    act(() => result.current.reload());
    expect(result.current.data).toBe("v1");
    await act(async () => next.resolve("v2"));
    expect(result.current.data).toBe("v2");
  });
});

describe("useAsync errors", () => {
  it("an error belongs to the key that failed", async () => {
    const pending: Record<string, ReturnType<typeof deferred<string>>> = { a: deferred(), b: deferred() };
    const { result, rerender } = renderHook(({ id }) =>
      useAsync(() => (id === "a" ? Promise.reject(new Error("A is down")) : pending[id].promise), [id]), { initialProps: { id: "a" } });
    await waitFor(() => expect(result.current.error?.message).toBe("A is down"));
    expect(result.current.loading).toBe(false);
    rerender({ id: "b" });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);
  });
});
