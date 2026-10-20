import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { officeChatSetupError } from "@/lib/officeChat";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const inviteCode = typeof body?.invite_code === "string" ? body.invite_code.trim() : "";
  if (!/^\d{5}$/.test(inviteCode)) return NextResponse.json({ error: "Invite code must be exactly 5 digits." }, { status: 400 });

  const { data: roomId, error } = await supabase.rpc("join_office_room", { p_invite_code: inviteCode });
  if (error?.message.includes("Too many incorrect invite codes")) return NextResponse.json({ error: "Too many incorrect invite codes. Try again in 15 minutes." }, { status: 429 });
  if (error || !roomId) return NextResponse.json({ error: officeChatSetupError(error) ?? "Invite link is invalid or expired." }, { status: officeChatSetupError(error) ? 503 : 404 });
  const { data: room } = await supabase.from("office_rooms").select("id, name, invite_code, created_by, created_at").eq("id", roomId).single();
  if (!room) return NextResponse.json({ error: "Room could not be opened." }, { status: 404 });
  return NextResponse.json({ room });
}
