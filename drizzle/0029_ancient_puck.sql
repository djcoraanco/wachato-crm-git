CREATE TABLE "custom_field_file" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "custom_field_file_size_check" CHECK ("custom_field_file"."size" > 0 and "custom_field_file"."size" <= 10485760)
);
--> statement-breakpoint
ALTER TABLE "custom_field_file" ADD CONSTRAINT "custom_field_file_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_field_file_org_idx" ON "custom_field_file" USING btree ("organization_id","created_at");