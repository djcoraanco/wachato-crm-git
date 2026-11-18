import type { Channel } from "@/lib/channels";

export function conversacionPuedeTranscribir(
  channel: Channel,
  isTest: boolean
): boolean {
  return channel === "whatsapp" && !isTest;
}
