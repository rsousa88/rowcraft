import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DbViewer } from "@/components/DbViewer";

export default async function DbPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  return <DbViewer dbName={decodedName} />;
}
