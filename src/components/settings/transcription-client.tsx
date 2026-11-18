"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Provider = "openai" | "groq";
type Config = { provider: Provider; enabled: boolean; tokenLast4: string };

export function TranscriptionClient() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [provider, setProvider] = useState<Provider>("openai");
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/settings/transcription").catch(() => null);
    if (!response?.ok) {
      setError(true);
      setMessage("No se pudo cargar la configuración de transcripción.");
      setLoaded(true);
      return;
    }
    const data = (await response.json()) as { config: Config | null };
    setConfig(data.config);
    setProvider(data.config?.provider ?? "openai");
    setEnabled(data.config?.enabled ?? false);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function guardar() {
    setBusy(true);
    setMessage(null);
    setError(false);
    const response = await fetch("/api/settings/transcription", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider,
        enabled,
        ...(token.trim() ? { token: token.trim() } : {}),
      }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const data = (await response?.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(true);
      setMessage(data?.error?.message ?? "No se pudo guardar la configuración.");
      return;
    }
    const data = (await response.json()) as { config: Config | null };
    setConfig(data.config);
    setToken("");
    setMessage(enabled ? "Transcripción activada." : "Configuración guardada; transcripción apagada.");
  }

  async function quitar() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/settings/transcription", {
      method: "DELETE",
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError(true);
      setMessage("No se pudo quitar la credencial.");
      return;
    }
    setConfig(null);
    setEnabled(false);
    setToken("");
    setProvider("openai");
    setMessage("Credencial eliminada; no se enviarán más audios al proveedor.");
  }

  const providerChanged = config !== null && config.provider !== provider;
  const necesitaToken = !config || providerChanged;
  const canSave =
    loaded &&
    !busy &&
    (Boolean(token.trim()) || (Boolean(config) && !providerChanged));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Transcripción de notas de voz</CardTitle>
            <CardDescription className="mt-1">
              Opcional y apagada por defecto. Cuando está activa, el CRM envía
              el audio entrante a un proveedor de transcripción y añade el
              texto al despacho del cerebro.
            </CardDescription>
          </div>
          <Badge variant={enabled && config ? "success" : "outline"}>
            {enabled && config ? "Activa" : "Apagada"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 text-sm text-muted-foreground">
          Solo se envían el archivo de audio y el modelo. No se envían el
          teléfono, el texto del chat, la identidad ni el token de WhatsApp.
          La transcripción se cifra en el servidor y vence en 24 horas. Si el
          proveedor falla, el mensaje se despacha igual y el audio sigue
          disponible para el cerebro.
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="transcription-provider">Proveedor</Label>
          <select
            id="transcription-provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value as Provider)}
            className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="openai">OpenAI (Whisper)</option>
            <option value="groq">Groq (Whisper Large v3)</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="transcription-token">
            {config ? "Reemplazar la llave" : "Llave del proveedor"}
          </Label>
          <Input
            id="transcription-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={
              config && !providerChanged
                ? `•••• ${config.tokenLast4} (vacío para conservar)`
                : "Pega la llave de API"
            }
          />
          <p className="text-xs text-muted-foreground">
            {config && !providerChanged
              ? "La llave guardada solo muestra sus últimos cuatro caracteres."
              : "La llave se guarda cifrada; no se vuelve a mostrar completa."}
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-1 accent-primary"
          />
          <span>
            Enviar notas de voz entrantes de WhatsApp a este proveedor para
            transcribirlas.
          </span>
        </label>

        {message && (
          <p
            role={error ? "alert" : "status"}
            className={error ? "text-sm text-danger-text" : "text-sm text-muted-foreground"}
          >
            {message}
          </p>
        )}
        {loaded && config && (
          <p className="text-xs text-muted-foreground">
            Llave guardada: <code className="font-mono">••••{config.tokenLast4}</code>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={guardar} disabled={!canSave}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
          {config && (
            <Button type="button" variant="outline" onClick={quitar} disabled={busy}>
              Quitar credencial
            </Button>
          )}
        </div>
        {necesitaToken && enabled && (
          <p className="text-xs text-warning-text">
            Para activar el proveedor seleccionado, primero pega su llave.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
