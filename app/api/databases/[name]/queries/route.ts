import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

const BUCKET = "databases";

function queriesPath(userId: string, dbName: string) {
  return `${userId}/${dbName}.queries.json`;
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
    .download(queriesPath(userId, dbName));

  if (error) return NextResponse.json({});

  try {
    return NextResponse.json(JSON.parse(await data.text()));
  } catch {
    return NextResponse.json({});
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
  const body = await req.json();

  const supabase = createSupabaseAdmin();
  const bytes = new TextEncoder().encode(JSON.stringify(body));

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(queriesPath(userId, dbName), bytes, {
      upsert: true,
      contentType: "application/json",
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
