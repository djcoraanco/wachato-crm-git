"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Empresa = {
  id: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  parentCompanyId: string | null;
  address: { street?: string; city?: string; region?: string; postalCode?: string; country?: string } | null;
};
type Contacto = { id: string; name: string; phone: string | null };
type Detalle = Empresa & { contactos: Contacto[] };

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (error) {
    if (error instanceof TypeError) throw new Error("No se pudo conectar con el servidor");
    throw error;
  }
  const data = await res.json() as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(data.error?.message ?? "No se pudo completar la operación");
  return data;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export function EmpresasClient({ onVolver }: { onVolver: () => void }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [nombre, setNombre] = useState("");
  const [fiscal, setFiscal] = useState("");
  const [telefono, setTelefono] = useState("");
  const [matriz, setMatriz] = useState("");
  const [direccion, setDireccion] = useState({ street: "", city: "", region: "", postalCode: "", country: "" });
  const [busqueda, setBusqueda] = useState("");
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actualizar = useCallback(async () => {
    try {
      const datos = await pedir<{ empresas: Empresa[] }>("/api/crm/companies");
      setEmpresas(datos.empresas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las empresas");
    }
  }, []);

  useEffect(() => { void actualizar(); }, [actualizar]);

  useEffect(() => {
    if (!detalle || busqueda.trim().length < 2) {
      setContactos([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(() => {
      void pedir<{ contacts: Contacto[] }>(`/api/contacts?q=${encodeURIComponent(busqueda.trim())}`, {
        signal: controller.signal,
      }).then((datos) => setContactos(datos.contacts)).catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "No se pudieron buscar contactos");
      });
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [busqueda, detalle]);

  async function abrir(id: string) {
    const datos = await pedir<{ empresa: Detalle }>(`/api/crm/companies/${id}`);
    setDetalle(datos.empresa);
    setNombre(datos.empresa.name);
    setFiscal(datos.empresa.taxId ?? "");
    setTelefono(datos.empresa.phone ?? "");
    setMatriz(datos.empresa.parentCompanyId ?? "");
    setDireccion({
      street: datos.empresa.address?.street ?? "",
      city: datos.empresa.address?.city ?? "",
      region: datos.empresa.address?.region ?? "",
      postalCode: datos.empresa.address?.postalCode ?? "",
      country: datos.empresa.address?.country ?? "",
    });
    setBusqueda("");
  }

  async function ejecutar(accion: () => Promise<void>) {
    setOcupado(true);
    setError(null);
    try { await accion(); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo completar la operación"); }
    finally { setOcupado(false); }
  }

  function nuevo() {
    setDetalle(null);
    setNombre("");
    setFiscal("");
    setTelefono("");
    setMatriz("");
    setDireccion({ street: "", city: "", region: "", postalCode: "", country: "" });
    setBusqueda("");
    setError(null);
  }

  async function guardar() {
    const partes = Object.fromEntries(Object.entries(direccion).filter(([, valor]) => valor.trim()));
    const datos = { name: nombre, taxId: fiscal || null, phone: telefono || null,
      parentCompanyId: matriz || null, address: Object.keys(partes).length ? partes : null };
    const res = detalle
      ? await pedir<{ empresa: Empresa }>(`/api/crm/companies/${detalle.id}`, json("PATCH", datos))
      : await pedir<{ empresa: Empresa }>("/api/crm/companies", json("POST", datos));
    await actualizar();
    await abrir(res.empresa.id);
  }

  async function vincular(contactId: string, quitar: boolean) {
    if (!detalle) return;
    await pedir(`/api/crm/companies/${detalle.id}/contacts`, json(quitar ? "DELETE" : "POST", { contactId }));
    await abrir(detalle.id);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-4">
        <Button variant="outline" size="sm" onClick={onVolver}>Contactos</Button>
        <h2 className="text-lg font-bold">Empresas</h2>
      </header>
      <div className="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-[minmax(12rem,1fr)_2fr]">
        <section>
          <Button size="sm" onClick={nuevo}>Nueva empresa</Button>
          <ul className="mt-3 space-y-1">
            {empresas.map((empresa) => (
              <li key={empresa.id}>
                <button className="w-full rounded-md border bg-card p-3 text-left hover:bg-accent"
                  onClick={() => void ejecutar(() => abrir(empresa.id))}>
                  {empresa.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="space-y-3 rounded-lg border bg-card p-4">
          <h3 className="font-semibold">{detalle ? "Editar empresa" : "Nueva empresa"}</h3>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <label className="block text-sm">Razón social
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </label>
          <label className="block text-sm">Identificación fiscal
            <Input value={fiscal} onChange={(e) => setFiscal(e.target.value)} />
          </label>
          <label className="block text-sm">Teléfono
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </label>
          {([
            ["street", "Dirección"], ["city", "Ciudad"], ["region", "Estado o región"],
            ["postalCode", "Código postal"], ["country", "País"],
          ] as const).map(([clave, etiqueta]) => (
            <label key={clave} className="block text-sm">{etiqueta}
              <Input value={direccion[clave]} onChange={(e) => setDireccion({ ...direccion, [clave]: e.target.value })} />
            </label>
          ))}
          <label className="block text-sm">Empresa matriz
            <select className="mt-1 h-9 w-full rounded-md border border-input bg-card px-3"
              value={matriz} onChange={(e) => setMatriz(e.target.value)}>
              <option value="">Sin matriz</option>
              {empresas.filter((empresa) => empresa.id !== detalle?.id).map((empresa) => (
                <option key={empresa.id} value={empresa.id}>{empresa.name}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button disabled={ocupado || !nombre.trim()} onClick={() => void ejecutar(guardar)}>Guardar</Button>
            {detalle && (
              <Button variant="destructive" disabled={ocupado} onClick={() => {
                if (!window.confirm(`¿Eliminar ${detalle.name}?`)) return;
                void ejecutar(async () => {
                  await pedir(`/api/crm/companies/${detalle.id}`, { method: "DELETE" });
                  nuevo();
                  await actualizar();
                });
              }}>Eliminar empresa</Button>
            )}
          </div>
          {detalle && (
            <div className="space-y-2 border-t pt-4">
              <h4 className="font-semibold">Contactos vinculados</h4>
              {detalle.contactos.length === 0 && <p className="text-sm text-muted-foreground">Sin contactos vinculados.</p>}
              {detalle.contactos.map((contacto) => (
                <div key={contacto.id} className="flex items-center justify-between gap-2">
                  <span>{contacto.name}</span>
                  <Button size="sm" variant="outline" disabled={ocupado}
                    onClick={() => void ejecutar(() => vincular(contacto.id, true))}>Desvincular</Button>
                </div>
              ))}
              <label className="block text-sm">Buscar contacto para vincular
                <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
              </label>
              {contactos.filter((contacto) => !detalle.contactos.some((v) => v.id === contacto.id)).map((contacto) => (
                <div key={contacto.id} className="flex items-center justify-between gap-2">
                  <span>{contacto.name}{contacto.phone ? ` · ${contacto.phone}` : ""}</span>
                  <Button size="sm" variant="outline" disabled={ocupado}
                    onClick={() => void ejecutar(() => vincular(contacto.id, false))}>Vincular</Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
