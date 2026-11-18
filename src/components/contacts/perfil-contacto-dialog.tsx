"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CamposPersonalizadosEditor } from "./campos-personalizados";
import { EditorAvatar } from "./avatar-contacto";

type Perfil = {
  firstName: string | null;
  lastName: string | null;
  identification: string | null;
  phones: string[];
  emails: string[];
  birthDate: string | null;
  preferredChannel: string | null;
  address: { street?: string; city?: string; region?: string; postalCode?: string; country?: string } | null;
  consents: Record<string, { granted: boolean; recordedAt: string }>;
};

const vacio: Perfil = {
  firstName: null, lastName: null, identification: null, phones: [], emails: [],
  birthDate: null, preferredChannel: null, address: null, consents: {},
};

export function PerfilContactoDialog({
  id,
  nombre,
  onAvatarCambio,
  onClose,
}: {
  id: string;
  nombre: string;
  onAvatarCambio: () => void;
  onClose: () => void;
}) {
  const [perfil, setPerfil] = useState<Perfil>(vacio);
  const [telefonos, setTelefonos] = useState("");
  const [correos, setCorreos] = useState("");
  const [direccion, setDireccion] = useState({ street: "", city: "", region: "", postalCode: "", country: "" });
  const [consentimiento, setConsentimiento] = useState("");
  const [cargando, setCargando] = useState(true);
  const [cargaCorrecta, setCargaCorrecta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/contacts/${id}/profile`, { signal: controller.signal }).then(async (res) => {
      if (!res.ok) throw new Error("No se pudo cargar el perfil");
      const datos = await res.json() as { perfil: Perfil | null };
      const valor = datos.perfil ?? vacio;
      setPerfil(valor);
      setTelefonos(valor.phones.join("\n"));
      setCorreos(valor.emails.join("\n"));
      setDireccion({
        street: valor.address?.street ?? "", city: valor.address?.city ?? "",
        region: valor.address?.region ?? "", postalCode: valor.address?.postalCode ?? "",
        country: valor.address?.country ?? "",
      });
      setCargaCorrecta(true);
      setCargando(false);
    }).catch((err: unknown) => {
      if (!controller.signal.aborted) {
        setError(err instanceof TypeError ? "No se pudo conectar para cargar el perfil"
          : err instanceof Error ? err.message : "No se pudo cargar el perfil");
        setCargando(false);
      }
    });
    return () => controller.abort();
  }, [id]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const partes = Object.fromEntries(Object.entries(direccion).filter(([, valor]) => valor.trim()));
      const lineas = (valor: string) => valor.split("\n").map((linea) => linea.trim()).filter(Boolean);
      const res = await fetch(`/api/contacts/${id}/profile`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: perfil.firstName || null, lastName: perfil.lastName || null,
          identification: perfil.identification || null, birthDate: perfil.birthDate || null,
          preferredChannel: perfil.preferredChannel || null,
          phones: lineas(telefonos), emails: lineas(correos),
          address: Object.keys(partes).length ? partes : null,
          ...(consentimiento ? { consents: { whatsapp: {
            granted: consentimiento === "si", recordedAt: new Date().toISOString(),
          } } } : {}),
        }),
      });
      if (!res.ok) {
        const datos = await res.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(datos?.error?.message ?? "No se pudo guardar el perfil");
      }
      onClose();
    } catch (err) {
      setError(err instanceof TypeError ? "No se pudo conectar para guardar el perfil"
        : err instanceof Error ? err.message : "No se pudo guardar el perfil");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-overlay p-4"
      role="dialog" aria-modal="true" aria-label={`Perfil de ${nombre}`}>
      <div className="max-h-[85dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-lg border bg-popover p-5 shadow-xl">
        <h3 className="font-semibold">Perfil de {nombre}</h3>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {cargando ? <p>Cargando perfil…</p> : cargaCorrecta && (
          <>
            <EditorAvatar id={id} nombre={nombre} onCambio={onAvatarCambio} />
            <label className="block text-sm">Nombre
              <Input value={perfil.firstName ?? ""} onChange={(e) => setPerfil({ ...perfil, firstName: e.target.value })} />
            </label>
            <label className="block text-sm">Apellidos
              <Input value={perfil.lastName ?? ""} onChange={(e) => setPerfil({ ...perfil, lastName: e.target.value })} />
            </label>
            <label className="block text-sm">Identificación
              <Input value={perfil.identification ?? ""} onChange={(e) => setPerfil({ ...perfil, identification: e.target.value })} />
            </label>
            <label className="block text-sm">Teléfonos, uno por línea
              <Textarea rows={2} value={telefonos} onChange={(e) => setTelefonos(e.target.value)} />
            </label>
            <label className="block text-sm">Correos, uno por línea
              <Textarea rows={2} value={correos} onChange={(e) => setCorreos(e.target.value)} />
            </label>
            <label className="block text-sm">Fecha de nacimiento
              <Input type="date" value={perfil.birthDate ?? ""} onChange={(e) => setPerfil({ ...perfil, birthDate: e.target.value })} />
            </label>
            {([
              ["street", "Dirección"], ["city", "Ciudad"], ["region", "Estado o región"],
              ["postalCode", "Código postal"], ["country", "País"],
            ] as const).map(([clave, etiqueta]) => (
              <label key={clave} className="block text-sm">{etiqueta}
                <Input value={direccion[clave]} onChange={(e) => setDireccion({ ...direccion, [clave]: e.target.value })} />
              </label>
            ))}
            <label className="block text-sm">Canal preferido
              <select className="mt-1 h-9 w-full rounded-md border border-input bg-card px-3"
                value={perfil.preferredChannel ?? ""} onChange={(e) => setPerfil({ ...perfil, preferredChannel: e.target.value })}>
                <option value="">Sin preferencia</option>
                {["whatsapp", "instagram", "messenger", "tiktok", "phone", "email"].map((canal) => (
                  <option key={canal} value={canal}>{canal}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">Registrar consentimiento para WhatsApp
              <select className="mt-1 h-9 w-full rounded-md border border-input bg-card px-3"
                value={consentimiento} onChange={(e) => setConsentimiento(e.target.value)}>
                <option value="">No cambiar</option>
                <option value="si">Autorizado</option>
                <option value="no">No autorizado</option>
              </select>
            </label>
            <p className="text-sm text-muted-foreground">
              {perfil.consents.whatsapp
                ? `Estado registrado: ${perfil.consents.whatsapp.granted ? "autorizado" : "no autorizado"} (${new Date(perfil.consents.whatsapp.recordedAt).toLocaleDateString("es-MX")})`
                : "No hay consentimiento de WhatsApp registrado."}
            </p>
            <CamposPersonalizadosEditor entidad="contacto" entidadId={id} />
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          <Button disabled={!cargaCorrecta || guardando}
            onClick={() => void guardar()}>Guardar perfil</Button>
        </div>
      </div>
    </div>
  );
}
