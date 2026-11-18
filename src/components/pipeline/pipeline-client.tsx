"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { BriefcaseBusiness, MessageSquareText, Plus, Settings2, Trophy, XCircle } from "lucide-react";
import type { LossReason, PriorityValue, StageDto } from "@/lib/types";
import { formatMoneyCents, sumable } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/components/inbox/helpers";
import { StageManager } from "./stage-manager";
import { LossReasonDialog } from "./loss-reason-dialog";
import { AmountDialog } from "./amount-dialog";
import { PriorityBadge } from "./priority-picker";
import { LeadDrawer } from "./lead-drawer";
import { DealDrawer } from "./deal-drawer";
import { DealFormDialog } from "./deal-form-dialog";
import { CommercialStageManager } from "./commercial-stage-manager";
import { totalizarTratosPorMoneda, type BoardDeal } from "./commercial-utils";
import { Input } from "@/components/ui/input";
import { AdministradorCamposButton } from "@/components/contacts/campos-personalizados";

export type BoardLead = {
  id: string;
  stageId: string;
  position: number;
  lastActivityAt: string | null;
  contact: { id: string; name: string; phone: string | null };
  conversationId: string | null;
  amountCents: number | null;
  currency: string | null;
  priority: PriorityValue | null;
};

const PRINCIPAL = "predeterminado";
type PipelineOption = { id: string; nombre: string; predeterminado: boolean };
type ActiveCard =
  | { kind: "lead"; lead: BoardLead }
  | { kind: "deal"; deal: BoardDeal };

