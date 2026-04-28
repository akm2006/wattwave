import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { supabase } from "@/lib/supabaseClient";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: Request) {
  try {
    const ip = (request.headers.get("x-forwarded-for") || "127.0.0.1").split(",")[0].trim();
    const now = new Date();

    // 1. Check persistent rate limit in Supabase
    const { data: record, error: fetchError } = await supabase
      .from("auth_attempts")
      .select("attempts, lockout_until")
      .eq("ip", ip)
      .single();

    if (record && record.lockout_until) {
      const lockoutDate = new Date(record.lockout_until);
      if (now < lockoutDate) {
        return NextResponse.json(
          { error: "Too many failed attempts. Try again later." },
          { status: 429 }
        );
      }
    }

    const { password } = await request.json();
    const correctPassword = process.env.DASHBOARD_PASSWORD;

    if (!correctPassword) {
      console.error("DASHBOARD_PASSWORD environment variable is not set.");
      return NextResponse.json(
        { error: "Server configuration error." },
        { status: 500 }
      );
    }

    if (password === correctPassword) {
      // Success: Reset rate limit in DB
      await supabase.from("auth_attempts").delete().eq("ip", ip);

      // Create JWT
      const secret = new TextEncoder().encode(correctPassword);
      const token = await new SignJWT({ authenticated: true })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(secret);

      const response = NextResponse.json({ success: true });
      
      response.cookies.set({
        name: "auth_token",
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      });

      return response;
    } else {
      // Failure: Update attempts in DB
      const currentAttempts = (record?.attempts || 0) + 1;
      const lockoutUntil = currentAttempts >= MAX_ATTEMPTS 
        ? new Date(now.getTime() + LOCKOUT_MS).toISOString() 
        : null;

      await supabase.from("auth_attempts").upsert({
        ip,
        attempts: currentAttempts,
        lockout_until: lockoutUntil
      });

      // Artificial delay to deter rapid-fire brute force
      await new Promise((resolve) => setTimeout(resolve, 800));

      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }
  } catch (err) {
    console.error("Auth error:", err);
    return NextResponse.json(
      { error: "Bad request" },
      { status: 400 }
    );
  }
}
