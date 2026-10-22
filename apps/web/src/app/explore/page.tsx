import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import SetupRequired from "@/components/SetupRequired";
import ExploreBoard from "@/components/explore/ExploreBoard";

export const metadata: Metadata = {
  title: "Explore",
};

export default async function ExplorePage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <SetupRequired />;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return <div className="min-h-screen text-neutral-100"><ExploreBoard signedIn={Boolean(user)} /></div>;
}
