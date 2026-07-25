import jwt from "jsonwebtoken"
import { connectDB } from "@/lib/db"
import User from "@/lib/models/User"

/**
 * Auth utilities for Next.js API routes — the serverless replacement for the
 * old Express `middleware/auth.js`.
 */

const JWT_SECRET = process.env.JWT_SECRET

function secret(): string {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not set. Add it to .env.local (local) or the Vercel project env vars.")
  }
  return JWT_SECRET
}

export interface TokenPayload {
  userId: string
  role?: string
}

export function signToken(payload: TokenPayload, expiresIn = "30d"): string {
  return jwt.sign(payload, secret(), { expiresIn } as jwt.SignOptions)
}

/** Extracts the bearer token from an `Authorization` header. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization")
  if (!header?.startsWith("Bearer ")) return null
  const token = header.slice(7).trim()
  return token || null
}

export type AuthResult =
  | { ok: true; user: any; userId: string; role: string }
  | { ok: false; status: number; message: string }

/**
 * Verifies the request's JWT and loads the user.
 *
 * Returns a result object rather than throwing so route handlers can decide
 * whether the endpoint is strictly protected or merely personalised.
 */
export async function authenticate(req: Request): Promise<AuthResult> {
  const token = bearerToken(req)
  if (!token) {
    return { ok: false, status: 401, message: "Access denied. No token provided." }
  }

  let decoded: TokenPayload
  try {
    decoded = jwt.verify(token, secret()) as TokenPayload
  } catch (error: any) {
    if (error?.name === "TokenExpiredError") {
      return { ok: false, status: 401, message: "Token expired." }
    }
    return { ok: false, status: 401, message: "Invalid token." }
  }

  await connectDB()
  const user = await User.findById(decoded.userId).select("-password")

  if (!user || user.isActive === false) {
    return { ok: false, status: 401, message: "Invalid token. User not found or inactive." }
  }

  return { ok: true, user, userId: String(user._id), role: decoded.role || user.role }
}

/** True when the authenticated user holds one of the given roles. */
export function hasRole(auth: AuthResult, ...roles: string[]): boolean {
  return auth.ok && roles.includes(auth.role)
}
