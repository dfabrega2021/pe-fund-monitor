CREATE TYPE "public"."company_status" AS ENUM('active', 'exited', 'written_off');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('valuation_letter', 'lp_letter', 'tear_sheets', 'annual_letter', 'marketing_other');--> statement-breakpoint
CREATE TYPE "public"."flag_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."flag_type" AS ENUM('missing', 'out_of_bounds', 'large_delta', 'inconsistent');--> statement-breakpoint
CREATE TYPE "public"."package_status" AS ENUM('incomplete', 'complete');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('pending', 'classified', 'extracted', 'reviewed', 'committed');--> statement-breakpoint
CREATE TYPE "public"."return_basis" AS ENUM('gross', 'net');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('main', 'co_invest', 'parallel');--> statement-breakpoint
CREATE TABLE "ai_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"generated_text" text NOT NULL,
	"model_used" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"report_year" integer NOT NULL,
	"report_quarter" integer NOT NULL,
	"return_basis" "return_basis" NOT NULL,
	"nav" numeric(18, 2),
	"called_capital" numeric(18, 2),
	"distributed_capital" numeric(18, 2),
	"remaining_value" numeric(18, 2),
	"dpi" numeric(8, 4),
	"rvpi" numeric(8, 4),
	"tvpi" numeric(8, 4),
	"irr" numeric(8, 4),
	"unfunded_commitment" numeric(18, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	CONSTRAINT "fund_metrics_vehicle_id_report_id_return_basis_unique" UNIQUE("vehicle_id","report_id","return_basis")
);
--> statement-breakpoint
CREATE TABLE "fund_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" uuid NOT NULL,
	"reporting_package_id" uuid,
	"document_type" "document_type",
	"report_year" integer NOT NULL,
	"report_quarter" integer NOT NULL,
	"source_file_url" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"status" "report_status" DEFAULT 'pending' NOT NULL,
	"raw_extraction_json" jsonb,
	"reviewed_by" text,
	"committed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "fund_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" uuid NOT NULL,
	"vehicle_name" text NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"commitment_amount" numeric(18, 2)
);
--> statement-breakpoint
CREATE TABLE "funds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"gp_name" text NOT NULL,
	"strategy" text NOT NULL,
	"sector" text,
	"geography_focus" text,
	"vintage_year" integer NOT NULL,
	"commitment_amount" numeric(18, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gp_commentary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"raw_text" text,
	"extracted_themes_json" jsonb DEFAULT '[]'::jsonb,
	"gp_stated_notable_changes" jsonb DEFAULT '[]'::jsonb,
	"macro_risk_mentions" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "portfolio_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"sector" text,
	"geography" text,
	"investment_date" timestamp,
	"status" "company_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_company_developments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"development_text" text NOT NULL,
	"tagged_date" timestamp
);
--> statement-breakpoint
CREATE TABLE "portfolio_company_valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"valuation" numeric(18, 2),
	"cost_basis" numeric(18, 2),
	"ownership_pct" numeric(6, 3),
	"gross_moic" numeric(8, 3),
	"gross_irr" numeric(8, 4),
	"status" "company_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporting_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fund_id" uuid NOT NULL,
	"report_year" integer NOT NULL,
	"report_quarter" integer NOT NULL,
	"status" "package_status" DEFAULT 'incomplete' NOT NULL,
	"expected_document_types" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reporting_packages_fund_id_report_year_report_quarter_unique" UNIQUE("fund_id","report_year","report_quarter")
);
--> statement-breakpoint
CREATE TABLE "validation_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"flag_type" "flag_type" NOT NULL,
	"severity" "flag_severity" DEFAULT 'warning' NOT NULL,
	"message" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_report_id_fund_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."fund_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_metrics" ADD CONSTRAINT "fund_metrics_report_id_fund_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."fund_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_metrics" ADD CONSTRAINT "fund_metrics_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_metrics" ADD CONSTRAINT "fund_metrics_vehicle_id_fund_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."fund_vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_reports" ADD CONSTRAINT "fund_reports_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_reports" ADD CONSTRAINT "fund_reports_reporting_package_id_reporting_packages_id_fk" FOREIGN KEY ("reporting_package_id") REFERENCES "public"."reporting_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_vehicles" ADD CONSTRAINT "fund_vehicles_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gp_commentary" ADD CONSTRAINT "gp_commentary_report_id_fund_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."fund_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_companies" ADD CONSTRAINT "portfolio_companies_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_company_developments" ADD CONSTRAINT "portfolio_company_developments_company_id_portfolio_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."portfolio_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_company_developments" ADD CONSTRAINT "portfolio_company_developments_report_id_fund_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."fund_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_company_valuations" ADD CONSTRAINT "portfolio_company_valuations_report_id_fund_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."fund_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_company_valuations" ADD CONSTRAINT "portfolio_company_valuations_company_id_portfolio_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."portfolio_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_packages" ADD CONSTRAINT "reporting_packages_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_flags" ADD CONSTRAINT "validation_flags_report_id_fund_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."fund_reports"("id") ON DELETE cascade ON UPDATE no action;