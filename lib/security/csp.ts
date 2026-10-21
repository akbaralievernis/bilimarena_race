/*
 * Content Security Policy for the race pages (set per request in proxy.ts).
 * Scripts run only with this request's nonce — Next.js adds it to its own
 * scripts — so an injected <script> or inline handler does nothing. Styles
 * allow inline attributes: team colours and progress bars are style={…}.
 * The browser may talk only to this site and the race's Supabase project.
 */

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp({ nonce, supabaseUrl, dev }: { nonce: string; supabaseUrl: string; dev: boolean }): string {
  let supabase = "";
  try {
    const url = new URL(supabaseUrl);
    supabase = ` ${url.origin} ${url.protocol === "http:" ? "ws:" : "wss:"}//${url.host}`;
  } catch {
    // Not configured: the pages show the setup notice and talk to nothing else.
  }
  return [
    "default-src 'self'",
    // React needs eval only for dev-mode error stacks (Next.js docs).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${supabase}${dev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
