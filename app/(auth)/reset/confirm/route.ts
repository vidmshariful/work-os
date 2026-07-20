import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The reset email links here with a one-time code. Exchange it for a session
// (which sets the auth cookies on the response), then send the user to the
// page where they choose a new password. A bad or expired code returns to the
// request form.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/reset/update`);
    }
  }

  return NextResponse.redirect(`${origin}/reset?error=expired`);
}
