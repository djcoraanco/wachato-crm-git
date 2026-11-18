import { ContactsClient } from "@/components/contacts/contacts-client";
import { canConfigure } from "@/lib/auth/roles";
import { getSessionOrNull } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const session = await getSessionOrNull();
  return <ContactsClient puedeAdministrarCampos={canConfigure(session?.role)} />;
}
