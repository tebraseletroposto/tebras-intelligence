import { sql } from "drizzle-orm";
import {
  boolean, check, customType, date, doublePrecision, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * Tebras Intelligence — inteligência geográfica, demanda e viabilidade de hubs de recarga.
 *
 * Convenções:
 *  - Prefixo `intel_`.
 *  - Geometrias em PostGIS (SRID 4326). Pontos têm lat/lng numéricos + coluna `geography` GERADA,
 *    com índice GIST, para consultas por raio (ST_DWithin) sem duplicar a fonte da verdade.
 *  - Dados privados têm `organization_id` e Row Level Security (ver migração 0014).
 *  - Valores desconhecidos são NULL (nunca zero).
 */

const geography = customType<{ data: string; driverData: string }>({ dataType: () => "geography(Point, 4326)" });
const geometryPolygon = customType<{ data: string; driverData: string }>({ dataType: () => "geometry(MultiPolygon, 4326)" });
const geometryLine = customType<{ data: string; driverData: string }>({ dataType: () => "geometry(MultiLineString, 4326)" });
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

const pointCols = () => ({
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  location: geography("location").generatedAlwaysAs(sql`case when lat is not null and lng is not null then ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography end`),
});
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/* ----------------------------- Organizações e franquias ----------------------------- */

export const intelOrganizations = pgTable("intel_organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("franquia"),
  parentId: uuid("parent_id"),
  document: text("document"),
  isDemo: boolean("is_demo").notNull().default(false),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (t) => [
  check("intel_org_kind_ck", sql`${t.kind} in ('matriz','franquia','parceiro_b2b')`),
  uniqueIndex("intel_org_name_uq").on(sql`lower(${t.name})`),
]);

export const intelOrgRegions = pgTable("intel_org_regions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => intelOrganizations.id, { onDelete: "cascade" }),
  uf: text("uf").notNull(),
  municipalityCode: integer("municipality_code"),
}, (t) => [uniqueIndex("intel_org_regions_uq").on(t.organizationId, t.uf, sql`coalesce(${t.municipalityCode}, 0)`)]);

export const INTEL_ROLES = ["admin_global", "gestor_regional", "franqueado", "analista", "consulta"] as const;
export const intelMemberships = pgTable("intel_memberships", {
  userId: uuid("user_id").notNull().references(() => users.id),
  organizationId: uuid("organization_id").notNull().references(() => intelOrganizations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.organizationId] }),
  check("intel_member_role_ck", sql`${t.role} in ('admin_global','gestor_regional','franqueado','analista','consulta')`),
]);

/* ----------------------------------- Geografia ----------------------------------- */

export const intelStates = pgTable("intel_states", {
  uf: text("uf").primaryKey(),
  ibgeCode: integer("ibge_code").notNull().unique(),
  name: text("name").notNull(),
  region: text("region").notNull(),
});

