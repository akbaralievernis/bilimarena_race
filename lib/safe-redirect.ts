/**
 * Accepts only same-site relative paths ("/create", "/race/…") for post-login
 * redirects, so a crafted ?next= link cannot send users to another origin.
 */
export function safeNextPath(value: unknown, fallback = "/create"): string {
  if (typeof value !== "string" || value === "") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
