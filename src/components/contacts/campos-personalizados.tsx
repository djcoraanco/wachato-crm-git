"use client";

import { useCallback, useEffect, useState } from "react";
import { CURRENCIES } from "@/lib/money";
import { TIPOS_CAMPO } from "@/lib/campos-personalizados";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type EntidadCampo = "contacto" | "empresa" | "trato";
type TipoCampo = typeof TIPOS_CAMPO[number];
type Campo = {
  id: string;
  entidad: EntidadCampo;
  clave: string;
  nombre: string;
  tipo: TipoCampo;
  opciones: string[];
  visibilidad: "privado" | "equipo";
};
type Archivo = { id: string; nombre: string; tamano: number };
type ValoresResponse = { valores: { entidadId: string; valor: unknown }[] };

const nombresTipo: Record<TipoCampo, string> = {
  texto: "Texto",
  numero: "Número",
  moneda: "Moneda",
  fecha: "Fecha",
  booleano: "Sí / no",
  select: "Selección",
  multiselect: "Selección múltiple",
  archivo: "Archivo privado",
  json: "JSON",
};

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, init);
  } catch (error) {
    if (error instanceof TypeError) throw new Error("No se pudo conectar con el servidor");
    throw error;
  }
  const datos = await respuesta.json().catch(() => null) as
    | ({ error?: { message?: string } } & T)
    | null;
  if (!respuesta.ok) throw new Error(datos?.error?.message ?? `La operación falló (HTTP ${respuesta.status})`);
  if (!datos) throw new Error("El servidor devolvió una respuesta inválida");
  return datos;
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function rutaCampos(entidad: EntidadCampo) {
  return entidad === "trato" ? "/api/crm/deal-fields" : "/api/custom-fields";
}

export function AdministradorCamposButton({
  entidad,
  puedeAdministrar,
}: {
  entidad: EntidadCampo;
  puedeAdministrar: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  if (!puedeAdministrar) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>
        Campos personalizados
      </Button>
      {abierto && <AdministradorCampos entidad={entidad} onClose={() => setAbierto(false)} />}
    </>
  );
}

