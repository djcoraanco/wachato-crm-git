import Link from "next/link";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { getSessionOrNull } from "@/lib/auth/session";
import { canConfigure } from "@/lib/auth/roles";
import { CHANNEL_LABEL, type Channel } from "@/lib/channels";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { atribucionEnabled } from "@/server/attribution/flag";
import { getCapiSettingsView } from "@/server/attribution/settings";
import { listConversionActivity } from "@/server/attribution/conversions";
import { channelsStatus } from "@/server/channels/status";

export const dynamic = "force-dynamic";

const ajustes: Record<Channel, string> = {
  whatsapp: "/settings/whatsapp",
  instagram: "/settings/instagram",
  messenger: "/settings/messenger",
  tiktok: "/settings/tiktok",
};

const estados = { pending: "Pendiente", sent: "Enviado", failed: "Fallido", skipped: "Omitido" } as const;

export default async function ConnectionsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const { organizationId } = session;
  const puedeConfigurar = canConfigure(session.role);
  const atribucion = atribucionEnabled();
  const [canales, plantillas, capi, eventos] = await Promise.all([
    channelsStatus(organizationId),
    getDb().select({
      id: schema.template.id,
      name: schema.template.name,
      category: schema.template.category,
      status: schema.template.status,
    }).from(schema.template)
      .where(scoped(schema.template.organizationId, organizationId))
      .orderBy(desc(schema.template.createdAt)),
    atribucion ? getCapiSettingsView(organizationId) : null,
    atribucion ? listConversionActivity(organizationId) : [],
  ]);
  return (
    <div className="space-y-5 overflow-y-auto p-4 sm:p-6">
      <h2 className="text-xl font-bold">Conexiones</h2>
      <section aria-label="Canales" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {canales.map((canal) => (
          <div key={canal.channel} className="space-y-2 rounded-lg border bg-card p-4">
            <h3 className="font-semibold">{CHANNEL_LABEL[canal.channel]}</h3>
            <p>{!canal.connected ? "Sin conectar" : canal.status === "reconnect_required" ? "Requiere reconexión" : "Conexión guardada"}</p>
            {canal.account && <p className="text-sm text-muted-foreground">{canal.account}</p>}
            {canal.health && <p className="text-sm text-muted-foreground">{canal.health.account.message} {canal.health.webhook.message}</p>}
            {puedeConfigurar && <Link className="text-sm text-primary underline" href={ajustes[canal.channel]}>Configurar {CHANNEL_LABEL[canal.channel]}</Link>}
          </div>
        ))}
      </section>
      <section className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold">Requisitos de Meta</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          La verificación del negocio y la revisión de permisos se consultan en Meta; su estado no se comprueba desde esta pantalla.
        </p>
      </section>
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Plantillas de WhatsApp</h3>
          {puedeConfigurar && <Link className="text-sm text-primary underline" href="/settings/templates">Administrar plantillas</Link>}
        </div>
        {plantillas.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No hay plantillas guardadas.</p> : (
          <div className="overflow-x-auto">
            <table className="mt-2 w-full text-left text-sm">
              <thead><tr><th>Nombre</th><th>Categoría</th><th>Estado</th></tr></thead>
              <tbody>{plantillas.map((plantilla) => (
                <tr key={plantilla.id}><td>{plantilla.name}</td><td>{plantilla.category}</td><td>{plantilla.status}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <section className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold">Conversions API</h3>
        {!atribucion ? <p className="mt-2 text-sm text-muted-foreground">La atribución está desactivada en esta instancia.</p> : (
          <>
            <p className="mt-2 text-sm">{!capi ? "Sin configurar" : capi.status === "error" ? "Requiere revisión" : `Configurada · Dataset ${capi.datasetId}`}</p>
            {puedeConfigurar && <Link className="text-sm text-primary underline" href="/settings/ads">Configurar anuncios</Link>}
            {eventos.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No hay eventos registrados.</p> : (
              <div className="overflow-x-auto">
                <table className="mt-2 w-full text-left text-sm">
                  <thead><tr><th>Fecha</th><th>Evento</th><th>Contacto</th><th>Estado</th></tr></thead>
                  <tbody>{eventos.map((evento) => (
                    <tr key={evento.id}><td>{new Date(evento.at).toLocaleString("es-MX", { timeZone: "UTC" })} UTC</td><td>{evento.eventName}</td><td>{evento.contactName ?? "Sin contacto"}</td><td>{estados[evento.status]}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
