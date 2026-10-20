import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function signOut(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}

// Older deployed navigation used a link (GET) for logout. Keep that path
// working while the current UI submits the form with POST.
export const GET = signOut;
export const POST = signOut;
