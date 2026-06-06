CREATE TABLE "analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"design_id" text NOT NULL,
	"result_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "components" (
	"id" text PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"description" text NOT NULL,
	"params" jsonb NOT NULL,
	"card_summary" text[] NOT NULL,
	"accepts_from" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "designs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text DEFAULT 'Untitled Design' NOT NULL,
	"canvas_json" jsonb DEFAULT '{"nodes":[],"edges":[]}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_design_id_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."designs"("id") ON DELETE cascade ON UPDATE no action;