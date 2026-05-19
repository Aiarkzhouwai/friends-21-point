import { cp, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");

await rm(dist, { force: true, recursive: true });
await mkdir(dist, { recursive: true });

for (const file of ["index.html", "styles.css", "app.js"]) {
  await copyFile(resolve(root, file), resolve(dist, file));
}

await cp(resolve(root, "assets"), resolve(dist, "assets"), { recursive: true });

await writeFile(
  resolve(dist, "README.txt"),
  [
    "Friends 21 Point static preview build.",
    "Deploy this directory as a static site.",
    "Entry file: index.html",
    "",
  ].join("\n"),
);

console.log(`Built static site into ${dist}`);
