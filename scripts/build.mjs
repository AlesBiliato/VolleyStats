import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
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

const pdfAssets = [
  [
    "node_modules/jspdf/dist/jspdf.umd.min.js",
    "dist/vendor/jspdf.umd.min.js",
  ],
  [
    "node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js",
    "dist/vendor/jspdf.plugin.autotable.min.js",
  ],
];
await mkdir("dist/vendor", { recursive: true });
for (const [source, destination] of pdfAssets) {
  await cp(source, destination);
}

console.log("Build listo en dist/");
