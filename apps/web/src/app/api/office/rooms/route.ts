import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { officeChatSetupError } from "@/lib/officeChat";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: memberships, error } = await supabase
    .from("office_room_members")
    .select("role, joined_at, office_rooms(id, name, invite_code, created_by, created_at)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });
  if (error) return NextResponse.json({ error: officeChatSetupError(error) ?? error.message }, { status: officeChatSetupError(error) ? 503 : 500 });

  return NextResponse.json({ rooms: (memberships ?? []).map((membership) => ({
    ...membership.office_rooms,
    role: membership.role,
    joined_at: membership.joined_at,
  })) });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  const inviteCode = typeof body?.invite_code === "string" ? body.invite_code.trim() : "";
  if (!name) return NextResponse.json({ error: "Room name is required." }, { status: 400 });
  if (!/^\d{5}$/.test(inviteCode)) return NextResponse.json({ error: "Choose an invite code with exactly 5 digits." }, { status: 400 });

  const { data: room, error: roomError } = await supabase
    .from("office_rooms")
    .insert({ name, invite_code: inviteCode, created_by: user.id })
    .select("id, name, invite_code, created_by, created_at")
    .single();
  if (roomError?.code === "23505") return NextResponse.json({ error: "That invite code is already in use. Choose another 5-digit code." }, { status: 409 });
  if (roomError || !room) return NextResponse.json({ error: officeChatSetupError(roomError) ?? roomError?.message ?? "Could not create room." }, { status: officeChatSetupError(roomError) ? 503 : 500 });

  const { error: memberError } = await supabase
    .from("office_room_members")
    .insert({ room_id: room.id, user_id: user.id, role: "owner" });
  if (memberError) {
    await supabase.from("office_rooms").delete().eq("id", room.id);
    return NextResponse.json({ error: officeChatSetupError(memberError) ?? memberError.message }, { status: officeChatSetupError(memberError) ? 503 : 500 });
  }
  return NextResponse.json({ room, role: "owner" }, { status: 201 });
}
