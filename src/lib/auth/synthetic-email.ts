/**
 * Draft House uses username + password only — no real email is ever
 * collected. Supabase Auth requires an email identifier internally, so
 * signup maps the username to a synthetic, non-contact address.
 * See docs/DATABASE.md#1-users.
 *
 * Domain is `.invalid`, not `.internal`: RFC 2606 reserves `.invalid`
 * for exactly this "guaranteed not a real domain" use. `.internal` is a
 * *different* reserved TLD (RFC 9476, non-routable internal namespaces),
 * and Supabase Auth's email validator rejects it outright with
 * "Email address ... is invalid" before signup ever reaches our code.
 */

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export function toAuthEmail(username: string): string {
  if (!isValidUsername(username)) {
    throw new Error(
      "Username must be 3-20 characters: lowercase letters, numbers, or underscores."
    );
  }
  return `${username}@drafthouse.invalid`;
}
