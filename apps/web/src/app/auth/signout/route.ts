import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function signOut(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Logout is submitted as a POST form. A 307 preserves that method and
  // sends the browser's POST to /login, which only accepts GET and returns 405.
  // A 303 tells the browser to load the destination with GET after sign-out.
  return NextResponse.redirect(new URL("/login", request.url), 303);
}

// Older deployed navigation used a link (GET) for logout. Keep that path
// working while the current UI submits the form with POST.
export const GET = signOut;
export const POST = signOut;
