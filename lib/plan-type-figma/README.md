# Plan type picker (Figma export)

Passo 1 do wizard `create.html` — seletor fullscreen Diário / Semanal / Mensal.

## Assets

Card images: `assets/images/{diario,semanal,mensal,tarefa}.svg` (placeholders).

Para PNGs do Figma:

```bash
cd ../figma
set FIGMA_ACCESS_TOKEN=...
node sync-figma.mjs
```

Copie `assets/images/*.png` para `lib/plan-type-figma/assets/images/` e atualize os `src` em `create.html`.

## CSS

Regenerar escopo a partir do export:

```bash
node lib/plan-type-figma/scope-css.mjs
```

## JS

`plan-type-figma.js` — exporta `initPlanTypeFigma()` e `setPlanTypeFigmaVisible()`.
