import mongoose from "mongoose"

/**
 * Serverless-safe MongoDB connection.
 *
 * On Vercel every invocation may run in a fresh (or recycled) lambda. Opening a
 * new connection per request exhausts the Atlas connection pool, so we cache
 * the connection promise on `globalThis` and reuse it across invocations and
 * across Next.js hot reloads in development.
 */

const MONGODB_URI = process.env.MONGODB_URI

interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  // eslint-disable-next-line no-var
  var _mongooseCache: MongooseCache | undefined
}

const cached: MongooseCache = global._mongooseCache ?? { conn: null, promise: null }
global._mongooseCache = cached

export async function connectDB(): Promise<typeof mongoose> {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not set. Add it to .env.local (local) or the Vercel project env vars.")
  }

  if (cached.conn) return cached.conn

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      // Fail fast instead of hanging the lambda until the platform timeout.
      serverSelectionTimeoutMS: 10000,
      // Keep the pool small; many concurrent lambdas each hold their own pool.
      maxPoolSize: 10,
      bufferCommands: false,
    })
  }

  try {
    cached.conn = await cached.promise
  } catch (error) {
    // Reset so the next request retries rather than reusing a rejected promise.
    cached.promise = null
    throw error
  }

  return cached.conn
}

export default connectDB