function AdministradorCampos({ entidad, onClose }: { entidad: EntidadCampo; onClose: () => void }) {
  const [campos, setCampos] = useState<Campo[]>([]);
  const [seleccionado, setSeleccionado] = useState<Campo | null>(null);
  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState("");
  const [claveEditada, setClaveEditada] = useState(false);
  const [tipo, setTipo] = useState<TipoCampo>("texto");
  const [opciones, setOpciones] = useState("");
  const [visibilidad, setVisibilidad] = useState<Campo["visibilidad"]>("privado");
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const datos = await pedir<{ campos: Campo[] }>(`${rutaCampos(entidad)}?entidad=${entidad}`);
      setCampos(datos.campos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las definiciones");
    } finally {
      setCargando(false);
    }
  }, [entidad]);

  useEffect(() => { void recargar(); }, [recargar]);

  function nuevo() {
    setSeleccionado(null);
    setNombre("");
    setClave("");
    setClaveEditada(false);
    setTipo("texto");
    setOpciones("");
    setVisibilidad("privado");
    setError(null);
  }

  function editar(campo: Campo) {
    setSeleccionado(campo);
    setNombre(campo.nombre);
    setClave(campo.clave);
    setClaveEditada(true);
    setTipo(campo.tipo);
    setOpciones(campo.opciones.join("\n"));
    setVisibilidad(campo.visibilidad);
    setError(null);
  }

  async function guardar() {
    setOcupado(true);
    setError(null);
    const seleccion = tipo === "select" || tipo === "multiselect";
    const opcionesLimpias = seleccion
      ? opciones.split("\n").map((opcion) => opcion.trim()).filter(Boolean)
      : [];
    try {
      const cuerpo = seleccionado
        ? { nombre, opciones: opcionesLimpias, visibilidad }
        : { entidad, clave, nombre, tipo, opciones: opcionesLimpias, visibilidad };
      await pedir(seleccionado
        ? `${rutaCampos(entidad)}/${seleccionado.id}`
        : rutaCampos(entidad), json(seleccionado ? "PATCH" : "POST", cuerpo));
      await recargar();
      nuevo();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la definición");
    } finally {
      setOcupado(false);
    }
  }

  async function eliminar(campo: Campo) {
    if (!window.confirm(`¿Eliminar el campo «${campo.nombre}»? Solo se puede eliminar si no tiene valores ni archivos.`)) return;
    setOcupado(true);
    setError(null);
    try {
      await pedir(`${rutaCampos(entidad)}/${campo.id}`, { method: "DELETE" });
      if (seleccionado?.id === campo.id) nuevo();
      await recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la definición");
    } finally {
      setOcupado(false);
    }
  }

  const requiereOpciones = tipo === "select" || tipo === "multiselect";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-overlay p-3 sm:p-5"
      role="dialog" aria-modal="true" aria-label={`Campos de ${entidad}`}>
      <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-lg border bg-popover p-4 shadow-xl sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">Campos personalizados de {entidad === "contacto" ? "contactos" : entidad === "empresa" ? "empresas" : "tratos"}</h3>
            <p className="text-sm text-muted-foreground">Los campos nuevos son privados. Comparte con el equipo solo lo que necesiten.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
        </div>
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        <div className="grid gap-5 md:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.3fr)]">
          <section aria-label="Definiciones existentes">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">Definiciones</h4>
              <Button size="sm" variant="outline" disabled={ocupado} onClick={nuevo}>Nuevo campo</Button>
            </div>
            {cargando ? <p className="text-sm text-muted-foreground">Cargando campos…</p>
              : campos.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay campos.</p>
                : <ul className="space-y-2">
                  {campos.map((campo) => (
                    <li key={campo.id} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <button className="min-w-0 flex-1 text-left" onClick={() => editar(campo)}>
                          <span className="block truncate text-sm font-medium">{campo.nombre}</span>
                          <span className="block text-xs text-muted-foreground">
                            {nombresTipo[campo.tipo]} · {campo.visibilidad === "privado" ? "Privado" : "Equipo"}
                          </span>
                        </button>
                        <Button size="sm" variant="ghost" disabled={ocupado}
                          aria-label={`Eliminar ${campo.nombre}`} onClick={() => void eliminar(campo)}>Eliminar</Button>
                      </div>
                    </li>
                  ))}
                </ul>}
          </section>
          <section className="space-y-3 rounded-md border p-3">
            <h4 className="text-sm font-semibold">{seleccionado ? "Editar definición" : "Crear definición"}</h4>
            <label className="block text-sm">Nombre visible
              <Input value={nombre} maxLength={100} onChange={(e) => {
                const valor = e.target.value;
                setNombre(valor);
                  if (!seleccionado && !claveEditada) setClave(slug(valor));
              }} />
            </label>
            {!seleccionado && <label className="block text-sm">Clave de API
              <Input value={clave} maxLength={50} onChange={(e) => {
                setClaveEditada(true);
                setClave(e.target.value);
              }} />
              <span className="text-xs text-muted-foreground">Letras minúsculas, números y guion bajo; no se puede cambiar después.</span>
            </label>}
            <label className="block text-sm">Tipo
              <select className="mt-1 h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={tipo} disabled={Boolean(seleccionado)}
                onChange={(e) => setTipo(e.target.value as TipoCampo)}>
                {TIPOS_CAMPO.map((opcion) => <option key={opcion} value={opcion}>{nombresTipo[opcion]}</option>)}
              </select>
            </label>
            {requiereOpciones && <label className="block text-sm">Opciones, una por línea
              <Textarea rows={4} value={opciones} onChange={(e) => setOpciones(e.target.value)} />
            </label>}
            <label className="block text-sm">Visibilidad
              <select className="mt-1 h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={visibilidad} onChange={(e) => setVisibilidad(e.target.value as Campo["visibilidad"])}>
                <option value="privado">Privado: solo administradores</option>
                <option value="equipo">Equipo: miembros también pueden verlo y editarlo</option>
              </select>
            </label>
            <div className="flex justify-end gap-2">
              {seleccionado && <Button variant="ghost" disabled={ocupado} onClick={nuevo}>Cancelar</Button>}
              <Button disabled={ocupado || !nombre.trim() || (!seleccionado && !clave.trim())}
                onClick={() => void guardar()}>{ocupado ? "Guardando…" : "Guardar campo"}</Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function slug(valor: string) {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
}

