import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { createSupabaseAdmin } from "@/lib/supabase";
import { DatabaseList } from "@/components/DatabaseList";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";

async function getDatabases(userId: string) {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.storage.from("databases").list(userId, {
    sortBy: { column: "updated_at", order: "desc" },
  });
  if (error) return [];
  return (data ?? []).filter(
    (f) => !f.name.endsWith(".groups.json") && !f.name.endsWith(".queries.json") && !f.name.endsWith(".deps.json") && !f.name.endsWith(".layout.json")
  );
}

export default async function HomePage() {
  const { userId } = await auth();
  const databases = userId ? await getDatabases(userId) : [];

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
        <Logo size={28} />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserButton />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Your databases</h1>
        </div>
        <DatabaseList initialDatabases={databases} />
      </main>
    </div>
  );
}
