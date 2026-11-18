import { AiClient } from "@/components/settings/ai-client";
import { TranscriptionClient } from "@/components/settings/transcription-client";

export const dynamic = "force-dynamic";

export default function AiSettingsPage() {
  return (
    <div className="space-y-6">
      <AiClient />
      <TranscriptionClient />
    </div>
  );
}
