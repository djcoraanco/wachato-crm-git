CREATE TABLE "crm_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contact_id" text,
	"lead_id" text,
	"deal_id" text,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"due_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_activity_kind_check" CHECK ("crm_activity"."kind" in ('llamada', 'reunion', 'tarea', 'nota')),
	CONSTRAINT "crm_activity_parent_check" CHECK ("crm_activity"."contact_id" is not null or "crm_activity"."lead_id" is not null or "crm_activity"."deal_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "sales_deal" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"pipeline_id" text,
	"stage_id" text,
	"legacy_stage_id" text,
	"title" text NOT NULL,
	"amount_cents" bigint,
	"currency" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sales_deal_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "sales_deal_stage_check" CHECK (("sales_deal"."pipeline_id" is null and "sales_deal"."stage_id" is null and "sales_deal"."legacy_stage_id" is not null) or ("sales_deal"."pipeline_id" is not null and "sales_deal"."stage_id" is not null and "sales_deal"."legacy_stage_id" is null)),
	CONSTRAINT "sales_deal_amount_check" CHECK (("sales_deal"."amount_cents" is null and "sales_deal"."currency" is null) or ("sales_deal"."amount_cents" is not null and "sales_deal"."amount_cents" >= 0 and "sales_deal"."amount_cents" <= 9007199254740991 and "sales_deal"."currency" is not null))
);
--> statement-breakpoint
CREATE TABLE "sales_deal_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"from_stage" text,
	"to_stage" text NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_pipeline" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sales_pipeline_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "sales_pipeline_stage" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"pipeline_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sales_stage_org_pipeline_id_uq" UNIQUE("organization_id","pipeline_id","id")
);
--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_contact_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "public"."contact"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_lead_fk" FOREIGN KEY ("organization_id","lead_id") REFERENCES "public"."lead"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activity" ADD CONSTRAINT "crm_activity_deal_fk" FOREIGN KEY ("organization_id","deal_id") REFERENCES "public"."sales_deal"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal" ADD CONSTRAINT "sales_deal_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal" ADD CONSTRAINT "sales_deal_contact_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "public"."contact"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal" ADD CONSTRAINT "sales_deal_stage_fk" FOREIGN KEY ("organization_id","pipeline_id","stage_id") REFERENCES "public"."sales_pipeline_stage"("organization_id","pipeline_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal" ADD CONSTRAINT "sales_deal_legacy_stage_fk" FOREIGN KEY ("organization_id","legacy_stage_id") REFERENCES "public"."pipeline_stage"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal_event" ADD CONSTRAINT "sales_deal_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal_event" ADD CONSTRAINT "sales_deal_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deal_event" ADD CONSTRAINT "sales_deal_event_deal_fk" FOREIGN KEY ("organization_id","deal_id") REFERENCES "public"."sales_deal"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_pipeline" ADD CONSTRAINT "sales_pipeline_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_pipeline_stage" ADD CONSTRAINT "sales_pipeline_stage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_pipeline_stage" ADD CONSTRAINT "sales_stage_pipeline_fk" FOREIGN KEY ("organization_id","pipeline_id") REFERENCES "public"."sales_pipeline"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_activity_org_contact_idx" ON "crm_activity" USING btree ("organization_id","contact_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_activity_org_deal_idx" ON "crm_activity" USING btree ("organization_id","deal_id","created_at");--> statement-breakpoint
CREATE INDEX "sales_deal_org_pipeline_stage_idx" ON "sales_deal" USING btree ("organization_id","pipeline_id","stage_id","position");--> statement-breakpoint
CREATE INDEX "sales_deal_event_org_deal_idx" ON "sales_deal_event" USING btree ("organization_id","deal_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_pipeline_org_name_uq" ON "sales_pipeline" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "sales_stage_org_pipeline_pos_idx" ON "sales_pipeline_stage" USING btree ("organization_id","pipeline_id","position");