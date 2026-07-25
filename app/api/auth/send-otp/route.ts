// DISABLED (out of scope for v1) — see AGENT_CONTRACT.md
//
// Why this is off rather than deleted:
//   1. It never sent a real OTP. It generated a random code and only logged it
//      to the server console, so nobody could ever receive one.
//   2. It stored codes in an in-process `Map`, which cannot work on Vercel —
//      each serverless invocation gets its own memory, so the verify call would
//      almost always land in a lambda that had never seen the code.
//   3. It validated Indian mobile numbers (/^[6-9]\d{9}$/), not Pakistani ones.
//
// Re-enabling this needs a real SMS provider (Twilio or a local Pakistani
// gateway) plus shared storage for the codes (a MongoDB collection with a TTL
// index). Password login at /api/auth/login is the supported path for now.
//
// The original implementation is preserved below for reference.

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      message:
        "OTP login is not enabled yet. Please sign in with your mobile number and password.",
    },
    { status: 501 },
  )
}

/* ---------------------------------------------------------------------------
Original (non-functional) implementation:

const otpStorage = new Map<string, { otp: string; expires: number; attempts: number }>()

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { mobile } = body

    if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
      return NextResponse.json(
        { success: false, error: "Invalid mobile number" },
        { status: 400 }
      )
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expires = Date.now() + 5 * 60 * 1000

    otpStorage.set(mobile, { otp, expires, attempts: 0 })

    await new Promise(resolve => setTimeout(resolve, 1000))

    console.log(`OTP for ${mobile}: ${otp}`)

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully",
      data: { mobile, expiresIn: 300 }
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to send OTP" },
      { status: 500 }
    )
  }
}
--------------------------------------------------------------------------- */
