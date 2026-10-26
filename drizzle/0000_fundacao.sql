CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"summary" text,
	"before" jsonb,
	"after" jsonb,
	"changed_fields" text[],
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_key_pk" PRIMARY KEY("role_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" uuid,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_charger_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"category" text,
	"manufacturer" text,
	"model" text,
	"power_kw" double precision NOT NULL,
	"current_type" text NOT NULL,
	"connectors" text,
	"efficiency" double precision,
	"electrical_requirements" text,
	"unit_cost" numeric(14, 2),
	"install_cost" numeric(14, 2),
	"dimensions" text,
	"warranty" text,
	"source" text,
	"is_generic" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intel_cat_current_ck" CHECK ("intel_charger_catalog"."current_type" in ('AC','DC')),
	CONSTRAINT "intel_cat_values_ck" CHECK ("intel_charger_catalog"."power_kw" > 0 and ("intel_charger_catalog"."efficiency" is null or ("intel_charger_catalog"."efficiency" > 0 and "intel_charger_catalog"."efficiency" <= 1)))
);
--> statement-breakpoint
CREATE TABLE "intel_charging_connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station_id" uuid NOT NULL,
	"standard" text,
	"power_kw" double precision,
	"current_type" text,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_charging_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"source_key" text NOT NULL,
	"external_id" text,
	"name" text,
	"address" text,
	"operator" text,
	"lat" double precision,
	"lng" double precision,
	"location" geography(Point, 4326) GENERATED ALWAYS AS (case when lat is not null and lng is not null then ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography end) STORED,
	"max_power_kw" double precision,
	"connectors" integer,
	"current_type" text,
	"connector_standard" text,
	"price_per_kwh" numeric(8, 3),
	"opening_hours" text,
	"operational_status" text DEFAULT 'desconhecido' NOT NULL,
	"verification_status" text DEFAULT 'nao_verificado' NOT NULL,
	"verified_at" date,
	"confidence" text DEFAULT 'baixa' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"import_id" uuid,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intel_cs_coords_ck" CHECK ("intel_charging_stations"."lat" is not null and "intel_charging_stations"."lng" is not null),
	CONSTRAINT "intel_cs_verif_ck" CHECK ("intel_charging_stations"."verification_status" in ('confirmado','nao_verificado','historico','insuficiente')),
	CONSTRAINT "intel_cs_current_ck" CHECK ("intel_charging_stations"."current_type" is null or "intel_charging_stations"."current_type" in ('AC','DC','AC_DC')),
	CONSTRAINT "intel_cs_power_ck" CHECK ("intel_charging_stations"."max_power_kw" is null or ("intel_charging_stations"."max_power_kw" > 0 and "intel_charging_stations"."max_power_kw" <= 1000))
);
--> statement-breakpoint
CREATE TABLE "intel_data_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"source_key" text NOT NULL,
	"target" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"status" text NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"invalid_rows" integer DEFAULT 0 NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"inserted_rows" integer DEFAULT 0 NOT NULL,
	"issues" jsonb,
	"summary" jsonb,
	"reference_date" date,
	"usage_conditions" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intel_imp_status_ck" CHECK ("intel_data_imports"."status" in ('concluida','concluida_com_erros','falhou','cancelada'))
);
--> statement-breakpoint
CREATE TABLE "intel_data_sources" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"official_url" text,
	"access_type" text NOT NULL,
	"formats" text NOT NULL,
	"coverage" text NOT NULL,
	"update_frequency" text,
	"license" text,
	"restrictions" text,
	"status" text NOT NULL,
	"quality" text DEFAULT 'desconhecida' NOT NULL,
	"last_test_at" timestamp with time zone,
	"last_test_ok" boolean,
	"last_error" text,
	"last_import_at" timestamp with time zone,
	"record_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intel_src_status_ck" CHECK ("intel_data_sources"."status" in ('funcionando','importacao_manual','necessita_credenciais','necessita_autorizacao','indisponivel','nao_implementada','descontinuada','nao_testada'))
);
--> statement-breakpoint
CREATE TABLE "intel_demand_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"scenario" text NOT NULL,
	"model_version" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_energy_tariffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"distributor" text NOT NULL,
	"uf" text,
	"modality" text NOT NULL,
	"price_per_kwh" numeric(10, 5) NOT NULL,
	"demand_charge_per_kw" numeric(10, 4),
	"valid_from" date,
	"source" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_geographic_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"source_key" text NOT NULL,
	"external_id" text,
	"geom" geometry(MultiPolygon, 4326),
	"lat" double precision,
	"lng" double precision,
	"location" geography(Point, 4326) GENERATED ALWAYS AS (case when lat is not null and lng is not null then ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography end) STORED,
	"properties" jsonb,
	"import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_geographic_indicators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"indicator" text NOT NULL,
	"municipality_code" integer,
	"area_id" uuid,
	"lat" double precision,
	"lng" double precision,
	"location" geography(Point, 4326) GENERATED ALWAYS AS (case when lat is not null and lng is not null then ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography end) STORED,
	"value" double precision NOT NULL,
	"unit" text NOT NULL,
	"nature" text NOT NULL,
	"reference_date" date NOT NULL,
	"resolution" text NOT NULL,
	"quality" text DEFAULT 'media' NOT NULL,
	"method" text,
	"source_key" text NOT NULL,
	"import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intel_ind_nature_ck" CHECK ("intel_geographic_indicators"."nature" in ('observado','estimado','premissa','simulacao')),
	CONSTRAINT "intel_ind_target_ck" CHECK ("intel_geographic_indicators"."municipality_code" is not null or "intel_geographic_indicators"."area_id" is not null or "intel_geographic_indicators"."lat" is not null)
);
--> statement-breakpoint
CREATE TABLE "intel_hub_observations" (
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"date" date NOT NULL,
	"sessions" integer NOT NULL,
	"energy_kwh" double precision NOT NULL,
	"import_id" uuid,
	CONSTRAINT "intel_hub_observations_property_id_date_pk" PRIMARY KEY("property_id","date"),
	CONSTRAINT "intel_obs_values_ck" CHECK ("intel_hub_observations"."sessions" >= 0 and "intel_hub_observations"."energy_kwh" >= 0)
);
--> statement-breakpoint
CREATE TABLE "intel_imported_datasets" (
	"import_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"content_type" text NOT NULL,
	"content" bytea NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_memberships" (
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intel_memberships_user_id_organization_id_pk" PRIMARY KEY("user_id","organization_id"),
	CONSTRAINT "intel_member_role_ck" CHECK ("intel_memberships"."role" in ('admin_global','gestor_regional','franqueado','analista','consulta'))
);
--> statement-breakpoint
CREATE TABLE "intel_model_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"config" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intel_mv_kind_ck" CHECK ("intel_model_versions"."kind" in ('potential_index','demand'))
);
--> statement-breakpoint
CREATE TABLE "intel_municipalities" (
	"ibge_code" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"uf" text NOT NULL,
	"population" integer,
	"population_reference" text,
	"area_km2" double precision,
	"lat" double precision,
	"lng" double precision,
	"location" geography(Point, 4326) GENERATED ALWAYS AS (case when lat is not null and lng is not null then ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography end) STORED,
	"source_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_org_regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"uf" text NOT NULL,
	"municipality_code" integer
);
--> statement-breakpoint
CREATE TABLE "intel_organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'franquia' NOT NULL,
	"parent_id" uuid,
	"document" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intel_org_kind_ck" CHECK ("intel_organizations"."kind" in ('matriz','franquia','parceiro_b2b'))
);
--> statement-breakpoint
CREATE TABLE "intel_pois" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text,
	"category" text NOT NULL,
	"name" text,
	"lat" double precision,
	"lng" double precision,
	"location" geography(Point, 4326) GENERATED ALWAYS AS (case when lat is not null and lng is not null then ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography end) STORED,
	"source_key" text NOT NULL,
	"import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"district" text,
	"city" text,
	"uf" text,
	"zip" text,
	"municipality_code" integer,
	"lat" double precision,
	"lng" double precision,
	"location" geography(Point, 4326) GENERATED ALWAYS AS (case when lat is not null and lng is not null then ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography end) STORED,
	"polygon" geometry(MultiPolygon, 4326),
	"area_m2" double precision,
	"monthly_rent" numeric(14, 2),
	"sale_price" numeric(14, 2),
	"property_type" text,
	"occupancy" text,
	"parking" boolean,
	"street_access" boolean,
	"main_road_distance_m" double precision,
	"destinations_within_1km" integer,
	"objective" text,
	"business_model" text DEFAULT 'smart_hub' NOT NULL,
	"status" text DEFAULT 'prospeccao' NOT NULL,
	"geocode_source" text,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intel_prop_model_ck" CHECK ("intel_properties"."business_model" in ('smart_hub','b2b')),
	CONSTRAINT "intel_prop_status_ck" CHECK ("intel_properties"."status" in ('prospeccao','em_estudo','aprovado','descartado','implantado')),
	CONSTRAINT "intel_prop_values_ck" CHECK (("intel_properties"."area_m2" is null or "intel_properties"."area_m2" > 0) and ("intel_properties"."monthly_rent" is null or "intel_properties"."monthly_rent" >= 0) and ("intel_properties"."sale_price" is null or "intel_properties"."sale_price" >= 0))
);
--> statement-breakpoint
CREATE TABLE "intel_property_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"reference" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"study_id" uuid,
	"kind" text NOT NULL,
	"format" text NOT NULL,
	"nature" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_roads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"osm_id" text,
	"name" text,
	"highway" text NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"geom" geometry(MultiLineString, 4326) NOT NULL,
	"source_key" text DEFAULT 'osm' NOT NULL,
	"import_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_states" (
	"uf" text PRIMARY KEY NOT NULL,
	"ibge_code" integer NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	CONSTRAINT "intel_states_ibge_code_unique" UNIQUE("ibge_code")
);
--> statement-breakpoint
CREATE TABLE "intel_station_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station_id" uuid NOT NULL,
	"changed_by" uuid,
	"reason" text NOT NULL,
	"evidence" text,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_studies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"business_model" text DEFAULT 'smart_hub' NOT NULL,
	"status" text DEFAULT 'em_andamento' NOT NULL,
	"chargers" jsonb NOT NULL,
	"site" jsonb NOT NULL,
	"electrical" jsonb NOT NULL,
	"demand" jsonb NOT NULL,
	"finance" jsonb NOT NULL,
	"selected_scenario" text DEFAULT 'base' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intel_study_status_ck" CHECK ("intel_studies"."status" in ('em_andamento','concluido','arquivado')),
	CONSTRAINT "intel_study_scn_ck" CHECK ("intel_studies"."selected_scenario" in ('conservador','base','otimista'))
);
--> statement-breakpoint
CREATE TABLE "intel_study_revenues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"study_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"commercial_model" text,
	"status" text DEFAULT 'hipotese' NOT NULL,
	"gross_monthly" numeric(14, 2) NOT NULL,
	"costs_monthly" numeric(14, 2) DEFAULT '0' NOT NULL,
	"commission_rate" double precision DEFAULT 0 NOT NULL,
	"tax_rate" double precision DEFAULT 0 NOT NULL,
	"initial_investment" numeric(14, 2) DEFAULT '0' NOT NULL,
	"confidence" text DEFAULT 'baixa' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intel_rev_status_ck" CHECK ("intel_study_revenues"."status" in ('hipotese','negociando','contratado','realizado')),
	CONSTRAINT "intel_rev_rates_ck" CHECK ("intel_study_revenues"."commission_rate" >= 0 and "intel_study_revenues"."commission_rate" < 1 and "intel_study_revenues"."tax_rate" >= 0 and "intel_study_revenues"."tax_rate" < 1)
);
--> statement-breakpoint
CREATE TABLE "intel_study_shares" (
	"study_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"shared_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intel_study_shares_study_id_organization_id_pk" PRIMARY KEY("study_id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_charger_catalog" ADD CONSTRAINT "intel_charger_catalog_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_charging_connectors" ADD CONSTRAINT "intel_charging_connectors_station_id_intel_charging_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."intel_charging_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_charging_stations" ADD CONSTRAINT "intel_charging_stations_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_charging_stations" ADD CONSTRAINT "intel_charging_stations_source_key_intel_data_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."intel_data_sources"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_data_imports" ADD CONSTRAINT "intel_data_imports_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_data_imports" ADD CONSTRAINT "intel_data_imports_source_key_intel_data_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."intel_data_sources"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_data_imports" ADD CONSTRAINT "intel_data_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_demand_forecasts" ADD CONSTRAINT "intel_demand_forecasts_study_id_intel_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."intel_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_demand_forecasts" ADD CONSTRAINT "intel_demand_forecasts_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_demand_forecasts" ADD CONSTRAINT "intel_demand_forecasts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_energy_tariffs" ADD CONSTRAINT "intel_energy_tariffs_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_geographic_indicators" ADD CONSTRAINT "intel_geographic_indicators_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_geographic_indicators" ADD CONSTRAINT "intel_geographic_indicators_area_id_intel_geographic_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."intel_geographic_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_geographic_indicators" ADD CONSTRAINT "intel_geographic_indicators_source_key_intel_data_sources_key_fk" FOREIGN KEY ("source_key") REFERENCES "public"."intel_data_sources"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_geographic_indicators" ADD CONSTRAINT "intel_geographic_indicators_import_id_intel_data_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."intel_data_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_hub_observations" ADD CONSTRAINT "intel_hub_observations_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_hub_observations" ADD CONSTRAINT "intel_hub_observations_property_id_intel_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."intel_properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_hub_observations" ADD CONSTRAINT "intel_hub_observations_import_id_intel_data_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."intel_data_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_imported_datasets" ADD CONSTRAINT "intel_imported_datasets_import_id_intel_data_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."intel_data_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_imported_datasets" ADD CONSTRAINT "intel_imported_datasets_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_memberships" ADD CONSTRAINT "intel_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_memberships" ADD CONSTRAINT "intel_memberships_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_model_versions" ADD CONSTRAINT "intel_model_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_municipalities" ADD CONSTRAINT "intel_municipalities_uf_intel_states_uf_fk" FOREIGN KEY ("uf") REFERENCES "public"."intel_states"("uf") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_org_regions" ADD CONSTRAINT "intel_org_regions_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_properties" ADD CONSTRAINT "intel_properties_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_properties" ADD CONSTRAINT "intel_properties_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_property_documents" ADD CONSTRAINT "intel_property_documents_property_id_intel_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."intel_properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_property_documents" ADD CONSTRAINT "intel_property_documents_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_property_documents" ADD CONSTRAINT "intel_property_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_reports" ADD CONSTRAINT "intel_reports_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_reports" ADD CONSTRAINT "intel_reports_study_id_intel_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."intel_studies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_reports" ADD CONSTRAINT "intel_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_station_revisions" ADD CONSTRAINT "intel_station_revisions_station_id_intel_charging_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."intel_charging_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_station_revisions" ADD CONSTRAINT "intel_station_revisions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_studies" ADD CONSTRAINT "intel_studies_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_studies" ADD CONSTRAINT "intel_studies_property_id_intel_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."intel_properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_studies" ADD CONSTRAINT "intel_studies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_study_revenues" ADD CONSTRAINT "intel_study_revenues_study_id_intel_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."intel_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_study_revenues" ADD CONSTRAINT "intel_study_revenues_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_study_shares" ADD CONSTRAINT "intel_study_shares_study_id_intel_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."intel_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_study_shares" ADD CONSTRAINT "intel_study_shares_organization_id_intel_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."intel_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intel_study_shares" ADD CONSTRAINT "intel_study_shares_shared_by_users_id_fk" FOREIGN KEY ("shared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_occurred_idx" ON "audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "prt_user_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uq" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "intel_cs_src_ext_uq" ON "intel_charging_stations" USING btree ("source_key","external_id");--> statement-breakpoint
CREATE INDEX "intel_cs_loc_gix" ON "intel_charging_stations" USING gist ("location");--> statement-breakpoint
CREATE INDEX "intel_cs_org_idx" ON "intel_charging_stations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "intel_imp_org_idx" ON "intel_data_imports" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "intel_fc_study_idx" ON "intel_demand_forecasts" USING btree ("study_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "intel_areas_src_ext_uq" ON "intel_geographic_areas" USING btree ("source_key","external_id");--> statement-breakpoint
CREATE INDEX "intel_areas_geom_gix" ON "intel_geographic_areas" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "intel_areas_loc_gix" ON "intel_geographic_areas" USING gist ("location");--> statement-breakpoint
CREATE INDEX "intel_ind_mun_idx" ON "intel_geographic_indicators" USING btree ("indicator","municipality_code","reference_date");--> statement-breakpoint
CREATE INDEX "intel_ind_loc_gix" ON "intel_geographic_indicators" USING gist ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "intel_mv_kind_version_uq" ON "intel_model_versions" USING btree ("kind","version");--> statement-breakpoint
CREATE UNIQUE INDEX "intel_mv_active_uq" ON "intel_model_versions" USING btree ("kind") WHERE "intel_model_versions"."active";--> statement-breakpoint
CREATE INDEX "intel_mun_uf_idx" ON "intel_municipalities" USING btree ("uf");--> statement-breakpoint
CREATE INDEX "intel_mun_name_idx" ON "intel_municipalities" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "intel_mun_loc_gix" ON "intel_municipalities" USING gist ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "intel_org_regions_uq" ON "intel_org_regions" USING btree ("organization_id","uf",coalesce("municipality_code", 0));--> statement-breakpoint
CREATE UNIQUE INDEX "intel_org_name_uq" ON "intel_organizations" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "intel_pois_src_ext_uq" ON "intel_pois" USING btree ("source_key","external_id");--> statement-breakpoint
CREATE INDEX "intel_pois_loc_gix" ON "intel_pois" USING gist ("location");--> statement-breakpoint
CREATE INDEX "intel_pois_cat_idx" ON "intel_pois" USING btree ("category");--> statement-breakpoint
CREATE INDEX "intel_prop_org_idx" ON "intel_properties" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "intel_prop_loc_gix" ON "intel_properties" USING gist ("location");--> statement-breakpoint
CREATE INDEX "intel_prop_poly_gix" ON "intel_properties" USING gist ("polygon");--> statement-breakpoint
CREATE UNIQUE INDEX "intel_roads_osm_uq" ON "intel_roads" USING btree ("source_key","osm_id");--> statement-breakpoint
CREATE INDEX "intel_roads_geom_gix" ON "intel_roads" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "intel_roads_main_idx" ON "intel_roads" USING btree ("is_main");--> statement-breakpoint
CREATE INDEX "intel_study_org_idx" ON "intel_studies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "intel_study_prop_idx" ON "intel_studies" USING btree ("property_id");
--> statement-breakpoint
-- =====================================================================
-- Tebras Hub — Auditoria e regras de integridade aplicadas NO BANCO.
-- Estas regras valem mesmo se o código da aplicação tiver falhas.
-- =====================================================================

-- 1) updated_at automático ------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint

