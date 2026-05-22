import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

const BUCKET = "databases";

function groupsPath(userId: string, dbName: string) {
  return `${userId}/${dbName}.groups.json`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { name } = await params;
  const dbName = decodeURIComponent(name);
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(groupsPath(userId, dbName));

  if (error) {
    // File doesn't exist yet — return empty groups
    return NextResponse.json([]);
  }

  try {
    const text = await data.text();
    return NextResponse.json(JSON.parse(text));
  } catch {
    return NextResponse.json([]);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { name } = await params;
  const dbName = decodeURIComponent(name);
  const groups = await req.json();

  const supabase = createSupabaseAdmin();
  const bytes = new TextEncoder().encode(JSON.stringify(groups));

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(groupsPath(userId, dbName), bytes, {
      upsert: true,
      contentType: "application/json",
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
