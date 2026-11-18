"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CURRENCY_OPTIONS, formatMoneyCents, parseMoneyToCents } from "@/lib/money";
import type { StageDto } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BoardDeal } from "./commercial-utils";
import { ContactActivities } from "./contact-activities";
import { CamposPersonalizadosEditor } from "@/components/contacts/campos-personalizados";

export function DealDrawer({
  deal,
  stages,
  onClose,
  onChanged,
}: {
  deal: BoardDeal;
  stages: StageDto[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(deal.title);
  const [stageId, setStageId] = useState(deal.stageId);
  const [amount, setAmount] = useState(
    deal.amount ? (deal.amount.centavos / 100).toFixed(2) : ""
  );
  const [currency, setCurrency] = useState(deal.amount?.moneda ?? "MXN");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cents = amount.trim() ? parseMoneyToCents(amount) : null;
  const invalidAmount =
    amount.trim().length > 0 &&
    (cents === null || cents < 0 || !Number.isSafeInteger(cents));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          titulo: title.trim(),
          etapaId: stageId,
          monto: cents === null ? null : { centavos: cents, moneda: currency },
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "No se pudo guardar el trato");
      }
      onChanged();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? "No se pudo conectar para guardar el trato"
          : cause instanceof Error
            ? cause.message
            : "No se pudo guardar el trato"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        aria-label="Cerrar trato"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-overlay"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Trato: ${deal.title}`}
        className="fixed inset-y-0 right-0 z-50 flex w-[min(420px,94vw)] flex-col border-l bg-popover shadow-pop"
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="min-w-0">
            <p className="kicker text-text-2">Trato</p>
            <p className="truncate text-sm font-semibold">{deal.contact.name}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar panel del trato"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          <section className="space-y-3 border-b p-4">
            <label className="block text-sm font-medium">
              Nombre
              <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} className="mt-1" />
            </label>
            <label className="block text-sm font-medium">
              Etapa
              <select
                value={stageId}
                onChange={(event) => setStageId(event.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-[1fr_110px] gap-2">
              <label className="block text-sm font-medium">
                Importe
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
            {!invalidAmount && (
              <p className="text-xs text-muted-foreground">
                {cents === null ? "Sin importe" : formatMoneyCents(cents, currency)}
              </p>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button disabled={!title.trim() || !stageId || invalidAmount || saving} onClick={() => void save()}>
              {saving ? "Guardando…" : "Guardar cambios"}
            </Button>
          </section>
          <div className="p-4"><CamposPersonalizadosEditor entidad="trato" entidadId={deal.id} /></div>
          <ContactActivities contactId={deal.contact.id} dealId={deal.id} />
        </div>
      </aside>
    </>
  );
}
