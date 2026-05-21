import { auth, clerkClient } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase";
import { Logo } from "@/components/Logo";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin" };

// Revalidate every 60 s so stats stay reasonably fresh without a full reload
export const revalidate = 60;

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(ms: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDatetime(ms: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function daysAgo(ms: number) {
  return Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
}

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-5">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">{label}</p>
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  const { userId } = await auth();
  const adminId = process.env.ADMIN_USER_ID;

  // Hard gate — return 404 so the page's existence isn't revealed to anyone else
  if (!userId || !adminId || userId !== adminId) {
    notFound();
  }

  // ── Clerk: fetch all users ──────────────────────────────────────────────────
  const clerk = await clerkClient();
  const { data: users, totalCount } = await clerk.users.getUserList({
    limit: 500,
    orderBy: "-created_at",
  });

  const now = Date.now();
  const newThisWeek = users.filter((u) => now - u.createdAt < 7 * 86400_000).length;
  const newThisMonth = users.filter((u) => now - u.createdAt < 30 * 86400_000).length;
  const activeThisWeek = users.filter((u) => u.lastSignInAt && now - u.lastSignInAt < 7 * 86400_000).length;

  // ── Supabase: storage stats ─────────────────────────────────────────────────
  const supabase = createSupabaseAdmin();

  // Top-level entries are user-ID prefixes (one folder per user)
  const { data: userFolders } = await supabase.storage.from("databases").list("", { limit: 500 });

  const perUser = await Promise.all(
    (userFolders ?? []).filter((f) => f.name).map(async (folder) => {
      const { data: files } = await supabase.storage.from("databases").list(folder.name);
      const count = files?.length ?? 0;
      const bytes = files?.reduce((s, f) => s + ((f.metadata?.size as number) ?? 0), 0) ?? 0;
      return { userId: folder.name, count, bytes };
    })
  );

  perUser.sort((a, b) => b.bytes - a.bytes);
  const totalDbs = perUser.reduce((s, u) => s + u.count, 0);
  const totalBytes = perUser.reduce((s, u) => s + u.bytes, 0);

  // Map Clerk users by ID for the storage table
  const userById = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-3 flex items-center gap-3">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Logo size={24} />
        </Link>
        <span className="text-zinc-300 dark:text-zinc-600">/</span>
        <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 tracking-wide uppercase">Admin</span>
        <span className="ml-2 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wider">
          Private
        </span>
        <div className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
          Revalidates every 60 s
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-10">

        {/* ── Users overview ── */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Users</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total registered" value={totalCount} />
            <StatCard label="New this week" value={newThisWeek} sub={`${newThisMonth} in last 30 days`} />
            <StatCard label="Active this week" value={activeThisWeek} sub="signed in in last 7 days" />
            <StatCard label="Databases stored" value={totalDbs} sub={fmtBytes(totalBytes) + " total"} />
          </div>
        </section>

        {/* ── Storage overview ── */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Storage</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <StatCard label="Total storage used" value={fmtBytes(totalBytes)} />
            <StatCard label="Databases uploaded" value={totalDbs} />
            <StatCard label="Users with databases" value={perUser.filter((u) => u.count > 0).length} />
          </div>

          {/* Per-user breakdown */}
          {perUser.length > 0 && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">User</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Email</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Databases</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Storage</th>
                  </tr>
                </thead>
                <tbody>
                  {perUser.map(({ userId: uid, count, bytes }) => {
                    const u = userById.get(uid);
                    const email = u?.emailAddresses[0]?.emailAddress ?? "—";
                    const name = [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "—";
                    return (
                      <tr key={uid} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-zinc-800 dark:text-zinc-200">{name}</div>
                          <div className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">{uid}</div>
                        </td>
                        <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{email}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{count}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500 dark:text-zinc-400">{fmtBytes(bytes)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── All users table ── */}
        <section>
          <h2 className="text-lg font-semibold mb-4">All users <span className="text-zinc-400 dark:text-zinc-500 font-normal text-base">({totalCount})</span></h2>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Name</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Email</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Joined</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const email = u.emailAddresses[0]?.emailAddress ?? "—";
                  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";
                  const isAdmin = u.id === adminId;
                  return (
                    <tr key={u.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {u.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.imageUrl} alt="" width={24} height={24} className="rounded-full shrink-0" />
                          )}
                          <span className="font-medium text-zinc-800 dark:text-zinc-200">{name}</span>
                          {isAdmin && (
                            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">
                              admin
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400">{email}</td>
                      <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        {fmtDate(u.createdAt)}
                        <span className="ml-1 text-zinc-300 dark:text-zinc-600 text-xs">({daysAgo(u.createdAt)}d ago)</span>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        {fmtDatetime(u.lastSignInAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
