import { NextResponse } from "next/server"

/**
 * Shared helpers for Next.js App Router API routes.
 *
 * The response shape is deliberately identical to the old Express API
 * (`{ success, message, ... }`) so the existing frontend keeps working.
 */

export function ok(data: Record<string, any> = {}, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status })
}

export function fail(message: string, status = 400, extra: Record<string, any> = {}) {
  return NextResponse.json({ success: false, message, ...extra }, { status })
}

/**
 * Wraps a route handler so an unexpected throw becomes a clean 500 instead of
 * an opaque Vercel function crash.
 */
export function handler<T extends any[]>(
  fn: (...args: T) => Promise<Response>,
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      return await fn(...args)
    } catch (error: any) {
      console.error("API route error:", error)
      const isDev = process.env.NODE_ENV === "development"
      return fail(isDev ? error?.message || "Internal server error" : "Internal server error", 500)
    }
  }
}

/** Parses a JSON body, returning `{}` rather than throwing on empty/invalid input. */
export async function readJson(req: Request): Promise<Record<string, any>> {
  try {
    return (await req.json()) ?? {}
  } catch {
    return {}
  }
}

/** Reads querystring params from a request URL. */
export function searchParams(req: Request): URLSearchParams {
  return new URL(req.url).searchParams
}
