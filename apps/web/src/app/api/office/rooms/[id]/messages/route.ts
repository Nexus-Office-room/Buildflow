import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { officeChatSetupError } from "@/lib/officeChat";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: messages, error } = await supabase
    .from("office_room_messages")
    .select("id, room_id, sender_id, content, created_at")
    .eq("room_id", id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return NextResponse.json({ error: officeChatSetupError(error) ?? "Room not found or access denied." }, { status: officeChatSetupError(error) ? 503 : 404 });
  return NextResponse.json({ messages });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content || content.length > 8000) return NextResponse.json({ error: "Message must be between 1 and 8,000 characters." }, { status: 400 });

  const { data: message, error } = await supabase
    .from("office_room_messages")
    .insert({ room_id: id, sender_id: user.id, content })
    .select("id, room_id, sender_id, content, created_at")
    .single();
  if (error || !message) return NextResponse.json({ error: officeChatSetupError(error) ?? "Could not send message. Check room access." }, { status: officeChatSetupError(error) ? 503 : 403 });
  return NextResponse.json({ message }, { status: 201 });
}
