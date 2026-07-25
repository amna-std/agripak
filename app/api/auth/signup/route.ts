import { POST as register } from "../register/route"

export const dynamic = "force-dynamic"

/**
 * POST /api/auth/signup — alias of `/api/auth/register`.
 *
 * Kept because the existing signup form posts here. Both paths run the same
 * handler, so there is only ever one registration implementation.
 */
export const POST = register
