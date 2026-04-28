import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

export async function GET(request: Request) {
  try {
    const token = request.headers.get("cookie")
      ?.split("; ")
      .find(row => row.startsWith("auth_token="))
      ?.split("=")[1];

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify JWT
    const secret = new TextEncoder().encode(process.env.DASHBOARD_PASSWORD);
    await jwtVerify(token, secret);

    // Return sensitive config only to authenticated users
    return NextResponse.json({
      supabase: {
        url: process.env.SUPABASE_URL,
        key: process.env.SUPABASE_ANON_KEY,
      },
      mqtt: {
        protocol: process.env.MQTT_PROTOCOL || "wss",
        host: process.env.MQTT_HOST,
        port: process.env.MQTT_PORT || "8884",
        path: process.env.MQTT_PATH || "/mqtt",
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
}
