CREATE TABLE "contact_avatar" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"disk_fingerprint" text NOT NULL,
	"bucket_fingerprint" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contact_avatar_status_check" CHECK ("contact_avatar"."status" in ('pendiente', 'activo', 'eliminando'))
);
--> statement-breakpoint
ALTER TABLE "contact_avatar" ADD CONSTRAINT "contact_avatar_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_avatar" ADD CONSTRAINT "contact_avatar_org_contact_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "public"."contact"("organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_avatar_org_contact_uq" ON "contact_avatar" USING btree ("organization_id","contact_id");