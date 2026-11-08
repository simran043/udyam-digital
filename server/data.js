// Loads the synthetic dataset once at startup and builds lookup indexes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./csv.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(here, "..", "data"));

function load(file) {
  return parseCsv(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
}

const splitList = (value, sep) => (value ? value.split(sep).map((s) => s.trim()).filter(Boolean) : []);

export const products = load("product_catalogue.csv").map((p) => ({
  id: p.product_id,
  category: p.category,
  name: p.product_name,
  description: p.description,
  unit: p.unit,
  priceMin: Number(p.price_min_inr_per_month),
  priceMax: Number(p.price_max_inr_per_month),
  setupFee: Number(p.one_time_setup_inr),
  minContractMonths: Number(p.min_contract_months),
  cityTiers: splitList(p.available_city_tiers, ";").map(Number),
  minEmployees: Number(p.min_employees),
  minSites: Number(p.min_sites),
  requiresGstin: p.requires_gstin === "Y",
  requiresOneOf: splitList(p.requires_one_of, "|"),
  installDays: Number(p.typical_install_days),
  segments: splitList(p.target_segments, ";"),
}));
export const productById = new Map(products.map((p) => [p.id, p]));

export const gstinRegistry = new Map(load("mock_gstin_registry.csv").map((r) => [r.gstin, r]));
export const udyamRegistry = new Map(load("mock_udyam_registry.csv").map((r) => [r.udyam_number, r]));

export const leads = load("smb_leads.csv").map((r) => ({
  ...r,
  city_tier: Number(r.city_tier),
  employee_count: Number(r.employee_count),
  num_sites: Number(r.num_sites),
  monthly_telecom_spend_inr: Number(r.monthly_telecom_spend_inr),
  acquisition_cost_inr: Number(r.acquisition_cost_inr),
  customer_follow_up_calls: Number(r.customer_follow_up_calls || 0),
  monthly_bundle_value_inr: r.monthly_bundle_value_inr ? Number(r.monthly_bundle_value_inr) : null,
  days_lead_to_activation: r.days_lead_to_activation ? Number(r.days_lead_to_activation) : null,
  nps_score: r.nps_score ? Number(r.nps_score) : null,
}));

// City -> {tier, state}, learned from the leads file.
export const cities = new Map();
for (const lead of leads) {
  if (!cities.has(lead.city)) cities.set(lead.city, { city: lead.city, tier: lead.city_tier, state: lead.state });
}

export const businessTypes = new Map();
for (const lead of leads) {
  if (!businessTypes.has(lead.business_type)) businessTypes.set(lead.business_type, lead.segment);
}

export const SEGMENT_CODES = {
  "Micro retail & services": "micro",
  "Professional offices": "prof",
  "Small multi-site businesses": "multi",
  "Small manufacturers": "mfg",
};

export const KYC_DIR = path.join(DATA_DIR, "kyc_documents");
