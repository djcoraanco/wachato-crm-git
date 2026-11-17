"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  BotOff,
  Download,
  MessageSquareText,
  Search,
  Send,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import type { ContactDto } from "@/lib/types";
import { CHANNEL_LABEL, CHANNEL_ORDER, type Channel } from "@/lib/channels";
import { formatPhone } from "@/lib/utils";
import { ContactAvatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SOURCE_LABELS } from "@/server/contact-source";
import { priorityRank } from "@/server/leads/priority";
import { PriorityBadge } from "@/components/pipeline/priority-picker";
import { ImportContactsDialog } from "./import-contacts-dialog";
import { NewContactDialog } from "./new-contact-dialog";
import { StartConversation } from "./start-conversation";
import { EmpresasClient } from "./empresas-client";
import { PerfilContactoDialog } from "./perfil-contacto-dialog";

export function ContactsClient() {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [mostrarEmpresas, setMostrarEmpresas] = useState(false);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [channel, setChannel] = useState<Channel | "all">("all");
  const [stages, setStages] = useState<string[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ContactDto | null>(null);
  const [perfil, setPerfil] = useState<ContactDto | null>(null);
  const [creando, setCreando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [escribiendo, setEscribiendo] = useState<ContactDto | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [exportando, setExportando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const peticionRef = useRef(0);

  // Mismo rescate que en la Bandeja: lo tecleado antes de que hidrate el JS
  // se perdía en silencio. Ver conversation-list.tsx.
  useEffect(() => {
    const typed = inputRef.current?.value ?? "";
    if (typed) setQuery(typed);
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/pipeline/stages").catch(() => null);
      if (!res?.ok) return;
      const data = (await res.json()) as { stages: { name: string }[] };
      setStages(data.stages.map((s) => s.name));
    })();
  }, []);

  const filtros = useCallback(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (stage !== "all") params.set("stage", stage);
    if (channel !== "all") params.set("channel", channel);
    if (showArchived) params.set("archived", "true");
    return params;
  }, [query, stage, channel, showArchived]);

  const refetch = useCallback(async () => {
    const numero = ++peticionRef.current;
    const params = filtros();
    const res = await fetch(`/api/contacts?${params}`).catch(() => null);
    if (numero !== peticionRef.current) return;
    if (!res?.ok) {
      setError("No se pudieron cargar los contactos");
      return;
    }
    const data = (await res.json()) as { contacts: ContactDto[] };
    if (numero !== peticionRef.current) return;
    setHayMas(data.contacts.length === 200);
    // A quién llamar primero: alta arriba, sin prioridad al final. El orden lo
    // decide esta lista, no el servidor, porque es una preferencia de trabajo y
    // no un dato del contacto.
    setContacts(
      [...data.contacts].sort(
        (a, b) => priorityRank(a.priority ?? null) - priorityRank(b.priority ?? null)
      )
    );
  }, [filtros]);

  async function cargarMas() {
    const numero = peticionRef.current;
    setCargandoMas(true);
    try {
      const params = filtros();
      params.set("offset", String(contacts.length));
      const res = await fetch(`/api/contacts?${params}`);
      if (!res.ok) throw new Error("No se pudieron cargar más contactos");
      const data = (await res.json()) as { contacts: ContactDto[] };
      if (numero !== peticionRef.current) return;
      setContacts((actuales) => [...actuales, ...data.contacts].sort(
        (a, b) => priorityRank(a.priority ?? null) - priorityRank(b.priority ?? null)
      ));
      setHayMas(data.contacts.length === 200);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar más contactos");
    } finally {
      setCargandoMas(false);
    }
  }

  async function exportar(formato: "xlsx" | "pdf") {
    setExportando(true);
    setError(null);
    try {
      const params = filtros();
      params.set("format", formato);
      const res = await fetch(`/api/contacts/export?${params}`);
      if (!res.ok) {
        let mensaje = `No se pudo exportar (HTTP ${res.status}). Revisa los registros del servidor.`;
        if (res.headers.get("content-type")?.includes("application/json")) {
          try {
            const data: unknown = await res.json();
            if (data && typeof data === "object" && "error" in data &&
                data.error && typeof data.error === "object" && "message" in data.error &&
                typeof data.error.message === "string") {
              mensaje = data.error.message;
            }
          } catch (error) {
            if (!(error instanceof SyntaxError)) throw error;
            console.warn("[contactos] respuesta de exportación JSON inválida", res.status);
          }
        } else {
          console.warn("[contactos] respuesta de exportación no es JSON", res.status);
        }
        throw new Error(mensaje);
      }
      const url = URL.createObjectURL(await res.blob());
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = `contactos-${new Date().toISOString().slice(0, 10)}.${formato}`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof TypeError ? "No se pudo conectar para exportar"
        : err instanceof Error ? err.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void refetch(), 250);
    return () => clearTimeout(t);
  }, [refetch]);

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(data?.error?.message ?? "No se pudo actualizar el contacto");
      }
      await refetch();
      return true;
    } catch (err) {
      setError(err instanceof TypeError ? "No se pudo conectar para actualizar el contacto"
        : err instanceof Error ? err.message : "No se pudo actualizar el contacto");
      return false;
    }
  }

  if (mostrarEmpresas) return <EmpresasClient onVolver={() => setMostrarEmpresas(false)} />;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[17px] font-bold tracking-tight">Contactos</h2>
          <Button size="sm" variant="outline" onClick={() => setMostrarEmpresas(true)}>
            Empresas
          </Button>
          <Button size="sm" onClick={() => setCreando(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" strokeWidth={1.8} />
            Nuevo contacto
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setImportando(true)}>
            <Upload className="mr-1.5 h-4 w-4" strokeWidth={1.8} />
            Importar
          </Button>
          <Button size="sm" variant="outline" disabled={exportando} onClick={() => void exportar("xlsx")}>
            <Download className="mr-1.5 h-4 w-4" /> Descargar Excel
          </Button>
          <Button size="sm" variant="outline" disabled={exportando} onClick={() => void exportar("pdf")}>
            <Download className="mr-1.5 h-4 w-4" /> Descargar PDF
          </Button>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-primary"
            />
            Ver archivados
          </label>
          {stages.length > 0 && (
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              aria-label="Filtrar por etapa del embudo"
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            >
              <option value="all">Toda etapa</option>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel | "all")}
            aria-label="Filtrar por canal"
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="all">Todos los canales</option>
            {CHANNEL_ORDER.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </select>
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Buscar por nombre, teléfono o usuario…"
              aria-label="Buscar contacto"
              defaultValue=""
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-8 sm:w-72"
            />
          </div>
        </div>
      </header>

      {error && <p role="alert" className="px-4 pt-3 text-sm text-destructive">{error}</p>}
      <p className="px-4 pt-3 text-xs text-muted-foreground">
        La descarga incluye todos los contactos que coinciden con los filtros, incluso los aún no cargados. Las etiquetas todavía no están disponibles.
      </p>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {contacts.length === 0 ? (
          query.trim() || stage !== "all" || channel !== "all" ? (
            <EmptyState
              icon={Search}
              className="h-full"
              title="Sin resultados"
              description={
                <>
                  Nadie coincide con
                  {query.trim() ? ` «${query.trim()}»` : ""}
                  {query.trim() && stage !== "all" ? " en" : ""}
                  {stage !== "all" ? ` la etapa «${stage}»` : ""}.
                  {channel !== "all" ? ` Canal: ${CHANNEL_LABEL[channel]}.` : ""}
                </>
              }
            />
          ) : (
            <EmptyState
              icon={Users}
              className="h-full"
              title="Sin contactos"
              description="Cada persona que escriba a tu WhatsApp quedará registrada aquí automáticamente."
            />
          )
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-3 sm:flex-nowrap sm:gap-x-4 sm:px-4"
              >
                <ContactAvatar name={c.name} seed={c.id} />
                {/* El 60% mínimo es lo que empuja los botones a su propio
                    renglón en el teléfono en vez de exprimir el nombre. */}
                <div className="min-w-[60%] flex-1 sm:min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {c.name}
                    </span>
                    {c.priority && <PriorityBadge value={c.priority} />}
                    {c.stageName && (
                      <Badge variant="outline">{c.stageName}</Badge>
                    )}
                    {c.archivedAt && (
                      <Badge variant="secondary">Archivado</Badge>
                    )}
                    {c.aiPaused && (
                      <Badge
                        variant="warning"
                        title="El agente no le responde a este contacto: lo atiendes tú"
                      >
                        <BotOff className="mr-1 h-3 w-3" strokeWidth={1.8} />
                        Sin agente
                      </Badge>
                    )}
                    {/* Solo la fuente que alguien capturó: presentar una
                        deducción como dato la volvería un número inventado en
                        cuanto se cuente por fuente. */}
                    {c.source?.source === "capturada" && (
                      <Badge variant="secondary">
                        {SOURCE_LABELS[c.source.value]}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatPhone(c.phone)}
                    {c.notes ? ` · ${c.notes.slice(0, 60)}` : ""}
                  </p>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setPerfil(c)}>Perfil</Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setError(null); setEditing(c); }}
                  >
                    Editar
                  </Button>
                  {/* A quien nunca escribió hay que abrirle la conversación con
                      una plantilla: es regla de Meta, no del CRM. */}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Escribir primero"
                    title="Escribir primero (con plantilla)"
                    onClick={() => setEscribiendo(c)}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  <Link href={`/inbox?contact=${c.id}`}>
                    <Button variant="ghost" size="icon" aria-label="Abrir conversación">
                      <MessageSquareText className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={c.archivedAt ? "Desarchivar" : "Archivar"}
                    onClick={() => void patch(c.id, { archived: !c.archivedAt })}
                  >
                    {c.archivedAt ? (
                      <ArchiveRestore className="h-4 w-4" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </li>
            ))}
            {hayMas && (
              <li><Button variant="outline" disabled={cargandoMas} onClick={() => void cargarMas()}>Cargar más</Button></li>
            )}
          </ul>
        )}
      </div>

      {editing && (
        <EditDialog
          contact={editing}
          error={error}
          onClose={() => setEditing(null)}
          onSave={async (patchBody) => {
            if (await patch(editing.id, patchBody)) setEditing(null);
          }}
        />
      )}
      {perfil && <PerfilContactoDialog id={perfil.id} nombre={perfil.name} onClose={() => setPerfil(null)} />}

      {escribiendo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Escribir primero"
        >
          <div className="w-full max-w-md rounded-lg border bg-popover p-4 shadow-pop">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className="font-semibold">
                Escribir a {escribiendo.name}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setEscribiendo(null)}>
                Cerrar
              </Button>
            </div>
            <StartConversation
              contactId={escribiendo.id}
              onStarted={() => {
                const contactId = escribiendo.id;
                setEscribiendo(null);
                // La Bandeja resuelve por CONTACTO (`?contact=`), no por
                // conversación: con `?conversation=` no seleccionaría nada.
                router.push(`/inbox?contact=${contactId}`);
              }}
            />
          </div>
        </div>
      )}

      {importando && (
        <ImportContactsDialog
          onClose={() => setImportando(false)}
          onImported={() => void refetch()}
        />
      )}

      {creando && (
        <NewContactDialog
          onClose={() => setCreando(false)}
          onCreated={() => {
            setCreando(false);
            void refetch();
          }}
          onOpenExisting={(contactId) => {
            setCreando(false);
            router.push(`/inbox?contact=${contactId}`);
          }}
        />
      )}
    </div>
  );
}

function EditDialog({
  contact,
  error,
  onClose,
  onSave,
}: {
  contact: ContactDto;
  error: string | null;
  onClose: () => void;
  onSave: (patch: { name: string; notes: string; aiPaused?: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(contact.name);
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [aiPaused, setAiPaused] = useState(contact.aiPaused ?? false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-overlay p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-lg border bg-popover p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-semibold">Editar contacto</h3>
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="edit-name">
              Nombre
            </label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="edit-notes">
              Notas
            </label>
            <Textarea
              id="edit-notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {/* 027 */}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={aiPaused}
              onChange={(e) => setAiPaused(e.target.checked)}
              className="mt-0.5 accent-primary"
            />
            <span>
              El agente no le responde
              <span className="block text-[11px] text-text-3">
                Sus mensajes llegan a la Bandeja y los atiendes tú.
              </span>
            </span>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={() =>
              void onSave({
                name: name.trim(),
                notes,
                // Solo si cambió: mandarlo siempre reescribiría el interruptor
                // de la Bandeja cada vez que alguien corrige un nombre.
                ...(aiPaused !== (contact.aiPaused ?? false) ? { aiPaused } : {}),
              })
            }
          >
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
