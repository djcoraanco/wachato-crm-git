CREATE TABLE "sales_deal_custom_value" (
	"organization_id" text NOT NULL,
	"field_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_deal_field" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"visibility" text DEFAULT 'privado' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sales_deal_field_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "sales_deal_field_kind_check" CHECK ("sales_deal_field"."kind" in ('texto', 'numero', 'moneda', 'fecha', 'booleano', 'select', 'multiselect', 'archivo', 'json')),
	CONSTRAINT "sales_deal_field_visibility_check" CHECK ("sales_deal_field"."visibility" in ('privado', 'equipo'))
);
--> statement-breakpoint
CREATE TABLE "sales_deal_field_file" (
	"organization_id" text NOT NULL,
	"field_id" text NOT NULL,
	"file_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_deal_custom_value" ADD CONSTRAINT "sales_deal_custom_value_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal_custom_value" ADD CONSTRAINT "sales_deal_value_field_fk" FOREIGN KEY ("organization_id","field_id") REFERENCES "public"."sales_deal_field"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal_custom_value" ADD CONSTRAINT "sales_deal_value_deal_fk" FOREIGN KEY ("organization_id","deal_id") REFERENCES "public"."sales_deal"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal_field" ADD CONSTRAINT "sales_deal_field_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal_field_file" ADD CONSTRAINT "sales_deal_field_file_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal_field_file" ADD CONSTRAINT "sales_deal_file_field_fk" FOREIGN KEY ("organization_id","field_id") REFERENCES "public"."sales_deal_field"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal_field_file" ADD CONSTRAINT "sales_deal_file_file_fk" FOREIGN KEY ("organization_id","file_id") REFERENCES "public"."custom_field_file"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_deal_value_org_deal_field_uq" ON "sales_deal_custom_value" USING btree ("organization_id","deal_id","field_id");--> statement-breakpoint
CREATE INDEX "sales_deal_value_gin_idx" ON "sales_deal_custom_value" USING gin ("value");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_deal_field_org_key_uq" ON "sales_deal_field" USING btree ("organization_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_deal_file_org_file_uq" ON "sales_deal_field_file" USING btree ("organization_id","file_id");--> statement-breakpoint
CREATE INDEX "sales_deal_file_org_field_idx" ON "sales_deal_field_file" USING btree ("organization_id","field_id");