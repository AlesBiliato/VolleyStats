import { readFile } from "node:fs/promises";

const EMPTY_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_PUBLISHABLE_KEY: "",
};

export function normalizeCloudConfig(source = {}) {
  const url = String(source.SUPABASE_URL || "").trim();
  const publishableKey = String(
    source.SUPABASE_PUBLISHABLE_KEY || "",
  ).trim();
  let validUrl = false;
  try {
    const parsed = new URL(url);
    validUrl = ["http:", "https:"].includes(parsed.protocol);
  } catch {
    validUrl = false;
  }
  return validUrl && publishableKey.startsWith("sb_publishable_")
    ? { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publishableKey }
    : { ...EMPTY_CONFIG };
}

export async function loadCloudConfig() {
  const environment = normalizeCloudConfig(process.env);
  if (environment.SUPABASE_URL) return environment;
  try {
    return normalizeCloudConfig(
      JSON.parse(await readFile("cloud-config.local.json", "utf8")),
    );
  } catch {
    return { ...EMPTY_CONFIG };
  }
}

export function renderCloudConfig(config) {
  return `globalThis.VOLLEYSTATS_CLOUD_CONFIG = Object.freeze(${JSON.stringify(normalizeCloudConfig(config))});\n`;
}
