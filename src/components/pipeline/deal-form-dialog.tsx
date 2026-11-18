"use client";

import { useEffect, useState } from "react";
import { CURRENCY_OPTIONS } from "@/lib/money";
import { parseMoneyToCents } from "@/lib/money";
import type { StageDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ContactOption = { id: string; name: string; phone: string | null };

export function DealFormDialog({
  pipelineId,
  stages,
  initialCurrency,
  onClose,
  onCreated,
}: {
  pipelineId: string;
  stages: StageDto[];
  initialCurrency: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [contact, setContact] = useState<ContactOption | null>(null);
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(initialCurrency);
  const [error, setError] = useState<string | null>(null);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [saving, setSaving] = useState(false);
  const cents = amount.trim() ? parseMoneyToCents(amount) : null;
  const invalidAmount =
    amount.trim().length > 0 &&
    (cents === null || cents < 0 || !Number.isSafeInteger(cents));

  useEffect(() => {
    if (!query.trim()) {
      setContacts([]);
      setLoadingContacts(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setError(null);
      setLoadingContacts(true);
      try {
        const params = new URLSearchParams({ offset: "0" });
        params.set("q", query.trim());
        const response = await fetch(`/api/contacts?${params}`, { signal: controller.signal });
        const data = (await response.json().catch(() => null)) as
          | { contacts?: ContactOption[]; error?: { message?: string } }
          | null;
        if (!response.ok) {
          throw new Error(data?.error?.message ?? "No se pudieron buscar contactos");
        }
        setContacts(data?.contacts ?? []);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(
          cause instanceof TypeError
            ? "No se pudo conectar para buscar contactos"
            : cause instanceof Error
              ? cause.message
              : "No se pudieron buscar contactos"
        );
      } finally {
        setLoadingContacts(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function create() {
    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/crm/deals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          titulo: title.trim(),
          contactoId: contact?.id,
          embudoId: pipelineId,
          etapaId: stageId,
          monto: cents === null ? null : { centavos: cents, moneda: currency },
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "No se pudo crear el trato");
      }
      onCreated();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? "No se pudo conectar para crear el trato"
          : cause instanceof Error
            ? cause.message
            : "No se pudo crear el trato"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-overlay p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Nuevo trato"
      onClick={onClose}
    >
      <form
        className="my-auto w-full max-w-lg space-y-4 rounded-lg border bg-popover p-5 shadow-pop"
        onSubmit={(event) => { event.preventDefault(); void create(); }}
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-semibold">Nuevo trato</h3>
          <p className="text-sm text-muted-foreground">
            Se guardará en este embudo; no crea ni modifica un lead.
          </p>
        </div>
        <label className="block text-sm font-medium">
          Nombre del trato
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required className="mt-1" />
        </label>
        <label className="block text-sm font-medium">
          Buscar contacto
          <Input
            value={contact ? `${contact.name}${contact.phone ? ` · ${contact.phone}` : ""}` : query}
            onChange={(event) => { setContact(null); setQuery(event.target.value); }}
            placeholder="Nombre o teléfono"
            className="mt-1"
          />
        </label>
        {loadingContacts && <p className="text-xs text-muted-foreground">Buscando…</p>}
        {!contact && query.trim() && contacts.length > 0 && (
          <ul className="max-h-36 overflow-y-auto rounded-md border">
            {contacts.slice(0, 8).map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => { setContact(option); setQuery(""); }}
                >
                  {option.name}{option.phone ? ` · ${option.phone}` : ""}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!contact && query.trim() && !loadingContacts && contacts.length === 0 && !error && (
          <p className="text-xs text-muted-foreground">No se encontraron contactos.</p>
        )}
        {contact && (
          <div className="flex items-center justify-between rounded-md border bg-subtle px-3 py-2 text-sm">
            <span>{contact.name}</span>
            <button type="button" className="text-muted-foreground underline" onClick={() => setContact(null)}>
              Cambiar
            </button>
          </div>
        )}
        <label className="block text-sm font-medium">
          Etapa
          <select
            value={stageId}
            onChange={(event) => setStageId(event.target.value)}
            required
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-[1fr_150px] gap-3">
          <label className="block text-sm font-medium">
            Importe (opcional)
            <Input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="12,500.00" className="mt-1" />
          </label>
          <label className="block text-sm font-medium">
            Moneda
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
            >
              {CURRENCY_OPTIONS.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}
            </select>
          </label>
        </div>
        {invalidAmount && <p className="text-sm text-destructive">Escribe un importe no negativo válido.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={!title.trim() || !contact || !stageId || invalidAmount || saving}>
            {saving ? "Guardando…" : "Crear trato"}
          </Button>
        </div>
      </form>
    </div>
  );
}
