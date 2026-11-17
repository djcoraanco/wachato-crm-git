CREATE TABLE "company" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"tax_id" text,
	"phone" text,
	"address" jsonb,
	"parent_company_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "company_not_own_parent" CHECK ("company"."parent_company_id" is null or "company"."parent_company_id" <> "company"."id")
);
--> statement-breakpoint
CREATE TABLE "company_contact" (
	"organization_id" text NOT NULL,
	"company_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_profile" (
	"contact_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"identification" text,
	"phones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"avatar_asset_id" text,
	"birth_date" date,
	"address" jsonb,
	"preferred_channel" text,
	"consents" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_org_parent_fk" FOREIGN KEY ("organization_id","parent_company_id") REFERENCES "public"."company"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contact" ADD CONSTRAINT "company_contact_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contact" ADD CONSTRAINT "company_contact_org_company_fk" FOREIGN KEY ("organization_id","company_id") REFERENCES "public"."company"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contact" ADD CONSTRAINT "company_contact_org_contact_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "public"."contact"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_profile" ADD CONSTRAINT "contact_profile_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_profile" ADD CONSTRAINT "contact_profile_org_contact_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "public"."contact"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_org_name_idx" ON "company" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "company_org_parent_idx" ON "company" USING btree ("organization_id","parent_company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_contact_org_company_contact_uq" ON "company_contact" USING btree ("organization_id","company_id","contact_id");--> statement-breakpoint
CREATE INDEX "company_contact_org_contact_idx" ON "company_contact" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "contact_profile_org_contact_idx" ON "contact_profile" USING btree ("organization_id","contact_id");