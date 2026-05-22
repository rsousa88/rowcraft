import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

const BUCKET = "databases";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).list(userId, {
    sortBy: { column: "updated_at", order: "desc" },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Filter out sidecar metadata files (.groups.json)
  const dbs = (data ?? []).filter((f) => !f.name.endsWith(".groups.json"));
  return NextResponse.json(dbs);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!file.name.endsWith(".db"))
    return NextResponse.json({ error: "Only .db files are accepted" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const supabase = createSupabaseAdmin();
  const path = `${userId}/${file.name}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { upsert: true, contentType: "application/x-sqlite3" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ name: file.name }, { status: 201 });
}