-- 2) Auditoria genérica de alterações ----------------------------------------
-- O usuário e o IP vêm de variáveis de sessão definidas pela aplicação em cada
-- transação (SET LOCAL app.user_id / app.ip). Colunas sensíveis são excluídas
-- via argumentos do trigger (TG_ARGV).
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_user    uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  v_ip      text := nullif(current_setting('app.ip', true), '');
  v_ua      text := nullif(current_setting('app.user_agent', true), '');
  v_before  jsonb;
  v_after   jsonb;
  v_changed text[];
  v_row     jsonb;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_before := to_jsonb(OLD) - TG_ARGV;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_after := to_jsonb(NEW) - TG_ARGV;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(a.key ORDER BY a.key) INTO v_changed
      FROM jsonb_each(v_after) a
     WHERE a.value IS DISTINCT FROM (v_before -> a.key)
       AND a.key <> 'updated_at';
    -- Nada relevante mudou (ex.: apenas colunas excluídas ou updated_at)
    IF v_changed IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  v_row := coalesce(v_after, v_before);
  INSERT INTO audit_log (user_id, action, entity_type, entity_id, before, after, changed_fields, ip, user_agent)
  VALUES (
    v_user,
    lower(TG_OP),
    TG_TABLE_NAME,
    coalesce(v_row ->> 'id', v_row ->> 'party_id', v_row ->> 'user_id', v_row ->> 'role_id', v_row ->> 'key'),
    v_before,
    v_after,
    v_changed,
    v_ip,
    v_ua
  );
  RETURN coalesce(NEW, OLD);
