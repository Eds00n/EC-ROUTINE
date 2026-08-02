import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const figmaCssPath = join(__dir, "..", "..", "..", "figma", "styles.css");

function scopeLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("/*") || trimmed.startsWith("*")) return line;
  if (trimmed.startsWith("@")) return line;
  if (trimmed.includes("#planTypeFigmaApp")) return line;

  if (/^\.app(\s|\[|\.|:|>|,|\{)/.test(trimmed)) {
    return line.replace(/^(\s*)\.app/, "$1#planTypeFigmaApp.app");
  }

  if (/^\./.test(trimmed)) {
    return line.replace(/^(\s*)/, "$1#planTypeFigmaApp ");
  }

  return line;
}

function scopeCss(input) {
  let css = input.replace(/^\uFEFF/, "");
  css = css.replace(/:root\s*\{/g, "#planTypeFigmaApp {");
  css = css.replace(/^html\s*\{[^}]*\}\s*$/gm, "");
  css = css.replace(/^body\s*\{[^}]*\}\s*$/gm, "");
  css = css.replace(/^img\s*\{/m, "#planTypeFigmaApp img {");

  css = css
    .split("\n")
    .map(scopeLine)
    .join("\n");

  css = css.replace(/^img\s*\{/m, "#planTypeFigmaApp img {");
  css = css.replace(
    /^#planTypeFigmaApp\.app \{\s*\n\s*position: relative;/m,
    "#planTypeFigmaApp.app {\n  /* position fixed on parent block */"
  );

  const header = `/* Scoped from Figma export — regenerate: node lib/plan-type-figma/scope-css.mjs */
#planTypeFigmaApp,
#planTypeFigmaApp.app {
  position: fixed;
  inset: 0;
  z-index: 120;
  width: 100%;
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
  font-family: Inter, sans-serif;
  color: #000;
  background: #fff;
  -webkit-font-smoothing: antialiased;
}

#planTypeFigmaApp[hidden] {
  display: none !important;
}

#planTypeFigmaApp *,
#planTypeFigmaApp *::before,
#planTypeFigmaApp *::after {
  box-sizing: border-box;
}

`;

  return header + css.trim() + "\n";
}

mkdirSync(__dir, { recursive: true });
writeFileSync(join(__dir, "plan-type-figma.css"), scopeCss(readFileSync(figmaCssPath, "utf8")));
console.log("Wrote plan-type-figma.css");