export function PipelineClient({ puedeAdministrarCampos }: { puedeAdministrarCampos: boolean }) {
  const [stages, setStages] = useState<StageDto[]>([]);
  const [commercialStages, setCommercialStages] = useState<StageDto[]>([]);
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState(PRINCIPAL);
  const [deals, setDeals] = useState<BoardDeal[]>([]);
  const [eventosMeta, setEventosMeta] = useState<readonly string[] | null>(null);
  const [currency, setCurrency] = useState("MXN");
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<BoardLead[]>([]);
  const [activeCard, setActiveCard] = useState<ActiveCard | null>(null);
  const [managing, setManaging] = useState(false);
  const [creatingPipeline, setCreatingPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [pipelineFormError, setPipelineFormError] = useState<string | null>(null);
  const [creatingDeal, setCreatingDeal] = useState(false);
  const [openDealId, setOpenDealId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const boardRequestId = useRef(0);
  /** Arrastre hacia una etapa perdida, esperando el motivo. */
  const [pendingLoss, setPendingLoss] = useState<{
    leadId: string;
    stageId: string;
    name: string;
  } | null>(null);
  /** Tarjeta cuyo monto se está capturando. */
  const [editandoMonto, setEditandoMonto] = useState<BoardLead | null>(null);
  /**
   * Trato abierto en el cajón. Se guarda el ID y no el objeto: así el cajón
   * lee siempre del tablero y refleja al instante lo que se cambie desde
   * dentro, en vez de enseñar una copia que envejece.
   */
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const abierto = leads.find((l) => l.id === abiertoId) ?? null;
  const tratoAbierto = deals.find((deal) => deal.id === openDealId) ?? null;
  const etapasVisibles = selectedPipelineId === PRINCIPAL ? stages : commercialStages;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const refetch = useCallback(async () => {
    const requestId = ++boardRequestId.current;
    setLoading(true);
    setError(null);
    try {
      const boardUrl = `/api/crm/pipelines/${encodeURIComponent(selectedPipelineId)}/board`;
      const requests = [fetch(boardUrl)];
      if (selectedPipelineId === PRINCIPAL) requests.push(fetch("/api/pipeline/board"));
      const responses = await Promise.all(requests);
      if (requestId !== boardRequestId.current) return;
      const commercialResponse = responses[0];
      if (!commercialResponse?.ok) {
        const body = await commercialResponse?.json().catch(() => null) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? "No se pudo cargar el embudo");
      }
      const commercial = await commercialResponse.json() as {
        etapas: { id: string; nombre: string; posicion: number; eventoMeta: string | null }[];
        tratos: {
          id: string;
          titulo: string;
          contacto: { id: string; nombre: string };
          etapaId: string;
          monto: { centavos: number; moneda: string } | null;
        }[];
      };
      if (requestId !== boardRequestId.current) return;
      setDeals(commercial.tratos.map((deal) => ({
        id: deal.id,
        title: deal.titulo,
        contact: { id: deal.contacto.id, name: deal.contacto.nombre },
        stageId: deal.etapaId,
        amount: deal.monto,
      })));
      setCommercialStages(commercial.etapas.map((stage) => ({
        id: stage.id,
        name: stage.nombre,
        position: stage.posicion,
        kind: "open",
        metaEvent: stage.eventoMeta,
      })));

      if (selectedPipelineId === PRINCIPAL) {
        const leadResponse = responses[1];
        if (!leadResponse?.ok) {
          const body = await leadResponse?.json().catch(() => null) as
            | { error?: { message?: string } }
            | null;
          throw new Error(body?.error?.message ?? "No se pudo cargar el tablero de leads");
        }
        const data = await leadResponse.json() as {
          stages: StageDto[];
          leads: BoardLead[];
          currency?: string;
          eventosMeta?: string[] | null;
        };
        if (requestId !== boardRequestId.current) return;
        if (data.currency) setCurrency(data.currency);
        setStages(data.stages);
        setLeads(data.leads);
        setEventosMeta(data.eventosMeta ?? null);
      } else {
        setLeads([]);
        setStages([]);
      }
    } catch (cause) {
      if (requestId === boardRequestId.current) {
        setError(
          cause instanceof TypeError
            ? "No se pudo conectar para cargar el embudo"
            : cause instanceof Error
              ? cause.message
              : "No se pudo cargar el embudo"
        );
      }
    } finally {
      if (requestId === boardRequestId.current) setLoading(false);
    }
  }, [selectedPipelineId]);

  const cargarEmbudos = useCallback(async () => {
    try {
      const response = await fetch("/api/crm/pipelines");
      const data = await response.json() as { embudos?: PipelineOption[] };
      if (!response.ok || !data.embudos) throw new Error("No se pudieron cargar los embudos");
      setPipelines(data.embudos);
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? "No se pudo conectar para cargar los embudos"
          : cause instanceof Error ? cause.message : "No se pudieron cargar los embudos"
      );
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    void cargarEmbudos();
  }, [cargarEmbudos]);

  function onDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);
    if (activeId.startsWith("deal:")) {
      const deal = deals.find((item) => item.id === activeId.slice("deal:".length));
      setActiveCard(deal ? { kind: "deal", deal } : null);
      return;
    }
    const lead = leads.find((item) => item.id === activeId);
    setActiveCard(lead ? { kind: "lead", lead } : null);
  }

  async function moverLead(
    leadId: string,
    overStage: string,
    loss?: { reason: LossReason; note: string }
  ) {
    const position = leads.filter((l) => l.stageId === overStage).length;
    await guardarLead(leadId, {
        stageId: overStage,
        position,
        ...(loss
          ? { lossReason: loss.reason, ...(loss.note ? { lossNote: loss.note } : {}) }
          : {}),
    });
  }

  async function guardarMonto(leadId: string, cents: number | null) {
    await guardarLead(leadId, { amountCents: cents });
  }

  async function guardarPrioridad(leadId: string, priority: PriorityValue | null) {
    await guardarLead(leadId, { priority });
  }

  async function guardarLead(leadId: string, cambios: Record<string, unknown>) {
    setError(null);
    let guardado = false;
    try {
      const res = await fetch(`/api/pipeline/leads/${leadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cambios),
      });
      if (!res.ok) {
        const datos = await res.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(datos?.error?.message ?? "No se pudo guardar el cambio");
      }
      guardado = true;
    } catch (err) {
      setError(err instanceof TypeError
        ? "No se pudo conectar para guardar el cambio"
        : err instanceof Error ? err.message : "No se pudo guardar el cambio");
    }
    if (guardado) await refetch();
  }

  async function guardarTrato(tratoId: string, cambios: Record<string, unknown>) {
    setError(null);
    let guardado = false;
    try {
      const response = await fetch(`/api/crm/deals/${tratoId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cambios),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!response.ok) throw new Error(data?.error?.message ?? "No se pudo guardar el trato");
      guardado = true;
    } catch (cause) {
      setError(
        cause instanceof TypeError
          ? "No se pudo conectar para guardar el trato"
          : cause instanceof Error
            ? cause.message
            : "No se pudo guardar el trato"
      );
    }
    if (guardado) await refetch();
  }

  async function crearEmbudo() {
    const nombre = newPipelineName.trim();
    if (!nombre) return;
    setError(null);
    setPipelineFormError(null);
    try {
      const response = await fetch("/api/crm/pipelines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const data = await response.json().catch(() => null) as
        | { embudo?: PipelineOption; error?: { message?: string } }
        | null;
      if (!response.ok || !data?.embudo) {
        throw new Error(data?.error?.message ?? "No se pudo crear el embudo");
      }
      setCreatingPipeline(false);
      setNewPipelineName("");
      setPipelines((current) => [
        ...current.filter((pipeline) => pipeline.id !== data.embudo?.id),
        data.embudo!,
      ].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setSelectedPipelineId(data.embudo.id);
    } catch (cause) {
      setPipelineFormError(
        cause instanceof TypeError
          ? "No se pudo conectar para crear el embudo"
          : cause instanceof Error ? cause.message : "No se pudo crear el embudo"
      );
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const activeId = String(event.active.id);
    const overStage = event.over ? String(event.over.id) : null;
    if (!overStage) return;
    if (activeId.startsWith("deal:")) {
      const deal = deals.find((item) => item.id === activeId.slice("deal:".length));
      if (deal && deal.stageId !== overStage) {
        await guardarTrato(deal.id, { etapaId: overStage });
      }
      return;
    }
    const leadId = activeId;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === overStage) return;

    // Perder un trato exige motivo. Se pregunta ANTES de mover: si el dueño
    // cancela, la tarjeta ni siquiera parpadea fuera de su columna.
    const destino = stages.find((s) => s.id === overStage);
    if (destino?.kind === "lost") {
      setPendingLoss({ leadId, stageId: overStage, name: lead.contact.name });
      return;
    }

    await moverLead(leadId, overStage);
  }

  /**
   * Cambiar de etapa desde el cajón. Entra por la MISMA puerta que el
   * arrastre: perder un trato exige motivo venga de donde venga, y duplicar
   * esa regla aquí sería tener dos sitios donde olvidarla.
   */
  function moverDesdeCajon(leadId: string, stageId: string) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === stageId) return;
    const destino = stages.find((s) => s.id === stageId);
    if (destino?.kind === "lost") {
      setPendingLoss({ leadId, stageId, name: lead.contact.name });
      return;
    }
    void moverLead(leadId, stageId);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h2 className="text-[17px] font-bold tracking-tight">Pipeline</h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Embudo
            <select
              aria-label="Seleccionar embudo"
              value={selectedPipelineId}
              disabled={!pipelines.length}
              onChange={(event) => {
                setSelectedPipelineId(event.target.value);
                setAbiertoId(null);
                setOpenDealId(null);
                setStages([]);
                setLeads([]);
                setCommercialStages([]);
                setDeals([]);
              }}
              className="h-9 max-w-[min(55vw,260px)] rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>{pipeline.nombre}</option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setPipelineFormError(null); setCreatingPipeline(true); }}
          >
            <Plus className="h-4 w-4" /> Nuevo embudo
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdministradorCamposButton entidad="trato" puedeAdministrar={puedeAdministrarCampos} />
          <Button size="sm" onClick={() => setCreatingDeal(true)} disabled={!etapasVisibles.length}>
            <BriefcaseBusiness className="h-4 w-4" /> Nuevo trato
          </Button>
          <Button variant="outline" size="sm" onClick={() => setManaging(true)} disabled={!selectedPipelineId}>
            <Settings2 className="h-4 w-4" /> Gestionar etapas
          </Button>
        </div>
      </header>
      {error && <p role="alert" className="px-4 pt-3 text-sm text-destructive">{error}</p>}

      {/* El tablero se arrastra en horizontal; en el teléfono cada columna
          se detiene en su sitio (snap) para no quedar a medio camino. */}
      <div className="flex-1 snap-x snap-mandatory overflow-x-auto p-3 sm:snap-none sm:p-4">
        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragEnd={(e) => void onDragEnd(e)}
        >
          <div className="flex h-full gap-3">
            {etapasVisibles.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                currency={currency}
                onEditAmount={setEditandoMonto}
                onOpen={(l) => setAbiertoId(l.id)}
                deals={deals.filter((deal) => deal.stageId === stage.id)}
                onOpenDeal={(deal) => setOpenDealId(deal.id)}
                leads={leads
                  .filter((l) => l.stageId === stage.id)
                  .sort((a, b) => a.position - b.position)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeCard?.kind === "lead" ? (
              <LeadCard lead={activeCard.lead} currency={currency} overlay />
            ) : activeCard?.kind === "deal" ? (
              <DealVisual deal={activeCard.deal} currency={currency} overlay />
            ) : null}
          </DragOverlay>
        </DndContext>
        {loading && <p className="p-4 text-sm text-muted-foreground">Cargando embudo…</p>}
        {!loading && !error && etapasVisibles.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Este embudo no tiene etapas todavía. Agrégalas desde “Gestionar etapas”.
          </div>
        )}
      </div>

      {managing && selectedPipelineId === PRINCIPAL && (
        <StageManager
          stages={stages}
          eventosMeta={eventosMeta}
          onClose={() => setManaging(false)}
          onChanged={() => void refetch()}
        />
      )}
      {managing && selectedPipelineId !== PRINCIPAL && (
        <CommercialStageManager
          pipelineId={selectedPipelineId}
          stages={commercialStages}
          eventosMeta={eventosMeta}
          onClose={() => setManaging(false)}
          onChanged={() => void refetch()}
        />
      )}

      {/* Va ANTES que los diálogos: con el mismo z-index, el que se pinta
          después queda encima, y el motivo de pérdida debe tapar al cajón. */}
      {abierto && (
        <LeadDrawer
          lead={abierto}
          stages={stages}
          currency={currency}
          onClose={() => setAbiertoId(null)}
          onMoveStage={(stageId) => moverDesdeCajon(abierto.id, stageId)}
          onAmount={(cents) => void guardarMonto(abierto.id, cents)}
          onPriority={(p) => void guardarPrioridad(abierto.id, p)}
        />
      )}
      {tratoAbierto && (
        <DealDrawer
          deal={tratoAbierto}
          stages={etapasVisibles}
          onClose={() => setOpenDealId(null)}
          onChanged={() => void refetch()}
        />
      )}

      {editandoMonto && (
        <AmountDialog
          leadName={editandoMonto.contact.name}
          currency={editandoMonto.currency ?? currency}
          amountCents={editandoMonto.amountCents}
          priority={editandoMonto.priority}
          onPriorityChange={(p) => {
            setEditandoMonto({ ...editandoMonto, priority: p });
            void guardarPrioridad(editandoMonto.id, p);
          }}
          onCancel={() => setEditandoMonto(null)}
          onSave={(cents) => {
            const leadId = editandoMonto.id;
            setEditandoMonto(null);
            void guardarMonto(leadId, cents);
          }}
        />
      )}
      {creatingDeal && (
        <DealFormDialog
          pipelineId={selectedPipelineId}
          stages={etapasVisibles}
          initialCurrency={currency}
          onClose={() => setCreatingDeal(false)}
          onCreated={() => void refetch()}
        />
      )}

      {creatingPipeline && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Crear embudo"
          onClick={() => setCreatingPipeline(false)}
        >
          <form
            className="w-full max-w-sm space-y-4 rounded-lg border bg-popover p-5 shadow-pop"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => { event.preventDefault(); void crearEmbudo(); }}
          >
            <h3 className="font-semibold">Nuevo embudo</h3>
            <label className="block text-sm font-medium">
              Nombre
              <Input
                autoFocus
                value={newPipelineName}
                onChange={(event) => setNewPipelineName(event.target.value)}
                maxLength={100}
                className="mt-1"
              />
            </label>
            {pipelineFormError && <p role="alert" className="text-sm text-destructive">{pipelineFormError}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreatingPipeline(false)}>Cancelar</Button>
              <Button type="submit" disabled={!newPipelineName.trim()}>Crear</Button>
            </div>
          </form>
        </div>
      )}

      {pendingLoss && (
        <LossReasonDialog
          leadName={pendingLoss.name}
          onCancel={() => setPendingLoss(null)}
          onConfirm={(reason, note) => {
            const { leadId, stageId } = pendingLoss;
            setPendingLoss(null);
            void moverLead(leadId, stageId, { reason, note });
          }}
        />
      )}
    </div>
  );
}