END $$;
--> statement-breakpoint

-- 3) Trilha de auditoria append-only ------------------------------------------
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log é somente inserção: alteração ou exclusão não permitida'
    USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
--> statement-breakpoint

-- 4) Usuários não são excluídos, apenas desativados (preserva rastreabilidade) --
CREATE OR REPLACE FUNCTION users_no_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Usuários não podem ser excluídos; utilize a desativação'
    USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
CREATE TRIGGER users_block_delete BEFORE DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION users_no_delete();
--> statement-breakpoint

-- 5) Triggers de updated_at ---------------------------------------------------
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint

-- 6) Triggers de auditoria ----------------------------------------------------
CREATE TRIGGER users_audit AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION audit_row_change('password_hash', 'failed_login_count', 'locked_until', 'last_login_at');
--> statement-breakpoint
CREATE TRIGGER roles_audit AFTER INSERT OR UPDATE OR DELETE ON roles
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER role_permissions_audit AFTER INSERT OR DELETE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER user_roles_audit AFTER INSERT OR DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
CREATE TRIGGER app_settings_audit AFTER INSERT OR UPDATE OR DELETE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
--> statement-breakpoint
-- ===================== Tebras Intelligence: integridade, auditoria e segurança =====================
CREATE TRIGGER intel_org_updated_at BEFORE UPDATE ON intel_organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER intel_prop_updated_at BEFORE UPDATE ON intel_properties FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER intel_cs_updated_at BEFORE UPDATE ON intel_charging_stations FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER intel_cat_updated_at BEFORE UPDATE ON intel_charger_catalog FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER intel_study_updated_at BEFORE UPDATE ON intel_studies FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER intel_org_audit AFTER INSERT OR UPDATE OR DELETE ON intel_organizations FOR EACH ROW EXECUTE FUNCTION audit_row_change();--> statement-breakpoint
CREATE TRIGGER intel_member_audit AFTER INSERT OR UPDATE OR DELETE ON intel_memberships FOR EACH ROW EXECUTE FUNCTION audit_row_change();--> statement-breakpoint
CREATE TRIGGER intel_prop_audit AFTER INSERT OR UPDATE OR DELETE ON intel_properties FOR EACH ROW EXECUTE FUNCTION audit_row_change('location','polygon');--> statement-breakpoint
CREATE TRIGGER intel_cs_audit AFTER UPDATE OR DELETE ON intel_charging_stations FOR EACH ROW EXECUTE FUNCTION audit_row_change('location','raw');--> statement-breakpoint
CREATE TRIGGER intel_study_audit AFTER INSERT OR UPDATE OR DELETE ON intel_studies FOR EACH ROW EXECUTE FUNCTION audit_row_change();--> statement-breakpoint
CREATE TRIGGER intel_rev_audit AFTER INSERT OR UPDATE OR DELETE ON intel_study_revenues FOR EACH ROW EXECUTE FUNCTION audit_row_change();--> statement-breakpoint
CREATE TRIGGER intel_src_audit AFTER UPDATE ON intel_data_sources FOR EACH ROW EXECUTE FUNCTION audit_row_change();--> statement-breakpoint
CREATE TRIGGER intel_mv_audit AFTER INSERT OR UPDATE ON intel_model_versions FOR EACH ROW EXECUTE FUNCTION audit_row_change();--> statement-breakpoint
CREATE TRIGGER intel_share_audit AFTER INSERT OR DELETE ON intel_study_shares FOR EACH ROW EXECUTE FUNCTION audit_row_change();--> statement-breakpoint
CREATE TRIGGER intel_imp_audit AFTER INSERT ON intel_data_imports FOR EACH ROW EXECUTE FUNCTION audit_row_change('mapping','issues','summary');--> statement-breakpoint

