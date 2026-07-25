// DISABLED (out of scope for v1) — see AGENT_CONTRACT.md
//
// Paired with /api/auth/send-otp, which is also disabled. This handler read
// from its own in-process `Map`, so on Vercel it would look for the code in a
// different lambda's memory than the one that generated it and almost always
// report "OTP not found or expired".
//
// Re-enabling needs a real SMS provider plus shared storage (a MongoDB
// collection with a TTL index) rather than module-level state.
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
    const { mobile, otp } = body

    if (!mobile || !otp) {
      return NextResponse.json(
        { success: false, error: "Mobile number and OTP are required" },
        { status: 400 }
      )
    }

    const storedData = otpStorage.get(mobile)

    if (!storedData) {
      return NextResponse.json(
        { success: false, error: "OTP not found or expired" },
        { status: 400 }
      )
    }

    if (Date.now() > storedData.expires) {
      otpStorage.delete(mobile)
      return NextResponse.json(
        { success: false, error: "OTP has expired" },
        { status: 400 }
      )
    }

    if (storedData.attempts >= 3) {
      otpStorage.delete(mobile)
      return NextResponse.json(
        { success: false, error: "Too many attempts. Please request a new OTP" },
        { status: 400 }
      )
    }

    if (storedData.otp !== otp) {
      storedData.attempts++
      return NextResponse.json(
        { success: false, error: "Invalid OTP" },
        { status: 400 }
      )
    }

    otpStorage.delete(mobile)

    return NextResponse.json({
      success: true,
      message: "OTP verified successfully",
      data: { mobile, verified: true }
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to verify OTP" },
      { status: 500 }
    )
  }
}
--------------------------------------------------------------------------- */