/**
 * Totales de una columna. Se calculan al pintar: un total guardado se
 * desincroniza en cuanto alguien mueve una tarjeta, y sumar unas decenas es
 * gratis. Todo en CENTAVOS enteros — el dinero jamás pasa por coma flotante.
 */
function totalesDeEtapa(leads: BoardLead[], businessCurrency: string) {
  let totalCents = 0;
  let sinMonto = 0;
  let otraMoneda = 0;

  for (const l of leads) {
    if (l.amountCents === null) {
      sinMonto++;
      continue;
    }
    if (!sumable({ amountCents: l.amountCents, currency: l.currency }, businessCurrency)) {
      otraMoneda++;
      continue;
    }
    totalCents += l.amountCents;
  }
  return { totalCents, sinMonto, otraMoneda };
}

function StageColumn({
  stage,
  leads,
  deals,
  currency,
  onEditAmount,
  onOpen,
  onOpenDeal,
}: {
  stage: StageDto;
  leads: BoardLead[];
  deals: BoardDeal[];
  currency: string;
  onEditAmount: (lead: BoardLead) => void;
  onOpen: (lead: BoardLead) => void;
  onOpenDeal: (deal: BoardDeal) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full w-64 shrink-0 snap-start flex-col rounded-lg border border-border-strong bg-subtle transition-[box-shadow,border-color]",
        isOver && "border-brand ring-[3px] ring-brand-soft"
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-[13.5px] font-bold tracking-tight">
          {stage.kind === "won" && <Trophy className="h-3.5 w-3.5 text-primary" />}
          {stage.kind === "lost" && (
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {stage.name}
        </span>
        <span
          className="rounded-full border border-border-strong bg-background px-2 py-0.5 font-mono text-[11px] text-text-3"
          aria-label={`${leads.length} leads y ${deals.length} tratos`}
        >
          {leads.length + deals.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {leads.map((lead) => (
          <DraggableLead
            key={lead.id}
            lead={lead}
            currency={currency}
            onEditAmount={onEditAmount}
            onOpen={onOpen}
          />
        ))}
        {deals.map((deal) => (
          <DraggableDeal
            key={deal.id}
            deal={deal}
            currency={currency}
            onOpen={onOpenDeal}
          />
        ))}
      </div>
      <StageFooter leads={leads} deals={deals} currency={currency} />
    </div>
  );
}

/** Cuánto dinero hay en esta etapa, y qué quedó fuera de la cuenta. */
function StageFooter({ leads, deals, currency }: { leads: BoardLead[]; deals: BoardDeal[]; currency: string }) {
  const { totalCents, sinMonto, otraMoneda } = totalesDeEtapa(leads, currency);
  const conMonto = leads.length - sinMonto - otraMoneda;
  const dealTotals = totalizarTratosPorMoneda(deals.map((deal) => ({
    amountCents: deal.amount?.centavos ?? null,
    currency: deal.amount?.moneda ?? null,
  })), currency);

  return (
    <div className="space-y-1 border-t px-3 py-2 text-[11px]">
      {leads.length > 0 && (
        conMonto === 0 ? (
          <p className="text-muted-foreground">Leads: sin montos en {currency}</p>
        ) : (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground">
              Leads{sinMonto > 0 ? ` · ${sinMonto} sin monto` : ""}
            </span>
            <span className="font-semibold tabular-nums">
              {formatMoneyCents(totalCents, currency)}
            </span>
          </div>
        )
      )}
      {otraMoneda > 0 && (
        <p className="text-warning-text">{otraMoneda} lead(s) en otra moneda</p>
      )}
      {deals.length > 0 && (
        <p className="text-muted-foreground">{deals.length} {deals.length === 1 ? "trato" : "tratos"}</p>
      )}
      {dealTotals.map((total) => (
        <div key={total.currency} className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground">Tratos · {total.currency}</span>
          <span className="font-semibold tabular-nums">
            {formatMoneyCents(total.amountCents, total.currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

function DraggableDeal({
  deal,
  currency,
  onOpen,
}: {
  deal: BoardDeal;
  currency: string;
  onOpen: (deal: BoardDeal) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `deal:${deal.id}`,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(deal)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !isDragging) {
          event.preventDefault();
          onOpen(deal);
        } else {
          listeners?.onKeyDown?.(event);
        }
      }}
      aria-label={`Abrir el trato ${deal.title}`}
      className={cn("touch-none", isDragging && "opacity-40")}
    >
      <DealVisual deal={deal} currency={currency} />
    </div>
  );
}

function DealVisual({
  deal,
  currency,
  overlay = false,
}: {
  deal: BoardDeal;
  currency: string;
  overlay?: boolean;
}) {
  return (
    <div className={cn(
      "cursor-grab rounded-md border border-border-strong bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
      overlay && "rotate-2 shadow-pop"
    )}>
      <div className="flex items-start gap-2">
        <BriefcaseBusiness aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{deal.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">{deal.contact.name}</p>
        </div>
      </div>
      {deal.amount ? (
        <p className="mt-2 text-right text-xs font-semibold tabular-nums">
          {formatMoneyCents(deal.amount.centavos, deal.amount.moneda || currency)}
        </p>
      ) : (
        <p className="mt-2 text-right text-xs text-muted-foreground">Sin importe</p>
      )}
    </div>
  );
}

function DraggableLead({
  lead,
  currency,
  onEditAmount,
  onOpen,
}: {
  lead: BoardLead;
  currency: string;
  onEditAmount: (lead: BoardLead) => void;
  onOpen: (lead: BoardLead) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // Abrir y arrastrar conviven porque el sensor solo activa el arrastre a
      // los 6 px de movimiento: un clic quieto nunca llega a ser un arrastre.
      // Los controles de dentro de la tarjeta cortan la propagación, para que
      // tocar "+ monto" no abra además el cajón.
      onClick={() => onOpen(lead)}
      // dnd-kit ya deja el nodo con `role="button"` y `tabIndex`, pero un div
      // no dispara `click` con el teclado: sin esto, el cajón sería alcanzable
      // solo con el ratón.
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(lead);
        }
      }}
      aria-label={`Abrir el trato de ${lead.contact.name}`}
      className={cn(isDragging && "opacity-40")}
    >
      <LeadCard lead={lead} currency={currency} onEditAmount={onEditAmount} />
    </div>
  );
}

function LeadCard({
  lead,
  currency,
  overlay = false,
  onEditAmount,
}: {
  lead: BoardLead;
  currency: string;
  overlay?: boolean;
  onEditAmount?: (lead: BoardLead) => void;
}) {
  return (
    <div
      className={cn(
        "cursor-grab rounded-md border border-border-strong bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        overlay && "rotate-2 shadow-pop"
      )}
    >
      <div className="flex items-center gap-2.5">
        <ContactAvatar name={lead.contact.name} seed={lead.contact.id} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold">{lead.contact.name}</p>
            {lead.priority && <PriorityBadge value={lead.priority} />}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {lead.lastActivityAt
              ? `Actividad: ${formatTime(lead.lastActivityAt)}`
              : "Sin actividad"}
          </p>
        </div>
        {lead.conversationId && (
          <Link
            href={`/inbox?contact=${lead.contact.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            aria-label="Abrir conversación"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <MessageSquareText className="h-4 w-4" />
          </Link>
        )}
      </div>
      {!overlay && onEditAmount && (
        <button
          // `stopPropagation` en pointerdown: sin esto, tocar el monto empieza
          // un arrastre y el diálogo nunca abre.
          onPointerDown={(e) => e.stopPropagation()}
          // También en `click`: sin esto, tocar el monto abriría además el
          // cajón, porque el evento sigue subiendo hasta la tarjeta.
          onClick={(e) => {
            e.stopPropagation();
            onEditAmount(lead);
          }}
          className={cn(
            "mt-1.5 w-full rounded px-1 py-0.5 text-right text-xs tabular-nums hover:bg-accent",
            lead.amountCents === null
              ? "text-text-3"
              : "font-semibold text-foreground"
          )}
        >
          {lead.amountCents === null
            ? "+ monto"
            : formatMoneyCents(lead.amountCents, lead.currency ?? currency)}
        </button>
      )}
      {overlay && lead.amountCents !== null && (
        <p className="mt-1.5 text-right text-xs font-semibold tabular-nums">
          {formatMoneyCents(lead.amountCents, lead.currency ?? currency)}
        </p>
      )}
    </div>
  );
}