export const intelMunicipalities = pgTable("intel_municipalities", {
  ibgeCode: integer("ibge_code").primaryKey(),
  name: text("name").notNull(),
  uf: text("uf").notNull().references(() => intelStates.uf),
  population: integer("population"),
  populationReference: text("population_reference"),
  areaKm2: doublePrecision("area_km2"),
  ...pointCols(),
  sourceKey: text("source_key"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("intel_mun_uf_idx").on(t.uf), index("intel_mun_name_idx").on(sql`lower(${t.name})`), index("intel_mun_loc_gix").using("gist", t.location)]);

/** Áreas geográficas genéricas (células de fontes agregadas como EVIE, zonas, bairros importados). */
export const intelGeographicAreas = pgTable("intel_geographic_areas", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  name: text("name"),
  sourceKey: text("source_key").notNull(),
  externalId: text("external_id"),
  geom: geometryPolygon("geom"),
  ...pointCols(),
  properties: jsonb("properties"),
  importId: uuid("import_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("intel_areas_src_ext_uq").on(t.sourceKey, t.externalId), index("intel_areas_geom_gix").using("gist", t.geom), index("intel_areas_loc_gix").using("gist", t.location)]);

/** Malha viária importada de extratos do OpenStreetMap (ODbL), por área — nunca a malha nacional inteira no navegador. */
export const intelRoads = pgTable("intel_roads", {
  id: uuid("id").primaryKey().defaultRandom(),
  osmId: text("osm_id"),
  name: text("name"),
  highway: text("highway").notNull(),
  isMain: boolean("is_main").notNull().default(false),
  geom: geometryLine("geom").notNull(),
  sourceKey: text("source_key").notNull().default("osm"),
  importId: uuid("import_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("intel_roads_osm_uq").on(t.sourceKey, t.osmId), index("intel_roads_geom_gix").using("gist", t.geom), index("intel_roads_main_idx").on(t.isMain)]);

/** Pontos de interesse (shoppings, terminais, aeroportos, polos) — OSM ou importação autorizada. */
export const intelPois = pgTable("intel_pois", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalId: text("external_id"),
  category: text("category").notNull(),
  name: text("name"),
  ...pointCols(),
  sourceKey: text("source_key").notNull(),
  importId: uuid("import_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("intel_pois_src_ext_uq").on(t.sourceKey, t.externalId), index("intel_pois_loc_gix").using("gist", t.location), index("intel_pois_cat_idx").on(t.category)]);

/* -------------------------------- Fontes e importações -------------------------------- */

export const intelDataSources = pgTable("intel_data_sources", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  officialUrl: text("official_url"),
  accessType: text("access_type").notNull(),
  formats: text("formats").notNull(),
  coverage: text("coverage").notNull(),
  updateFrequency: text("update_frequency"),
  license: text("license"),
  restrictions: text("restrictions"),
  status: text("status").notNull(),
  quality: text("quality").notNull().default("desconhecida"),
  lastTestAt: timestamp("last_test_at", { withTimezone: true }),
  lastTestOk: boolean("last_test_ok"),
  lastError: text("last_error"),
  lastImportAt: timestamp("last_import_at", { withTimezone: true }),
  recordCount: integer("record_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("intel_src_status_ck", sql`${t.status} in ('funcionando','importacao_manual','necessita_credenciais','necessita_autorizacao','indisponivel','nao_implementada','descontinuada','nao_testada')`),
]);

export const intelDataImports = pgTable("intel_data_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => intelOrganizations.id),
  sourceKey: text("source_key").notNull().references(() => intelDataSources.key),
  target: text("target").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  sha256: text("sha256").notNull(),
  mapping: jsonb("mapping").notNull(),
  status: text("status").notNull(),
  totalRows: integer("total_rows").notNull().default(0),
  validRows: integer("valid_rows").notNull().default(0),
  invalidRows: integer("invalid_rows").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
  insertedRows: integer("inserted_rows").notNull().default(0),
  issues: jsonb("issues"),
  summary: jsonb("summary"),
  referenceDate: date("reference_date"),
  usageConditions: text("usage_conditions"),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("intel_imp_status_ck", sql`${t.status} in ('concluida','concluida_com_erros','falhou','cancelada')`),
  index("intel_imp_org_idx").on(t.organizationId, t.createdAt),
]);

/** Arquivo original preservado (proveniência). */
export const intelImportedDatasets = pgTable("intel_imported_datasets", {
  importId: uuid("import_id").primaryKey().references(() => intelDataImports.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").references(() => intelOrganizations.id),
  contentType: text("content_type").notNull(),
  content: bytea("content").notNull(),
});

/* ------------------------------ Carregadores conhecidos ------------------------------ */

export const intelChargingStations = pgTable("intel_charging_stations", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** NULL = dado público compartilhado; preenchido = dado privado da organização. */
  organizationId: uuid("organization_id").references(() => intelOrganizations.id),
  sourceKey: text("source_key").notNull().references(() => intelDataSources.key),
  externalId: text("external_id"),
  name: text("name"),
  address: text("address"),
  operator: text("operator"),
  ...pointCols(),
  maxPowerKw: doublePrecision("max_power_kw"),
  connectors: integer("connectors"),
  currentType: text("current_type"),
  connectorStandard: text("connector_standard"),
  pricePerKwh: numeric("price_per_kwh", { precision: 8, scale: 3 }),
  openingHours: text("opening_hours"),
  operationalStatus: text("operational_status").notNull().default("desconhecido"),
  verificationStatus: text("verification_status").notNull().default("nao_verificado"),
  verifiedAt: date("verified_at"),
  confidence: text("confidence").notNull().default("baixa"),
  isDemo: boolean("is_demo").notNull().default(false),
  importId: uuid("import_id"),
  raw: jsonb("raw"),
  ...timestamps,
}, (t) => [
  check("intel_cs_coords_ck", sql`${t.lat} is not null and ${t.lng} is not null`),
  check("intel_cs_verif_ck", sql`${t.verificationStatus} in ('confirmado','nao_verificado','historico','insuficiente')`),
  check("intel_cs_current_ck", sql`${t.currentType} is null or ${t.currentType} in ('AC','DC','AC_DC')`),
  check("intel_cs_power_ck", sql`${t.maxPowerKw} is null or (${t.maxPowerKw} > 0 and ${t.maxPowerKw} <= 1000)`),
  uniqueIndex("intel_cs_src_ext_uq").on(t.sourceKey, t.externalId),
  index("intel_cs_loc_gix").using("gist", t.location),
  index("intel_cs_org_idx").on(t.organizationId),
]);

export const intelChargingConnectors = pgTable("intel_charging_connectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  stationId: uuid("station_id").notNull().references(() => intelChargingStations.id, { onDelete: "cascade" }),
  standard: text("standard"),
  powerKw: doublePrecision("power_kw"),
  currentType: text("current_type"),
  quantity: integer("quantity").notNull().default(1),
});

/** Histórico de correções feitas por usuários autorizados (origem + antes/depois). */
export const intelStationRevisions = pgTable("intel_station_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  stationId: uuid("station_id").notNull().references(() => intelChargingStations.id, { onDelete: "cascade" }),
  changedBy: uuid("changed_by").references(() => users.id),
  reason: text("reason").notNull(),
  evidence: text("evidence"),
  before: jsonb("before").notNull(),
  after: jsonb("after").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------ Imóveis ------------------------------------ */

export const intelProperties = pgTable("intel_properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => intelOrganizations.id),
  name: text("name").notNull(),
  address: text("address"),
  district: text("district"),
  city: text("city"),
  uf: text("uf"),
  zip: text("zip"),
  municipalityCode: integer("municipality_code"),
  ...pointCols(),
  polygon: geometryPolygon("polygon"),
  areaM2: doublePrecision("area_m2"),
  monthlyRent: numeric("monthly_rent", { precision: 14, scale: 2 }),
  salePrice: numeric("sale_price", { precision: 14, scale: 2 }),
  propertyType: text("property_type"),
  occupancy: text("occupancy"),
  parking: boolean("parking"),
  streetAccess: boolean("street_access"),
  mainRoadDistanceM: doublePrecision("main_road_distance_m"),
  destinationsWithin1km: integer("destinations_within_1km"),
  objective: text("objective"),
  businessModel: text("business_model").notNull().default("smart_hub"),
  status: text("status").notNull().default("prospeccao"),
  geocodeSource: text("geocode_source"),
  /** Link do anúncio do imóvel (informado pelo usuário; o sistema não coleta dados de portais). */
  listingUrl: text("listing_url"),
  notes: text("notes"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
}, (t) => [
  check("intel_prop_model_ck", sql`${t.businessModel} in ('smart_hub','b2b')`),
  check("intel_prop_status_ck", sql`${t.status} in ('prospeccao','em_estudo','aprovado','descartado','implantado')`),
  check("intel_prop_values_ck", sql`(${t.areaM2} is null or ${t.areaM2} > 0) and (${t.monthlyRent} is null or ${t.monthlyRent} >= 0) and (${t.salePrice} is null or ${t.salePrice} >= 0)`),
  index("intel_prop_org_idx").on(t.organizationId),
  index("intel_prop_loc_gix").using("gist", t.location),
  index("intel_prop_poly_gix").using("gist", t.polygon),
]);

export const intelPropertyDocuments = pgTable("intel_property_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => intelProperties.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => intelOrganizations.id),
  title: text("title").notNull(),
  kind: text("kind").notNull(),
  reference: text("reference"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------- Indicadores e modelos --------------------------- */

export const intelGeographicIndicators = pgTable("intel_geographic_indicators", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => intelOrganizations.id),
  indicator: text("indicator").notNull(),
  municipalityCode: integer("municipality_code"),
  areaId: uuid("area_id").references(() => intelGeographicAreas.id, { onDelete: "cascade" }),
  ...pointCols(),
  value: doublePrecision("value").notNull(),
  unit: text("unit").notNull(),
  nature: text("nature").notNull(),
  referenceDate: date("reference_date").notNull(),
  resolution: text("resolution").notNull(),
  quality: text("quality").notNull().default("media"),
  method: text("method"),
  sourceKey: text("source_key").notNull().references(() => intelDataSources.key),
  importId: uuid("import_id").references(() => intelDataImports.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("intel_ind_nature_ck", sql`${t.nature} in ('observado','estimado','premissa','simulacao')`),
  check("intel_ind_target_ck", sql`${t.municipalityCode} is not null or ${t.areaId} is not null or ${t.lat} is not null`),
  index("intel_ind_mun_idx").on(t.indicator, t.municipalityCode, t.referenceDate),
  index("intel_ind_loc_gix").using("gist", t.location),
]);

/** Versões de modelos (índice de potencial, demanda). Cada estudo registra a versão usada. */
export const intelModelVersions = pgTable("intel_model_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),
  version: text("version").notNull(),
  config: jsonb("config").notNull(),
  active: boolean("active").notNull().default(false),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("intel_mv_kind_ck", sql`${t.kind} in ('potential_index','demand')`),
  uniqueIndex("intel_mv_kind_version_uq").on(t.kind, t.version),
  uniqueIndex("intel_mv_active_uq").on(t.kind).where(sql`${t.active}`),
]);

export const intelChargerCatalog = pgTable("intel_charger_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => intelOrganizations.id),
  category: text("category"),
  manufacturer: text("manufacturer"),
  model: text("model"),
  powerKw: doublePrecision("power_kw").notNull(),
  currentType: text("current_type").notNull(),
  connectors: text("connectors"),
  efficiency: doublePrecision("efficiency"),
  electricalRequirements: text("electrical_requirements"),
  unitCost: numeric("unit_cost", { precision: 14, scale: 2 }),
  installCost: numeric("install_cost", { precision: 14, scale: 2 }),
  dimensions: text("dimensions"),
  warranty: text("warranty"),
  source: text("source"),
  isGeneric: boolean("is_generic").notNull().default(false),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (t) => [
  check("intel_cat_current_ck", sql`${t.currentType} in ('AC','DC')`),
  check("intel_cat_values_ck", sql`${t.powerKw} > 0 and (${t.efficiency} is null or (${t.efficiency} > 0 and ${t.efficiency} <= 1))`),
]);

export const intelEnergyTariffs = pgTable("intel_energy_tariffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => intelOrganizations.id),
  distributor: text("distributor").notNull(),
  uf: text("uf"),
  modality: text("modality").notNull(),
  pricePerKwh: numeric("price_per_kwh", { precision: 10, scale: 5 }).notNull(),
  demandChargePerKw: numeric("demand_charge_per_kw", { precision: 10, scale: 4 }),
  validFrom: date("valid_from"),
  source: text("source").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------- Estudos ----------------------------------- */

/**
 * Estudo de viabilidade de um imóvel: configuração de infraestrutura, dados elétricos, premissas de demanda
 * (3 cenários) e premissas financeiras. Entradas em JSONB validadas por Zod; resultados persistidos em
 * intel_demand_forecasts (com versão do modelo e parâmetros) para reprodutibilidade.
 */
export const intelStudies = pgTable("intel_studies", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => intelOrganizations.id),
  propertyId: uuid("property_id").notNull().references(() => intelProperties.id),
  name: text("name").notNull(),
  businessModel: text("business_model").notNull().default("smart_hub"),
  status: text("status").notNull().default("em_andamento"),
  chargers: jsonb("chargers").notNull(),
  site: jsonb("site").notNull(),
  electrical: jsonb("electrical").notNull(),
  demand: jsonb("demand").notNull(),
  finance: jsonb("finance").notNull(),
  selectedScenario: text("selected_scenario").notNull().default("base"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  ...timestamps,
}, (t) => [
  check("intel_study_status_ck", sql`${t.status} in ('em_andamento','concluido','arquivado')`),
  check("intel_study_scn_ck", sql`${t.selectedScenario} in ('conservador','base','otimista')`),
  index("intel_study_org_idx").on(t.organizationId),
  index("intel_study_prop_idx").on(t.propertyId),
]);

/** Receitas complementares (seção 8.4) com situação comercial. */
export const intelStudyRevenues = pgTable("intel_study_revenues", {
  id: uuid("id").primaryKey().defaultRandom(),
  studyId: uuid("study_id").notNull().references(() => intelStudies.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => intelOrganizations.id),
  category: text("category").notNull(),
  name: text("name").notNull(),
  commercialModel: text("commercial_model"),
  status: text("status").notNull().default("hipotese"),
  grossMonthly: numeric("gross_monthly", { precision: 14, scale: 2 }).notNull(),
  costsMonthly: numeric("costs_monthly", { precision: 14, scale: 2 }).notNull().default("0"),
  commissionRate: doublePrecision("commission_rate").notNull().default(0),
  taxRate: doublePrecision("tax_rate").notNull().default(0),
  initialInvestment: numeric("initial_investment", { precision: 14, scale: 2 }).notNull().default("0"),
  confidence: text("confidence").notNull().default("baixa"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("intel_rev_status_ck", sql`${t.status} in ('hipotese','negociando','contratado','realizado')`),
  check("intel_rev_rates_ck", sql`${t.commissionRate} >= 0 and ${t.commissionRate} < 1 and ${t.taxRate} >= 0 and ${t.taxRate} < 1`),
]);

/** Previsões geradas (snapshot reprodutível: versão do modelo + parâmetros + resultado). */
export const intelDemandForecasts = pgTable("intel_demand_forecasts", {
  id: uuid("id").primaryKey().defaultRandom(),
  studyId: uuid("study_id").notNull().references(() => intelStudies.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => intelOrganizations.id),
  scenario: text("scenario").notNull(),
  modelVersion: text("model_version").notNull(),
  parameters: jsonb("parameters").notNull(),
  result: jsonb("result").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("intel_fc_study_idx").on(t.studyId, t.createdAt)]);

/** Compartilhamento autorizado de estudos entre organizações. */
export const intelStudyShares = pgTable("intel_study_shares", {
  studyId: uuid("study_id").notNull().references(() => intelStudies.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => intelOrganizations.id, { onDelete: "cascade" }),
  sharedBy: uuid("shared_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.studyId, t.organizationId] })]);

export const intelReports = pgTable("intel_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => intelOrganizations.id),
  studyId: uuid("study_id").references(() => intelStudies.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  format: text("format").notNull(),
  nature: text("nature").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Operação real dos hubs próprios (para calibração do modelo). */
export const intelHubObservations = pgTable("intel_hub_observations", {
  organizationId: uuid("organization_id").notNull().references(() => intelOrganizations.id),
  propertyId: uuid("property_id").notNull().references(() => intelProperties.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  sessions: integer("sessions").notNull(),
  energyKwh: doublePrecision("energy_kwh").notNull(),
  importId: uuid("import_id").references(() => intelDataImports.id, { onDelete: "set null" }),
}, (t) => [
  primaryKey({ columns: [t.propertyId, t.date] }),
  check("intel_obs_values_ck", sql`${t.sessions} >= 0 and ${t.energyKwh} >= 0`),
]);
