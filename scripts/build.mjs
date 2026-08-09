import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await build({ entryPoints:["src/app.js"], bundle:true, minify:true, sourcemap:true, outfile:"dist/app.js", target:["es2020"] });
for (const file of ["index.html","styles.css","manifest.webmanifest","app-icon.png"]) await cp(`src/${file}`,`dist/${file}`);
console.log("Moments Planner web assets built.");
