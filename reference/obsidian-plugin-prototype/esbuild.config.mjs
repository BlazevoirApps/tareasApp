import esbuild from "esbuild";
import process from "node:process";
import builtins from "builtin-modules";
const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"], bundle: true, external: ["obsidian", ...builtins],
  format: "cjs", target: "es2022", outfile: "main.js",
  sourcemap: process.argv.includes("--watch") ? "inline" : false, logLevel: "info"
});
if (process.argv.includes("--watch")) await ctx.watch();
else { await ctx.rebuild(); await ctx.dispose(); }
