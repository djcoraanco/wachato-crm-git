"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Activity = {
  id: string;
  kind: "llamada" | "reunion" | "tarea" | "nota";
  content: string;
  createdAt: string;
  dueAt: string | null;
};

const TIPOS: { id: Activity["kind"]; label: string }[] = [
  { id: "llamada", label: "Llamada" },
  { id: "reunion", label: "Reunión" },
  { id: "tarea", label: "Tarea" },
  { id: "nota", label: "Nota" },
];

export function ContactActivities({
  contactId,
  dealId,
}: {
  contactId: string;
  dealId?: string;
}) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [kind, setKind] = useState<Activity["kind"]>("nota");
  const [content, setContent] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/crm/activities?contactoId=${encodeURIComponent(contactId)}`
      );
      const data = (await response.json().catch(() => null)) as
        | { actividades?: Activity[]; error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "No se pudieron cargar las actividades");
      }
      setActivities(data?.actividades ?? []);
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? "No se pudo conectar para cargar las actividades"
          : cause instanceof Error
            ? cause.message
            : "No se pudieron cargar las actividades"
      );
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addActivity() {
    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(dealId ? { tratoId: dealId } : { contactoId: contactId }),
          tipo: kind,
          contenido: content.trim(),
          ...(dueAt ? { vence: new Date(dueAt).toISOString() } : {}),
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "No se pudo guardar la actividad");
      }
      setContent("");
      setDueAt("");
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? "No se pudo conectar para guardar la actividad"
          : cause instanceof Error
            ? cause.message
            : "No se pudo guardar la actividad"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 p-4" aria-label="Actividades">
      <div>
        <p className="mb-2 kicker">Actividades</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted-foreground">
            Tipo
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as Activity["kind"])}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
            >
              {TIPOS.map((type) => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Vence (opcional)
            <Input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className="mt-1 px-2"
            />
          </label>
        </div>
        <label className="mt-2 block text-xs text-muted-foreground">
          Detalle
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={4000}
            rows={3}
            className="mt-1 w-full resize-y rounded-md border border-input bg-background p-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-soft"
          />
        </label>
        <Button
          size="sm"
          className="mt-2"
          disabled={!content.trim() || saving}
          onClick={() => void addActivity()}
        >
          {saving ? "Guardando…" : "Registrar actividad"}
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando actividades…</p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay actividades.</p>
      ) : (
        <ol className="space-y-2">
          {activities.map((activity) => (
            <li key={activity.id} className="rounded-md border bg-background p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold capitalize">{activity.kind}</span>
                <time className="text-[11px] text-muted-foreground" dateTime={activity.createdAt}>
                  {new Date(activity.createdAt).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{activity.content}</p>
              {activity.dueAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Vence: {new Date(activity.dueAt).toLocaleString()}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
