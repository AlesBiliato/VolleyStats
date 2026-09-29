import { cp, mkdir } from "node:fs/promises";

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
  "node_modules/jspdf/dist/jspdf.umd.min.js",
  "node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js",
];
for (const file of pdfAssets) {
  await mkdir(`dist/${file.slice(0, file.lastIndexOf("/"))}`, {
    recursive: true,
  });
  await cp(file, `dist/${file}`);
}

console.log("Build listo en dist/");