export function CamposPersonalizadosEditor({
  entidad,
  entidadId,
}: {
  entidad: EntidadCampo;
  entidadId: string;
}) {
  const [campos, setCampos] = useState<Campo[]>([]);
  const [valores, setValores] = useState(new Map<string, unknown>());
  const [conValor, setConValor] = useState(new Set<string>());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    void (async () => {
      try {
        const datos = await pedir<{ campos: Campo[] }>(`${rutaCampos(entidad)}?entidad=${entidad}`);
        const respuestas = await Promise.all(datos.campos.map(async (campo) => {
          const query = new URLSearchParams({ entidadId });
          const valoresCampo = await pedir<ValoresResponse>(`${rutaCampos(entidad)}/${campo.id}/values?${query}`);
          return [campo, valoresCampo.valores.find((item) => item.entidadId === entidadId)] as const;
        }));
        if (!vigente) return;
        const mapa = new Map<string, unknown>();
        const conDatos = new Set<string>();
        for (const [campo, fila] of respuestas) {
          if (fila) {
            mapa.set(campo.id, fila.valor);
            conDatos.add(campo.id);
          }
        }
        setCampos(datos.campos);
        setValores(mapa);
        setConValor(conDatos);
      } catch (err) {
        if (vigente) setError(err instanceof Error ? err.message : "No se pudieron cargar los campos personalizados");
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => { vigente = false; };
  }, [entidad, entidadId]);

  function guardarValor(campoId: string, valor: unknown) {
    setValores((actual) => new Map(actual).set(campoId, valor));
    setConValor((actual) => new Set(actual).add(campoId));
  }

  function quitarValor(campoId: string) {
    setValores((actual) => {
      const siguiente = new Map(actual);
      siguiente.delete(campoId);
      return siguiente;
    });
    setConValor((actual) => {
      const siguiente = new Set(actual);
      siguiente.delete(campoId);
      return siguiente;
    });
  }

  return (
    <section className="space-y-3 border-t pt-4" aria-label="Campos personalizados">
      <div>
        <h4 className="font-semibold">Campos personalizados</h4>
        <p className="text-xs text-muted-foreground">Solo se cargan los valores de este registro y los campos visibles para tu rol.</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {cargando ? <p className="text-sm text-muted-foreground">Cargando campos…</p>
        : campos.length === 0 ? <p className="text-sm text-muted-foreground">No hay campos disponibles para este registro.</p>
          : <div className="space-y-3">
            {campos.map((campo) => (
              <CampoValor key={`${campo.id}:${entidadId}`} campo={campo} entidadId={entidadId}
                tieneValor={conValor.has(campo.id)} valor={valores.get(campo.id)}
                onGuardar={guardarValor} onQuitar={quitarValor} />
            ))}
          </div>}
    </section>
  );
}

function CampoValor({
  campo,
  entidadId,
  tieneValor,
  valor,
  onGuardar,
  onQuitar,
}: {
  campo: Campo;
  entidadId: string;
  tieneValor: boolean;
  valor: unknown;
  onGuardar: (campoId: string, valor: unknown) => void;
  onQuitar: (campoId: string) => void;
}) {
  const [texto, setTexto] = useState(() => {
    if (campo.tipo === "json") return valor === undefined ? "" : JSON.stringify(valor, null, 2);
    if (campo.tipo === "moneda" && esObjeto(valor) && typeof valor.centavos === "number") {
      return (valor.centavos / 100).toFixed(2);
    }
    if (campo.tipo === "archivo" || campo.tipo === "multiselect") return "";
    return valor === undefined || valor === null ? "" : String(valor);
  });
  const [moneda, setMoneda] = useState(() =>
    campo.tipo === "moneda" && esObjeto(valor) && typeof valor.moneda === "string" ? valor.moneda : "MXN"
  );
  const [seleccion, setSeleccion] = useState<string[]>(
    campo.tipo === "multiselect" && Array.isArray(valor) ? valor.filter((item): item is string => typeof item === "string") : []
  );
  const [archivo, setArchivo] = useState<Archivo | null>(() =>
    campo.tipo === "archivo" && esObjeto(valor) && typeof valor.id === "string"
      ? { id: valor.id, nombre: "Archivo adjunto", tamano: 0 }
      : null
  );
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function guardar(nuevoValor: unknown) {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      await pedir(`${rutaCampos(campo.entidad)}/${campo.id}/values`, json("PUT", { entidadId, valor: nuevoValor }));
      onGuardar(campo.id, nuevoValor);
      setAviso("Guardado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el valor");
    } finally {
      setOcupado(false);
    }
  }

  async function guardarEntrada() {
    try {
      let nuevoValor: unknown;
      switch (campo.tipo) {
        case "texto":
        case "fecha":
        case "select":
          nuevoValor = texto;
          break;
        case "numero":
          nuevoValor = texto.trim() === "" ? Number.NaN : Number(texto);
          if (!Number.isFinite(nuevoValor)) throw new Error("Escribe un número válido");
          break;
        case "moneda": {
          const cantidad = texto.trim() === "" ? Number.NaN : Number(texto);
          const centavos = Math.round(cantidad * 100);
          if (!Number.isFinite(cantidad) || !Number.isSafeInteger(centavos) ||
              Math.abs(centavos / 100 - cantidad) > Number.EPSILON * Math.max(1, Math.abs(cantidad))) {
            throw new Error("Escribe un importe válido con hasta dos decimales");
          }
          nuevoValor = { centavos, moneda };
          break;
        }
        case "booleano":
          if (texto !== "true" && texto !== "false") throw new Error("Selecciona Sí o No");
          nuevoValor = texto === "true";
          break;
        case "multiselect":
          nuevoValor = seleccion;
          break;
        case "json":
          try { nuevoValor = JSON.parse(texto) as unknown; }
          catch { throw new Error("El JSON no es válido"); }
          break;
        case "archivo":
          return;
      }
      await guardar(nuevoValor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Valor inválido");
    }
  }

  async function cargarArchivo(file: File | undefined) {
    if (!file) return;
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      const nuevoArchivo = await pedir<{ archivo: Archivo }>(`${rutaCampos(campo.entidad)}/files`, {
        method: "POST",
        headers: {
          "x-campo-id": campo.id,
          "x-file-name": encodeURIComponent(file.name),
          "content-type": "application/octet-stream",
        },
        body: file,
      });
      try {
        await pedir(`${rutaCampos(campo.entidad)}/${campo.id}/values`, json("PUT", {
          entidadId, valor: { id: nuevoArchivo.archivo.id },
        }));
      } catch (err) {
        if (campo.entidad === "trato") {
          try {
            await pedir(`${rutaCampos(campo.entidad)}/files/${nuevoArchivo.archivo.id}`, { method: "DELETE" });
          } catch {
            throw new Error(`No se pudo vincular ni eliminar el archivo privado ${nuevoArchivo.archivo.id}.`);
          }
          throw err;
        }
        throw new Error(`El archivo quedó guardado de forma privada, pero no se pudo vincular: ${
          err instanceof Error ? err.message : "error desconocido"
        }`);
      }
      setArchivo(nuevoArchivo.archivo);
      onGuardar(campo.id, { id: nuevoArchivo.archivo.id });
      if (campo.entidad === "trato" && archivo && archivo.id !== nuevoArchivo.archivo.id) {
        try {
          await pedir(`${rutaCampos(campo.entidad)}/files/${archivo.id}`, { method: "DELETE" });
          setAviso("Archivo reemplazado y vinculado de forma privada.");
        } catch {
          setAviso(`Archivo vinculado; el anterior (${archivo.id}) se conserva porque no se pudo borrar.`);
        }
      } else {
        setAviso("Archivo cargado y vinculado de forma privada.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el archivo");
    } finally {
      setOcupado(false);
    }
  }

  async function quitar() {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      await pedir(`${rutaCampos(campo.entidad)}/${campo.id}/values`, json("DELETE", { entidadId }));
      onQuitar(campo.id);
      if (campo.tipo === "archivo" && archivo) {
        try {
          await pedir(`${rutaCampos(campo.entidad)}/files/${archivo.id}`, { method: "DELETE" });
          setArchivo(null);
          setAviso("Valor y archivo eliminados.");
        } catch (err) {
          setArchivo(null);
          setAviso(`Se quitó el valor; el archivo se conserva porque no se pudo borrar: ${
            err instanceof Error ? err.message : "error desconocido"
          }`);
        }
      } else {
        setAviso("Valor eliminado.");
      }
      setTexto("");
      setSeleccion([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar el valor");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-medium" htmlFor={`campo-${campo.id}`}>{campo.nombre}</label>
        <span className="text-xs text-muted-foreground">{campo.visibilidad === "privado" ? "Privado" : "Visible al equipo"}</span>
      </div>
      {campo.tipo === "texto" && <Input id={`campo-${campo.id}`} value={texto} maxLength={4000}
        onChange={(e) => setTexto(e.target.value)} />}
      {campo.tipo === "numero" && <Input id={`campo-${campo.id}`} type="number" step="any" value={texto}
        onChange={(e) => setTexto(e.target.value)} />}
      {campo.tipo === "moneda" && (
        <div className="flex gap-2">
          <Input id={`campo-${campo.id}`} type="number" step="0.01" value={texto}
            aria-label={`${campo.nombre}, importe`} onChange={(e) => setTexto(e.target.value)} />
          <select className="h-9 rounded-md border border-input bg-card px-2 text-sm" aria-label={`${campo.nombre}, moneda`}
            value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            {CURRENCIES.map((codigo) => <option key={codigo} value={codigo}>{codigo}</option>)}
          </select>
        </div>
      )}
      {campo.tipo === "fecha" && <Input id={`campo-${campo.id}`} type="date" value={texto}
        onChange={(e) => setTexto(e.target.value)} />}
      {campo.tipo === "booleano" && (
        <select id={`campo-${campo.id}`} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
          value={texto} onChange={(e) => setTexto(e.target.value)}>
          <option value="">Selecciona…</option><option value="true">Sí</option><option value="false">No</option>
        </select>
      )}
      {campo.tipo === "select" && (
        <select id={`campo-${campo.id}`} className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
          value={texto} onChange={(e) => setTexto(e.target.value)}>
          <option value="">Selecciona…</option>
          {campo.opciones.map((opcion) => <option key={opcion} value={opcion}>{opcion}</option>)}
        </select>
      )}
      {campo.tipo === "multiselect" && (
        <fieldset className="space-y-1">
          <legend className="sr-only">{campo.nombre}</legend>
          {campo.opciones.map((opcion) => (
            <label key={opcion} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={seleccion.includes(opcion)} onChange={(e) => {
                setSeleccion((actual) => e.target.checked
                  ? [...actual, opcion] : actual.filter((valorActual) => valorActual !== opcion));
              }} />
              {opcion}
            </label>
          ))}
        </fieldset>
      )}
      {campo.tipo === "json" && <Textarea id={`campo-${campo.id}`} rows={5} value={texto}
        aria-label={`${campo.nombre}, JSON`} onChange={(e) => setTexto(e.target.value)} />}
      {campo.tipo === "archivo" && (
        <div className="space-y-2">
          {tieneValor && archivo && <a className="text-sm text-primary underline"
            href={`${rutaCampos(campo.entidad)}/files/${archivo.id}`} download>
            {archivo.nombre}{archivo.tamano ? ` · ${Math.ceil(archivo.tamano / 1024)} KB` : ""}
          </a>}
          {tieneValor && !archivo && <p className="text-xs text-muted-foreground">Hay un archivo adjunto.</p>}
          <Input id={`campo-${campo.id}`} type="file" aria-label={`Cargar ${campo.nombre}`} disabled={ocupado}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void cargarArchivo(file);
            }} />
          <p className="text-xs text-muted-foreground">Máximo 10 MB. La descarga requiere sesión y permisos para este campo.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-h-5 text-xs">
          {error && <span role="alert" className="text-destructive">{error}</span>}
          {!error && aviso && <span role="status" className="text-muted-foreground">{aviso}</span>}
        </div>
        <div className="flex gap-2">
          {tieneValor && <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => void quitar()}>Quitar valor</Button>}
          {campo.tipo !== "archivo" && <Button size="sm" disabled={ocupado} onClick={() => void guardarEntrada()}>
            {ocupado ? "Guardando…" : "Guardar"}
          </Button>}
        </div>
      </div>
    </div>
  );
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
}
