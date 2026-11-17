CREATE TABLE "custom_field_file_guard" (
	"organization_id" text NOT NULL,
	"file_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_field_file" ADD COLUMN "storage_recorded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_field_file" ADD COLUMN "bucket_fingerprint" text;--> statement-breakpoint
ALTER TABLE "custom_field_file" ADD COLUMN "disk_fingerprint" text;--> statement-breakpoint
ALTER TABLE "custom_field_file_guard" ADD CONSTRAINT "custom_field_file_guard_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_file_guard_org_file_uq" ON "custom_field_file_guard" USING btree ("organization_id","file_id");