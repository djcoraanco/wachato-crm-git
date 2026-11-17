CREATE TABLE "company_custom_value" (
	"organization_id" text NOT NULL,
	"field_id" text NOT NULL,
	"entity" text DEFAULT 'empresa' NOT NULL,
	"company_id" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_custom_value_entity_check" CHECK ("company_custom_value"."entity" = 'empresa')
);
--> statement-breakpoint
CREATE TABLE "contact_custom_value" (
	"organization_id" text NOT NULL,
	"field_id" text NOT NULL,
	"entity" text DEFAULT 'contacto' NOT NULL,
	"contact_id" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contact_custom_value_entity_check" CHECK ("contact_custom_value"."entity" = 'contacto')
);
--> statement-breakpoint
CREATE TABLE "custom_field" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "custom_field_org_id_entity_uq" UNIQUE("organization_id","id","entity"),
	CONSTRAINT "custom_field_entity_check" CHECK ("custom_field"."entity" in ('contacto', 'empresa')),
	CONSTRAINT "custom_field_kind_check" CHECK ("custom_field"."kind" in ('texto', 'numero', 'moneda', 'fecha', 'booleano', 'select', 'multiselect', 'archivo', 'json'))
);
--> statement-breakpoint
ALTER TABLE "company_custom_value" ADD CONSTRAINT "company_custom_value_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_custom_value" ADD CONSTRAINT "company_custom_value_field_fk" FOREIGN KEY ("organization_id","field_id","entity") REFERENCES "public"."custom_field"("organization_id","id","entity") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_custom_value" ADD CONSTRAINT "company_custom_value_company_fk" FOREIGN KEY ("organization_id","company_id") REFERENCES "public"."company"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_custom_value" ADD CONSTRAINT "contact_custom_value_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_custom_value" ADD CONSTRAINT "contact_custom_value_field_fk" FOREIGN KEY ("organization_id","field_id","entity") REFERENCES "public"."custom_field"("organization_id","id","entity") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_custom_value" ADD CONSTRAINT "contact_custom_value_contact_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "public"."contact"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field" ADD CONSTRAINT "custom_field_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_custom_value_org_company_field_uq" ON "company_custom_value" USING btree ("organization_id","company_id","field_id");--> statement-breakpoint
CREATE INDEX "company_custom_value_gin_idx" ON "company_custom_value" USING gin ("value");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_custom_value_org_contact_field_uq" ON "contact_custom_value" USING btree ("organization_id","contact_id","field_id");--> statement-breakpoint
CREATE INDEX "contact_custom_value_gin_idx" ON "contact_custom_value" USING gin ("value");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_org_entity_key_uq" ON "custom_field" USING btree ("organization_id","entity","key");