CREATE TABLE "voice_transcription_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"media_asset_id" text NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"transcript_cipher" text,
	"transcript_iv" text,
	"transcript_tag" text,
	"lease_id" text,
	"lease_until" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "voice_transcription_cache_result_check" CHECK (("voice_transcription_cache"."status" = 'ready' and "voice_transcription_cache"."transcript_cipher" is not null and "voice_transcription_cache"."transcript_iv" is not null and "voice_transcription_cache"."transcript_tag" is not null) or ("voice_transcription_cache"."status" != 'ready' and "voice_transcription_cache"."transcript_cipher" is null and "voice_transcription_cache"."transcript_iv" is null and "voice_transcription_cache"."transcript_tag" is null))
);
--> statement-breakpoint
CREATE TABLE "voice_transcription_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text DEFAULT 'openai' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"token_cipher" text NOT NULL,
	"token_iv" text NOT NULL,
	"token_tag" text NOT NULL,
	"token_last4" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_transcription_cache" ADD CONSTRAINT "voice_transcription_cache_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_transcription_cache" ADD CONSTRAINT "voice_transcription_cache_media_asset_id_media_asset_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_transcription_credentials" ADD CONSTRAINT "voice_transcription_credentials_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "voice_transcription_cache_org_asset_uq" ON "voice_transcription_cache" USING btree ("organization_id","media_asset_id");--> statement-breakpoint
CREATE INDEX "voice_transcription_cache_org_expiry_idx" ON "voice_transcription_cache" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_transcription_credentials_org_uq" ON "voice_transcription_credentials" USING btree ("organization_id");