CREATE OR REPLACE FUNCTION unaccent_simple(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT translate(t, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC') $$;--> statement-breakpoint

-- Row Level Security (defesa em profundidade; a autorização principal está em src/server/intel).
-- A aplicação define, por transação: app.intel_orgs = lista de organizações do usuário; app.intel_global = 'on' p/ admin global.
-- Superusuários e o dono das tabelas ignoram RLS; em produção a aplicação usa o papel restrito (db/runtime-role.sql).
CREATE OR REPLACE FUNCTION intel_org_visible(org uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.intel_global', true), '') = 'on'
      OR org = ANY (coalesce(string_to_array(nullif(current_setting('app.intel_orgs', true), ''), ',')::uuid[], '{}'::uuid[]))
$$;--> statement-breakpoint
ALTER TABLE intel_properties ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY intel_prop_org ON intel_properties USING (intel_org_visible(organization_id) OR EXISTS (SELECT 1 FROM intel_studies s JOIN intel_study_shares sh ON sh.study_id = s.id WHERE s.property_id = intel_properties.id AND intel_org_visible(sh.organization_id))) WITH CHECK (intel_org_visible(organization_id));--> statement-breakpoint
ALTER TABLE intel_studies ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY intel_study_org ON intel_studies USING (intel_org_visible(organization_id) OR EXISTS (SELECT 1 FROM intel_study_shares sh WHERE sh.study_id = intel_studies.id AND intel_org_visible(sh.organization_id))) WITH CHECK (intel_org_visible(organization_id));--> statement-breakpoint
ALTER TABLE intel_study_revenues ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY intel_rev_org ON intel_study_revenues USING (intel_org_visible(organization_id)) WITH CHECK (intel_org_visible(organization_id));--> statement-breakpoint
ALTER TABLE intel_demand_forecasts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY intel_fc_org ON intel_demand_forecasts USING (intel_org_visible(organization_id)) WITH CHECK (intel_org_visible(organization_id));--> statement-breakpoint
ALTER TABLE intel_reports ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY intel_rep_org ON intel_reports USING (intel_org_visible(organization_id)) WITH CHECK (intel_org_visible(organization_id));--> statement-breakpoint
ALTER TABLE intel_hub_observations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY intel_obs_org ON intel_hub_observations USING (intel_org_visible(organization_id)) WITH CHECK (intel_org_visible(organization_id));--> statement-breakpoint
ALTER TABLE intel_property_documents ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY intel_doc_org ON intel_property_documents USING (intel_org_visible(organization_id)) WITH CHECK (intel_org_visible(organization_id));--> statement-breakpoint
ALTER TABLE intel_imported_datasets ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY intel_ds_org ON intel_imported_datasets USING (organization_id IS NULL AND coalesce(current_setting('app.intel_global', true), '') = 'on' OR intel_org_visible(organization_id)) WITH CHECK (organization_id IS NULL OR intel_org_visible(organization_id));--> statement-breakpoint
-- Carregadores: públicos (organization_id nulo) visíveis a todos; privados apenas à organização.
ALTER TABLE intel_charging_stations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY intel_cs_org ON intel_charging_stations USING (organization_id IS NULL OR intel_org_visible(organization_id)) WITH CHECK (organization_id IS NULL OR intel_org_visible(organization_id));--> statement-breakpoint
ALTER TABLE intel_geographic_indicators ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY intel_ind_org ON intel_geographic_indicators USING (organization_id IS NULL OR intel_org_visible(organization_id)) WITH CHECK (organization_id IS NULL OR intel_org_visible(organization_id));--> statement-breakpoint

-- ===================== Dados de referência =====================
INSERT INTO intel_states (uf, ibge_code, name, region) VALUES
 ('RO',11,'Rondônia','Norte'),('AC',12,'Acre','Norte'),('AM',13,'Amazonas','Norte'),('RR',14,'Roraima','Norte'),('PA',15,'Pará','Norte'),('AP',16,'Amapá','Norte'),('TO',17,'Tocantins','Norte'),
 ('MA',21,'Maranhão','Nordeste'),('PI',22,'Piauí','Nordeste'),('CE',23,'Ceará','Nordeste'),('RN',24,'Rio Grande do Norte','Nordeste'),('PB',25,'Paraíba','Nordeste'),('PE',26,'Pernambuco','Nordeste'),('AL',27,'Alagoas','Nordeste'),('SE',28,'Sergipe','Nordeste'),('BA',29,'Bahia','Nordeste'),
 ('MG',31,'Minas Gerais','Sudeste'),('ES',32,'Espírito Santo','Sudeste'),('RJ',33,'Rio de Janeiro','Sudeste'),('SP',35,'São Paulo','Sudeste'),
 ('PR',41,'Paraná','Sul'),('SC',42,'Santa Catarina','Sul'),('RS',43,'Rio Grande do Sul','Sul'),
 ('MS',50,'Mato Grosso do Sul','Centro-Oeste'),('MT',51,'Mato Grosso','Centro-Oeste'),('GO',52,'Goiás','Centro-Oeste'),('DF',53,'Distrito Federal','Centro-Oeste');--> statement-breakpoint

INSERT INTO intel_organizations (name, kind) VALUES ('Tebras Eletroposto', 'matriz');--> statement-breakpoint

-- Catálogo genérico: categorias de SIMULAÇÃO, sem fabricante, sem custos (custos devem ser cotados).
INSERT INTO intel_charger_catalog (category, power_kw, current_type, is_generic, source) VALUES
 ('ac7', 7, 'AC', true, 'Categoria genérica de simulação — sem cotação'),
 ('ac22', 22, 'AC', true, 'Categoria genérica de simulação — sem cotação'),
 ('dc30', 30, 'DC', true, 'Categoria genérica de simulação — sem cotação'),
 ('dc60', 60, 'DC', true, 'Categoria genérica de simulação — sem cotação'),
 ('dc80', 80, 'DC', true, 'Categoria genérica de simulação — sem cotação'),
 ('dc120', 120, 'DC', true, 'Categoria genérica de simulação — sem cotação');--> statement-breakpoint

INSERT INTO intel_data_sources (key, name, description, category, official_url, access_type, formats, coverage, update_frequency, license, restrictions, status, quality) VALUES
 ('manual', 'Cadastro manual Tebras', 'Registros inseridos ou corrigidos por usuários autorizados, com histórico.', 'Interna', NULL, 'Interface do sistema', 'Formulário', 'Conforme cadastro', 'Contínua', 'Dados próprios', NULL, 'funcionando', 'media'),
 ('importacao_csv', 'Importação de arquivos (CSV/XLSX/GeoJSON)', 'Carga manual de planilhas e arquivos geográficos com mapeamento de colunas, validação e prévia.', 'Interna', NULL, 'Upload', 'CSV, XLSX, GeoJSON', 'Conforme arquivo', 'Sob demanda', 'Conforme a fonte do arquivo (registrar na importação)', 'O usuário declara as condições de uso de cada arquivo.', 'funcionando', 'desconhecida'),
 ('ibge_localidades', 'IBGE — API de Localidades', 'Estados e municípios (códigos oficiais).', 'Território', 'https://servicodados.ibge.gov.br/api/docs/localidades', 'API pública sem credencial', 'JSON', 'Brasil', 'Eventual', 'Dados públicos do IBGE (citar a fonte)', 'Respeitar limites de uso.', 'nao_testada', 'alta'),
 ('ibge_populacao', 'IBGE — Agregados (SIDRA) Censo 2022', 'População residente e área territorial por município (tabela 4714 do Censo 2022).', 'Demografia', 'https://servicodados.ibge.gov.br/api/docs/agregados', 'API pública sem credencial', 'JSON', 'Brasil (resolução municipal)', 'Decenal (Censo) / anual (estimativas)', 'Dados públicos do IBGE (citar a fonte)', 'Resolução municipal: não usar como dado por rua.', 'nao_testada', 'alta'),
 ('osm_nominatim', 'OpenStreetMap — Nominatim (geocodificação)', 'Pesquisa de endereços e geocodificação reversa.', 'Geocodificação', 'https://operations.osmfoundation.org/policies/nominatim/', 'API pública com política de uso', 'JSON', 'Mundial', 'Contínua', 'ODbL — atribuição obrigatória "© OpenStreetMap contributors"', 'Máx. 1 requisição/s, User-Agent identificado, sem uso massivo. Em produção, usar instância própria ou provedor contratado (NOMINATIM_URL).', 'nao_testada', 'media'),
 ('osm_overpass', 'OpenStreetMap — Overpass (carregadores e POIs)', 'Consulta por área de amenity=charging_station e pontos de interesse.', 'Infraestrutura', 'https://wiki.openstreetmap.org/wiki/Overpass_API', 'API pública com limites', 'JSON', 'Mundial (cobertura colaborativa irregular)', 'Contínua', 'ODbL — atribuição obrigatória', 'Consultas por área pequena; para escala nacional usar extratos (Geofabrik) e infraestrutura própria. OSM não informa fluxo de veículos nem frota.', 'nao_testada', 'baixa'),
 ('osm_extrato', 'OpenStreetMap — extrato regional (GeoJSON)', 'Importação de malha viária e POIs a partir de extratos convertidos para GeoJSON (ex.: Geofabrik + ogr2ogr/osmium).', 'Viário', 'https://download.geofabrik.de/south-america/brazil.html', 'Download de arquivo', 'GeoJSON', 'Por região importada', 'Diária (extratos)', 'ODbL — atribuição obrigatória', 'Não é fonte de fluxo de veículos.', 'importacao_manual', 'media'),
 ('osm_tiles', 'OpenStreetMap — tiles do mapa', 'Mapa de fundo raster.', 'Mapa base', 'https://operations.osmfoundation.org/policies/tiles/', 'Servidor público com política de uso', 'PNG', 'Mundial', 'Contínua', 'ODbL / atribuição', 'Uso leve apenas; para produção configurar MAP_TILE_URL de provedor contratado ou próprio.', 'nao_testada', 'alta'),
 ('open_charge_map', 'Open Charge Map', 'Diretório colaborativo de pontos de recarga.', 'Infraestrutura', 'https://openchargemap.org/site/develop/api', 'API com chave', 'JSON', 'Mundial (colaborativa)', 'Contínua', 'CC BY 4.0 (verificar termos vigentes)', 'Exige OPEN_CHARGE_MAP_API_KEY.', 'necessita_credenciais', 'baixa'),
 ('senatran_frota', 'SENATRAN — Frota de veículos', 'Estatísticas de frota por município, tipo e combustível (planilhas mensais).', 'Frota', 'https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran/estatisticas-frota-de-veiculos-senatran', 'Download de planilhas', 'XLSX/CSV', 'Brasil (municipal)', 'Mensal', 'Dados públicos', 'Sem API: importar a planilha e mapear o código IBGE. Distinção BEV/PHEV depende da categoria de combustível publicada.', 'importacao_manual', 'media'),
 ('detran', 'DETRANs estaduais — frota', 'Estatísticas estaduais de frota, quando publicadas.', 'Frota', NULL, 'Varia por estado', 'Varia', 'Estadual', 'Varia', 'Varia por órgão', 'Verificar condições de cada DETRAN.', 'importacao_manual', 'desconhecida'),
 ('aneel', 'ANEEL — Dados abertos', 'Tarifas homologadas e dados de distribuidoras.', 'Energia', 'https://dadosabertos.aneel.gov.br/', 'Portal de dados abertos', 'CSV', 'Brasil (por distribuidora)', 'Variável', 'Dados públicos', 'Não existe base pública com a capacidade elétrica de cada imóvel. Tarifas cadastradas manualmente.', 'importacao_manual', 'media'),
 ('transito_contagens', 'Órgãos de trânsito — contagens volumétricas', 'Contagens de tráfego, sensores e séries temporais municipais/estaduais.', 'Fluxo', NULL, 'Varia por órgão', 'Varia', 'Pontos de medição', 'Varia', 'Varia por órgão', 'Representa apenas o trecho medido — não extrapolar para a malha.', 'nao_implementada', 'desconhecida'),
 ('geosampa', 'GeoSampa (Prefeitura de São Paulo)', 'Uso do solo, zoneamento, equipamentos públicos.', 'Urbano', 'https://geosampa.prefeitura.sp.gov.br/', 'Download de camadas', 'SHP/GeoJSON/KML', 'Município de São Paulo', 'Variável', 'Verificar termos do portal', 'Converter para GeoJSON e importar.', 'importacao_manual', 'alta'),
 ('evie_uber', 'EVIE (Uber) — arquivos autorizados', 'Indicadores agregados de demanda por recarga fornecidos pela Uber mediante autorização.', 'Demanda', NULL, 'Arquivo fornecido mediante autorização', 'CSV/XLSX', 'Conforme arquivo', 'Conforme acordo', 'Conforme autorização da Uber', 'Sem acesso a API; sem dados individuais. Registrar condições de uso em cada importação.', 'necessita_autorizacao', 'desconhecida'),
 ('operacao_hubs', 'Operação dos hubs Tebras', 'Sessões e energia diárias dos hubs próprios (base para calibração).', 'Interna', NULL, 'Importação de arquivo/plataforma', 'CSV/XLSX', 'Hubs próprios', 'Diária', 'Dados próprios', NULL, 'importacao_manual', 'alta');
