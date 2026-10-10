/**
 * Result of a Server Action. Actions return errors instead of throwing, so the
 * client can show them next to the form; they return `redirectTo` instead of
 * calling redirect(), so the client can keep the form locked until navigation
 * and still tell a network failure apart from a server answer.
 */
export type ActionResult<Field extends string = string> =
  | { ok: true; redirectTo?: string; message?: string }
  | { ok: false; message?: string; fieldErrors?: Partial<Record<Field, string>> };
