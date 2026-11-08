import type { ExportData } from "./types";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** JSON embedded in a <script type="application/json"> tag is HTML-parsed text, not JS — the one character that needs escaping to stay inert there is "<", which could otherwise prematurely close the tag (e.g. a play's own text containing "</script"). */
function escapeJsonForScriptTag(json: string): string {
  return json.replace(/</g, "\\u003c");
}

function buildCss(team: ExportData["team"]): string {
  return `
  :root {
    --hl-navy: ${team.navy};
    --hl-gold: ${team.gold};
    --hl-silver: ${team.silver};
    --hl-paper: ${team.paper};
    --hl-stripe: ${team.stripe};
    --hl-ink: #10182b;
    --hl-muted: #5b6475;
    color-scheme: light;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: var(--hl-paper); color: var(--hl-ink); }
  .hl-closebar { background: var(--hl-navy); padding: 10px 16px 0; }
  .hl-close-btn { font-size: 13px; font-weight: 700; color: #fff; background: rgba(255,255,255,0.12); border: none; border-radius: 999px; padding: 7px 14px; cursor: pointer; }
  .hl-header { display: flex; align-items: center; gap: 20px; background: var(--hl-navy); color: #fff; padding: 28px 24px; }
  .hl-logo { width: 68px; height: 68px; flex: none; }
  .hl-title-wrap { flex: 1; min-width: 0; }
  .hl-eyebrow { display: block; font-size: 11px; letter-spacing: 0.14em; color: var(--hl-gold); font-weight: 700; margin-bottom: 4px; }
  .hl-team-name { margin: 0; font-size: clamp(20px, 4vw, 30px); font-weight: 800; letter-spacing: 0.01em; }
  .hl-team-sub { margin: 2px 0 0; font-size: 14px; color: var(--hl-silver); }
  .hl-generated { font-size: 12px; color: var(--hl-silver); white-space: nowrap; align-self: flex-end; }
  .hl-toc { background: #fff; border-bottom: 1px solid var(--hl-stripe); padding: 14px 24px; }
  .hl-toc-label { font-size: 11px; letter-spacing: 0.1em; color: var(--hl-muted); font-weight: 700; display: block; margin-bottom: 8px; }
  .hl-toc-list { display: flex; flex-wrap: wrap; gap: 8px; }
  .hl-toc-link { font-size: 13px; font-weight: 600; color: var(--hl-navy); text-decoration: none; background: var(--hl-stripe); padding: 6px 12px; border-radius: 999px; }
  .hl-toc-link:hover { background: var(--hl-gold); }
  .hl-toc-section { margin-bottom: 10px; }
  .hl-toc-section:last-child { margin-bottom: 0; }
  .hl-toc-section-label { display: block; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--hl-muted); font-weight: 700; margin-bottom: 6px; }
  .hl-section { display: flex; flex-direction: column; gap: 18px; }
  .hl-section-title { margin: 0 0 -4px; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 800; color: var(--hl-navy); padding-bottom: 8px; border-bottom: 2px solid var(--hl-stripe); }
  .hl-filterbar { display: flex; flex-wrap: wrap; gap: 24px; padding: 16px 24px; background: #fff; border-bottom: 1px solid var(--hl-stripe); position: sticky; top: 0; z-index: 5; }
  .hl-chip-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .hl-chip-label { font-size: 11px; letter-spacing: 0.08em; color: var(--hl-muted); font-weight: 700; margin-right: 2px; }
  .hl-chip { font-size: 13px; font-weight: 600; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--hl-stripe); background: #fff; color: var(--hl-ink); cursor: pointer; }
  .hl-chip-active { background: var(--hl-navy); border-color: var(--hl-navy); color: #fff; }
  .hl-cards { display: flex; flex-direction: column; gap: 32px; padding: 20px; max-width: 980px; margin: 0 auto; }
  .hl-card { background: #fff; border: 1px solid var(--hl-stripe); border-radius: 14px; padding: 20px; scroll-margin-top: 64px; }
  .hl-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .hl-card-title { margin: 0; font-size: 20px; font-weight: 800; color: var(--hl-navy); }
  .hl-card-badge { font-size: 12px; font-weight: 700; color: var(--hl-navy); background: var(--hl-gold); padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
  .hl-about { color: var(--hl-muted); font-size: 14px; line-height: 1.5; margin: 10px 0 16px; }
  .hl-card-body { display: flex; gap: 16px; flex-wrap: wrap; }
  .hl-court-wrap { flex: 1 1 320px; min-width: 260px; border-radius: 10px; overflow: hidden; }
  .hl-court { width: 100%; height: auto; display: block; aspect-ratio: auto; }
  .hl-side { flex: 1 1 260px; min-width: 240px; display: flex; flex-direction: column; gap: 10px; }
  .hl-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .hl-btn { font-size: 13px; font-weight: 700; padding: 8px 16px; border-radius: 8px; border: 1px solid var(--hl-stripe); background: #fff; color: var(--hl-ink); cursor: pointer; }
  .hl-btn-primary { background: var(--hl-navy); border-color: var(--hl-navy); color: #fff; min-width: 76px; }
  .hl-speed-row { display: flex; gap: 6px; }
  .hl-speed-btn { padding: 6px 10px; font-size: 12px; }
  .hl-speed-active { background: var(--hl-gold); border-color: var(--hl-gold); }
  .hl-steps { display: flex; flex-wrap: wrap; gap: 6px; }
  .hl-step-chip { width: 30px; height: 30px; border-radius: 999px; border: 1px solid var(--hl-stripe); background: #fff; font-size: 12px; font-weight: 700; cursor: pointer; }
  .hl-step-active { background: var(--hl-navy); border-color: var(--hl-navy); color: #fff; }
  .hl-note { font-size: 13.5px; line-height: 1.5; color: var(--hl-ink); background: var(--hl-paper); border-radius: 8px; padding: 10px 12px; min-height: 42px; margin: 0; }
  .hl-keys { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--hl-stripe); }
  .hl-keys-title { margin: 0 0 8px; font-size: 12px; letter-spacing: 0.08em; color: var(--hl-muted); font-weight: 700; }
  .hl-keys-list { margin: 0; padding-left: 18px; font-size: 13.5px; line-height: 1.6; color: var(--hl-ink); }
  .hl-keys-list li { margin-bottom: 4px; }
  @media (max-width: 560px) {
    .hl-header { flex-wrap: wrap; }
    .hl-generated { order: 3; align-self: flex-start; }
  }
`;
}

export function renderExportHtml(data: ExportData, playerBundleJs: string): string {
  const json = escapeJsonForScriptTag(JSON.stringify(data));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(data.team.name)} — Playbook</title>
<style>${buildCss(data.team)}</style>
</head>
<body>
<div id="playbook-root"></div>
<script id="playbook-data" type="application/json">${json}</script>
<script>${playerBundleJs}</script>
</body>
</html>
`;
}
