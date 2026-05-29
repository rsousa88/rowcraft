import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ConnectorBridgeViewer } from "@/components/ConnectorBridgeViewer";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ConnectorConnectPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const bridge = firstParam(params.bridge);
  const token = firstParam(params.token);
  const dataset = firstParam(params.dataset);

  const { userId } = await auth();
  if (!userId) {
    const query = new URLSearchParams();
    if (bridge) query.set("bridge", bridge);
    if (token) query.set("token", token);
    if (dataset) query.set("dataset", dataset);
    const returnTo = `/connectors/connect${query.size ? `?${query.toString()}` : ""}`;
    redirect(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
  }

  return (
    <ConnectorBridgeViewer
      bridgeParam={bridge}
      tokenParam={token}
      datasetParam={dataset}
    />
  );
}
