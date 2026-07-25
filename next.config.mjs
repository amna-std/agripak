/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // The project type-checks cleanly, so let a type error fail the build
    // rather than ship broken code. (The template shipped with this set to
    // `true`, which hid 423 errors — including a syntax error in the
    // marketplace page and illegal non-default exports from a page module.)
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  // NOTE: the old `/api/:path*` rewrite to http://localhost:3001 has been
  // removed. The API is now served in-process by App Router route handlers
  // under app/api/**, which is what Vercel deploys as serverless functions.
  // Keeping the rewrite would have proxied any unmatched /api call to a
  // localhost Express server that does not exist in production.
}

export default nextConfig
