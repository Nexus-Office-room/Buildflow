export function officeChatSetupError(error: { code?: string; message?: string } | null | undefined): string | null {
  if (!error) return null;
  const code = error.code ?? "";
  const message = error.message?.toLowerCase() ?? "";
  if (["42P01", "PGRST202", "PGRST205"].includes(code) ||
      (message.includes("office_room") && (message.includes("does not exist") || message.includes("not find")))) {
    return "Team chat needs database migration 0015_office_group_chat.sql. Apply it in Supabase, then reload this page.";
  }
  return null;
}
