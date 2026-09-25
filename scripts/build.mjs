import { cp, mkdir, writeFile } from "node:fs/promises";
import { loadCloudConfig, renderCloudConfig } from "./cloud-config.mjs";

await mkdir("dist", { recursive: true });
for (const file of [
  "index.html",
  "src",
  "sw.js",
  "icon.svg",
  "manifest.webmanifest",
]) {
  await cp(file, `dist/${file}`, { recursive: true });
}

const vendorAssets = [
  "node_modules/jspdf/dist/jspdf.umd.min.js",
  "node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js",
  "node_modules/@supabase/supabase-js/dist/umd/supabase.js",
];
for (const file of vendorAssets) {
  await mkdir(`dist/${file.slice(0, file.lastIndexOf("/"))}`, {
    recursive: true,
  });
  await cp(file, `dist/${file}`);
}

await writeFile(
  "dist/cloud-config.js",
  renderCloudConfig(await loadCloudConfig()),
);

console.log("Build listo en dist/");
