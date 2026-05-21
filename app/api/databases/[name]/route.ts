import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";

const BUCKET = "databases";

// Returns a short-lived signed URL so the browser can download the .db file
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { name } = await params;
  const path = `${userId}/${decodeURIComponent(name)}`;
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60); // 60 s is plenty — the browser fetches immediately

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { name } = await params;
  const path = `${userId}/${decodeURIComponent(name)}`;
  const supabase = createSupabaseAdmin();

  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
