ALTER TABLE "custom_field" ADD COLUMN "visibility" text DEFAULT 'privado' NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_field_file" ADD COLUMN "field_id" text;--> statement-breakpoint
ALTER TABLE "custom_field_file" ADD COLUMN "field_entity" text;--> statement-breakpoint
ALTER TABLE "custom_field_file" ADD CONSTRAINT "custom_field_file_field_fk" FOREIGN KEY ("organization_id","field_id","field_entity") REFERENCES "public"."custom_field"("organization_id","id","entity") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field" ADD CONSTRAINT "custom_field_visibility_check" CHECK ("custom_field"."visibility" in ('privado', 'equipo'));--> statement-breakpoint
ALTER TABLE "custom_field_file" ADD CONSTRAINT "custom_field_file_field_check" CHECK (("custom_field_file"."field_id" is null) = ("custom_field_file"."field_entity" is null));