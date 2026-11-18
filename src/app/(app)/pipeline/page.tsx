import { PipelineClient } from "@/components/pipeline/pipeline-client";
import { canConfigure } from "@/lib/auth/roles";
import { getSessionOrNull } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const session = await getSessionOrNull();
  return <PipelineClient puedeAdministrarCampos={canConfigure(session?.role)} />;
}
