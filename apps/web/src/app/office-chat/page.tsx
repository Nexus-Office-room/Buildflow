"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import BuildflowLogo from "@/components/brand/BuildflowLogo";

interface Room {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  role?: string;
}

interface RoomMessage {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

const subscribeToOrigin = () => () => {};
const getOriginSnapshot = () => window.location.origin;
const getOriginServerSnapshot = () => "";

export default function OfficeChatPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, RoomMessage[]>>({});
  const [roomName, setRoomName] = useState("");
  const [createInviteCode, setCreateInviteCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [roomsError, setRoomsError] = useState("");
  const [messagesError, setMessagesError] = useState("");
  const [notice, setNotice] = useState("");
  const siteOrigin = useSyncExternalStore(subscribeToOrigin, getOriginSnapshot, getOriginServerSnapshot);

  const activeRoom = useMemo(() => rooms.find((room) => room.id === activeRoomId) ?? null, [rooms, activeRoomId]);
  const messages = messagesByRoom[activeRoomId] ?? [];
  const inviteLink = activeRoom
    ? `${siteOrigin}/office-chat?join=${encodeURIComponent(activeRoom.invite_code)}`
    : "";

  const loadRooms = useCallback(async () => {
    const response = await fetch("/api/office/rooms", { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? "Could not load rooms.");
    const nextRooms = (data?.rooms ?? []) as Room[];
    setRoomsError("");
    setRooms(nextRooms);
    setActiveRoomId((current) => nextRooms.some((room) => room.id === current) ? current : nextRooms[0]?.id ?? "");
    return nextRooms;
  }, []);

  const joinRoom = useCallback(async (code: string) => {
    const response = await fetch("/api/office/rooms/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invite_code: code }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? "Could not join that room.");
    const joined = data.room as Room;
    await loadRooms();
    setActiveRoomId(joined.id);
    setNotice(`You joined ${joined.name}.`);
  }, [loadRooms]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const query = new URLSearchParams(window.location.search);
        const invite = query.get("join");
        if (invite) {
          await joinRoom(invite);
          window.history.replaceState({}, "", window.location.pathname);
        }
        if (!cancelled) await loadRooms();
      } catch (err) {
        if (!cancelled) setRoomsError(err instanceof Error ? err.message : "Could not load team chat.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [joinRoom, loadRooms]);

  const loadMessages = useCallback(async (roomId: string) => {
    const response = await fetch(`/api/office/rooms/${roomId}/messages`, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? "Could not load messages.");
    setMessagesByRoom((previous) => ({ ...previous, [roomId]: data?.messages ?? [] }));
  }, []);

  useEffect(() => {
    if (!activeRoomId) {
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/office/rooms/${activeRoomId}/messages`, { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? "Could not load messages.");
        if (!cancelled) {
          setMessagesError("");
          setMessagesByRoom((previous) => ({ ...previous, [activeRoomId]: data?.messages ?? [] }));
        }
      } catch (err) {
        if (!cancelled) setMessagesError(err instanceof Error ? err.message : "Could not load messages.");
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activeRoomId]);

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    if (!roomName.trim() || !/^\d{5}$/.test(createInviteCode) || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/office/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: roomName.trim(), invite_code: createInviteCode }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Could not create room.");
      setRoomName("");
      setCreateInviteCode("");
      await loadRooms();
      setActiveRoomId(data.room.id);
      setNotice("Room created. Share its invite link with your team.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room.");
    } finally {
      setBusy(false);
    }
  }

  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    if (!inviteCode.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await joinRoom(inviteCode.trim());
      setInviteCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join room.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !activeRoomId || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/office/rooms/${activeRoomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Message could not be sent.");
      setDraft("");
      await loadMessages(activeRoomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(value: string, label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setError(`Clipboard access was blocked. Select and copy the ${label.toLowerCase()} shown below.`);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 text-neutral-100 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center gap-4">
          <BuildflowLogo surface="nav" />
          <p className="hidden font-mono text-xs text-neutral-500 sm:block">/ team rooms</p>
          <Link href="/projects" className="ml-auto font-mono text-xs text-neutral-400 hover:text-white">← Projects</Link>
        </header>

        <div className="mb-5">
          <p className="font-mono text-[11px] uppercase tracking-[.2em] text-blue-300">Office Group Chat</p>
          <h1 className="mt-1 text-3xl font-semibold">Work together in a room</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-400">Create a room, share its invite link, and keep the team conversation in one place.</p>
        </div>

        {[error, roomsError, messagesError].filter(Boolean).map((message, index) => <p key={`${index}-${message}`} role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-sm text-red-300">{message}{message === "Unauthorized" && <> <Link className="underline" href="/login">Sign in</Link></>}</p>)}
        {notice && <p role="status" className="mb-3 text-sm text-emerald-300">{notice}</p>}

        <div className="grid min-h-[62vh] overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/80 md:grid-cols-[280px_1fr]">
          <aside className="border-b border-white/10 p-4 md:border-b-0 md:border-r">
            <form onSubmit={createRoom} className="space-y-2">
              <input value={roomName} onChange={(e) => setRoomName(e.target.value)} maxLength={80} placeholder="New room name" aria-label="New room name" className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-2 text-xs outline-none focus:border-blue-300/50" />
              <label className="block">
                <span className="mb-1 block font-mono text-[9px] uppercase tracking-widest text-neutral-500">Choose a 5-digit invite code</span>
                <input value={createInviteCode} onChange={(e) => setCreateInviteCode(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" autoComplete="off" maxLength={5} pattern="[0-9]{5}" placeholder="e.g. 04217" aria-label="Choose a 5-digit invite code" className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-2 font-mono text-sm tracking-[.25em] outline-none focus:border-blue-300/50" />
              </label>
              <button disabled={busy || !roomName.trim() || createInviteCode.length !== 5} className="w-full rounded-md bg-blue-300/15 px-3 py-2 text-xs text-blue-100 disabled:opacity-40">Create room</button>
            </form>
            <form onSubmit={submitInvite} className="mt-2 flex gap-2">
              <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" maxLength={5} placeholder="5-digit invite code" aria-label="Room invite code" className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-2 text-xs outline-none focus:border-blue-300/50" />
              <button disabled={busy || inviteCode.length !== 5} className="rounded-md border border-white/10 px-3 text-xs text-neutral-300 disabled:opacity-40">Join</button>
            </form>
            <h2 className="mb-2 mt-6 font-mono text-[10px] uppercase tracking-widest text-neutral-600">Your rooms</h2>
            <div className="space-y-1">
              {rooms.map((room) => (
                <button key={room.id} onClick={() => setActiveRoomId(room.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${activeRoomId === room.id ? "bg-blue-300/10 text-blue-100" : "text-neutral-400 hover:bg-white/5 hover:text-white"}`}>
                  <span className="mr-2 text-blue-300">#</span>{room.name}
                </button>
              ))}
              {!loading && rooms.length === 0 && <p className="px-3 py-3 text-xs leading-5 text-neutral-600">No rooms yet. Create one or join with an invite link.</p>}
              {loading && <p className="px-3 py-3 text-xs text-neutral-600">Loading rooms…</p>}
            </div>
          </aside>

          <section className="flex min-h-[55vh] flex-col">
            {activeRoom ? (
              <>
                <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                  <div className="min-w-0 flex-1"><h2 className="truncate font-medium"># {activeRoom.name}</h2><p className="text-[10px] text-neutral-600">Room chat · messages refresh every 5 seconds</p></div>
                </header>
                <aside aria-label="Room invitation" className="grid gap-3 border-b border-blue-300/10 bg-blue-300/[.035] px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0 space-y-2">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">Invite link</p>
                      <p className="break-all font-mono text-xs text-blue-100">{inviteLink}</p>
                    </div>
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">Invite code</p>
                      <p className="break-all font-mono text-xs text-neutral-300">{activeRoom.invite_code}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 sm:flex-col">
                    <button onClick={() => void copyText(inviteLink, "Invite link")} className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5">Copy link</button>
                    <button onClick={() => void copyText(activeRoom.invite_code, "Invite code")} className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5">Copy code</button>
                  </div>
                </aside>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.map((message) => (
                    <article key={message.id} className="rounded-lg border border-white/5 bg-white/[.025] px-3 py-2">
                      <div className="flex items-center gap-2"><span className="font-mono text-[10px] text-blue-200">teammate · {message.sender_id.slice(0, 8)}</span><time className="text-[10px] text-neutral-600">{new Date(message.created_at).toLocaleString()}</time></div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-200">{message.content}</p>
                    </article>
                  ))}
                  {messages.length === 0 && <p className="py-12 text-center text-sm text-neutral-600">This room is ready. Start the conversation.</p>}
                </div>
                <form onSubmit={sendMessage} className="flex gap-2 border-t border-white/10 p-3">
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={8000} placeholder="Message your team…" aria-label="Message your team" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-blue-300/50" />
                  <button disabled={busy || !draft.trim()} className="rounded-lg bg-blue-300/15 px-4 text-sm text-blue-100 disabled:opacity-40">Send</button>
                </form>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-8 text-center"><div><p className="text-3xl">✦</p><h2 className="mt-3 text-lg font-medium">A shared place for the conversation</h2><p className="mt-2 max-w-sm text-sm leading-6 text-neutral-500">Choose a room, create one, or join with an invite code.</p></div></div>
            )}
          </section>
        </div>
        <p className="mt-3 text-[11px] text-neutral-600">Room invites share the chat only. Project files, provider keys, and deployment access stay private to their owner.</p>
      </div>
    </main>
  );
}
