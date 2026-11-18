"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ContactAvatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Estado = { id: string; estado: "pendiente" | "activo" | "eliminando" };

export function AvatarContacto({
  id, nombre, avatarId, size = "md",
}: { id: string; nombre: string; avatarId: string | null | undefined; size?: "md" | "lg" }) {
  const [fallo, setFallo] = useState(false);
  useEffect(() => { setFallo(false); }, [id, avatarId]);
  if (!avatarId || fallo) return <ContactAvatar name={nombre} seed={id} size={size} />;
  const dimension = size === "lg" ? 48 : 36;
  return <Image unoptimized src={`/api/contacts/${encodeURIComponent(id)}/avatar/image?v=${encodeURIComponent(avatarId)}`}
    alt="" width={dimension} height={dimension}
    className="shrink-0 rounded-full object-cover" style={{ width: dimension, height: dimension }}
    onError={() => setFallo(true)} />;
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  let respuesta: Response;
  try { respuesta = await fetch(url, init); }
  catch { throw new Error("No se pudo conectar con el servidor"); }
  const datos = await respuesta.json().catch(() => null) as ({ error?: { message?: string } } & T) | null;
  if (!respuesta.ok) throw new Error(datos?.error?.message ?? `La operación falló (HTTP ${respuesta.status})`);
  if (!datos) throw new Error("El servidor devolvió una respuesta inválida");
  return datos;
}

export function EditorAvatar({ id, nombre, onCambio }: { id: string; nombre: string; onCambio: () => void }) {
  const [avatar, setAvatar] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [disponible, setDisponible] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const url = `/api/contacts/${encodeURIComponent(id)}/avatar`;

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setDisponible(false);
    setError(null);
    void pedir<{ avatar: Estado | null }>(url).then((datos) => {
      if (vigente) { setAvatar(datos.avatar); setDisponible(true); }
    }).catch((err: unknown) => {
      if (vigente) setError(err instanceof Error ? err.message : "No se pudo cargar el avatar");
    }).finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [url]);

  async function cargar(file: File | undefined) {
    if (!file) return;
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const datos = await pedir<{ avatar: Estado }>(url, {
        method: "POST", headers: { "content-type": "application/octet-stream" }, body: file,
      });
      setAvatar(datos.avatar);
      setAviso("Avatar guardado.");
      onCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el avatar");
      try {
        const datos = await pedir<{ avatar: Estado | null }>(url);
        setAvatar(datos.avatar);
        onCambio();
      } catch {
        setError("No se pudo confirmar el estado del avatar. Cierra y vuelve a abrir el perfil para reintentar.");
        setDisponible(false);
      }
    } finally { setOcupado(false); }
  }

  async function eliminar() {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      await pedir(url, { method: "DELETE" });
      setAvatar(null);
      setAviso("Avatar eliminado.");
      onCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el avatar");
      try {
        const datos = await pedir<{ avatar: Estado | null }>(url);
        setAvatar(datos.avatar);
        onCambio();
      } catch {
        setError("No se pudo confirmar el estado del avatar. Cierra y vuelve a abrir el perfil para reintentar.");
        setDisponible(false);
      }
    } finally { setOcupado(false); }
  }

  return (
    <section className="space-y-2 rounded-md border p-3" aria-label="Avatar del contacto">
      <div className="flex items-center gap-3">
        <AvatarContacto id={id} nombre={nombre} avatarId={avatar?.estado === "activo" ? avatar.id : null} size="lg" />
        <div>
          <h4 className="text-sm font-semibold">Avatar</h4>
          <p className="text-xs text-muted-foreground">Imagen privada JPEG, PNG o WebP; máximo 5 MB.</p>
        </div>
      </div>
      {cargando ? <p className="text-sm text-muted-foreground">Cargando avatar…</p> : disponible && (
        avatar ? (
          <div className="flex flex-wrap items-center gap-2">
            {avatar.estado !== "activo" && <p className="text-sm text-muted-foreground">
              {avatar.estado === "pendiente" ? "La carga quedó pendiente." : "El borrado está pendiente."}
            </p>}
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => void eliminar()}>
              {avatar.estado === "activo" ? "Eliminar avatar" : "Retirar archivo pendiente"}
            </Button>
          </div>
        ) : (
          <Input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Cargar avatar" disabled={ocupado}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void cargar(file);
            }} />
        )
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {aviso && <p role="status" className="text-sm text-muted-foreground">{aviso}</p>}
    </section>
  );
}
