import { expect } from "vitest";

/**
 * Test helpers shared by the server-action suites in this directory.
 *
 * Not a `.test.ts` file on purpose — vitest's `include` only picks up
 * `*.{test,spec}.*`, so this is importable from those suites without being
 * collected (and failing) as a suite with no tests of its own.
 */

/** A minimal stand-in for a PostgREST response. */
export type QueryResult = { data?: unknown; error?: unknown };

/** The shape a mocked Supabase client's `from` is assigned in these suites. */
export type FromStub = (...args: unknown[]) => unknown;

/**
 * A chainable stub shaped like a PostgREST query builder.
 *
 * Every filter/modifier returns the same object and the object is a thenable,
 * so it resolves to `result` whether the code under test awaits after `.eq()`
 * (the pre-fix shape) or after `.select("id")` (the post-fix shape). That
 * matters here: these tests have to be able to *fail* against the current
 * code, which means the stub cannot assume the fix is already in place.
 */
export function queryBuilder(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  const settled = Promise.resolve(result);

  for (const method of ["select", "update", "insert", "eq", "is", "in", "order"]) {
    chain[method] = () => chain;
  }
  chain.single = () => settled;
  chain.maybeSingle = () => settled;
  chain.then = (onFulfilled: unknown, onRejected: unknown) =>
    settled.then(onFulfilled as never, onRejected as never);

  return chain;
}

/**
 * Drains queued results in call order, so a single mocked client can answer
 * several different queries in one action (e.g. updateTeam's permission read
 * followed by its write).
 */
export function queuedFrom(results: QueryResult[]): FromStub {
  const pending = [...results];
  return () => queryBuilder(pending.shift() ?? { data: [], error: null });
}

/**
 * `redirect()` from next/navigation does not return — it throws an Error
 * carrying `digest = "NEXT_REDIRECT;<type>;<url>;<status>;"`
 * (node_modules/next/dist/client/components/redirect.js). So an action whose
 * success path redirects can't be asserted with `.resolves`, and a bare
 * `.rejects.toThrow()` would pass just as happily for a genuine crash.
 *
 * Rethrowing when the digest is absent is what keeps this honest.
 *
 * Credit: QA (draft-house-51) supplied this pattern.
 */
export async function captureRedirect(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    const digest = (error as { digest?: string }).digest;
    if (!digest?.startsWith("NEXT_REDIRECT")) throw error;
    return digest.split(";")[2];
  }
}

/** Asserts an action redirected to `url` rather than returning or crashing. */
export async function expectRedirect(promise: Promise<unknown>, url: string) {
  expect(await captureRedirect(promise)).toBe(url);
}
