"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { StageDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CommercialStageManager({
  pipelineId,
  stages,
  eventosMeta,
  onClose,
  onChanged,
}: {
  pipelineId: string;
  stages: StageDto[];
  eventosMeta: readonly string[] | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const sorted = [...stages].sort((a, b) => a.position - b.position);

  async function request(url: string, init?: RequestInit) {
    setError(null);
    setSaving(true);
    try {
      const response = await fetch(url, init);
      const data = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!response.ok) throw new Error(data?.error?.message ?? "No se pudo guardar la etapa");
      return true;
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? "No se pudo conectar para guardar la etapa"
          : cause instanceof Error
            ? cause.message
            : "No se pudo guardar la etapa"
      );
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function add() {
    if (!newName.trim()) return;
    if (await request(`/api/crm/pipelines/${pipelineId}/stages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: newName.trim() }),
    })) {
      setNewName("");
      onChanged();
    }
  }

  async function rename(stage: StageDto, name: string) {
    if (!name.trim() || name === stage.name) return;
    if (await request(`/api/crm/pipelines/${pipelineId}/stages/${stage.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nombre: name.trim() }),
    })) onChanged();
  }

  async function reorder(stage: StageDto, direction: -1 | 1) {
    const index = sorted.findIndex((item) => item.id === stage.id);
    const adjacent = sorted[index + direction];
    if (!adjacent) return;
    const first = await request(`/api/crm/pipelines/${pipelineId}/stages/${stage.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ posicion: adjacent.position }),
    });
    if (!first) return;
    const second = await request(`/api/crm/pipelines/${pipelineId}/stages/${adjacent.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ posicion: stage.position }),
    });
    if (second || first) onChanged();
  }

  async function remove(stage: StageDto) {
    setError(null);
    setDeletingId(stage.id);
    try {
      const response = await fetch(`/api/crm/pipelines/${pipelineId}/stages/${stage.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!response.ok) throw new Error(data?.error?.message ?? "No se pudo eliminar la etapa");
      onChanged();
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? "No se pudo conectar para eliminar la etapa"
          : cause instanceof Error
            ? cause.message
            : "No se pudo eliminar la etapa"
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function setMetaEvent(stage: StageDto, eventoMeta: string) {
    if (await request(`/api/crm/pipelines/${pipelineId}/stages/${stage.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventoMeta: eventoMeta || null }),
    })) onChanged();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-overlay p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Gestionar etapas del embudo"
        className="my-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-lg border bg-popover p-5 shadow-pop"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="mb-1 font-semibold">Etapas del embudo</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Los tratos en una etapa no se eliminan; antes debes moverlos.
        </p>
        <ul className="space-y-2">
          {sorted.map((stage, index) => (
            <li key={stage.id} className="flex flex-wrap items-center gap-2">
              <Input
                key={`${stage.id}:${stage.name}`}
                defaultValue={stage.name}
                aria-label={`Nombre de etapa ${stage.name}`}
                className="min-w-0 flex-1"
                onBlur={(event) => void rename(stage, event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
              <Button variant="ghost" size="icon" disabled={saving || index === 0} aria-label={`Subir ${stage.name}`} onClick={() => void reorder(stage, -1)}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" disabled={saving || index === sorted.length - 1} aria-label={`Bajar ${stage.name}`} onClick={() => void reorder(stage, 1)}>
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" disabled={saving || deletingId === stage.id} aria-label={`Eliminar ${stage.name}`} onClick={() => void remove(stage)}>
                <Trash2 className="h-4 w-4" />
              </Button>
              {eventosMeta && (
                <label className="w-full text-xs text-muted-foreground">
                  Evento de Meta al entrar en {stage.name}
                  <select
                    value={stage.metaEvent ?? ""}
                    disabled={saving}
                    onChange={(event) => void setMetaEvent(stage, event.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="">Sin evento adicional</option>
                    {eventosMeta.map((event) => <option key={event} value={event}>{event}</option>)}
                  </select>
                </label>
              )}
            </li>
          ))}
        </ul>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-4 flex gap-2 border-t pt-4">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void add(); } }}
            placeholder="Nueva etapa…"
            aria-label="Nombre de la nueva etapa"
          />
          <Button disabled={!newName.trim() || saving} onClick={() => void add()}>Agregar</Button>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}
