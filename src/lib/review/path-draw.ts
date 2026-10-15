/** Draws ball paths side by side with the rim at the centre (positions in ball widths from the rim: right, up). Shared by the screens and the on-phone replay test. */
export type ChartLine = { pts: [number, number][]; color: string };

export function drawPathChart(ctx: CanvasRenderingContext2D, W: number, H: number, lines: ChartLine[], marker?: [number, number] | null) {
  const pad = 14;
  const X = (v: number) => pad + ((v + 9) / 18) * (W - 2 * pad), Y = (v: number) => H - pad - ((v + 2) / 13) * (H - 2 * pad);
  ctx.fillStyle = "#12151a"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#252a32"; ctx.lineWidth = 1;
  for (let x = -8; x <= 8; x += 2) { ctx.beginPath(); ctx.moveTo(X(x), pad); ctx.lineTo(X(x), H - pad); ctx.stroke(); }
  for (let y = -2; y <= 10; y += 2) { ctx.beginPath(); ctx.moveTo(pad, Y(y)); ctx.lineTo(W - pad, Y(y)); ctx.stroke(); }
  ctx.strokeStyle = "#ff783c"; ctx.fillStyle = "#ff783c"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(X(-1.1), Y(0)); ctx.lineTo(X(1.1), Y(0)); ctx.stroke();
  ctx.font = "11px system-ui"; ctx.fillText("rim", X(1.4), Y(0) + 4);
  for (const l of lines) {
    if (l.pts.length < 2) continue;
    ctx.strokeStyle = l.color; ctx.fillStyle = l.color; ctx.lineWidth = lines.length > 12 ? 1.4 : 2; ctx.globalAlpha = lines.length > 12 ? 0.55 : 0.95;
    ctx.beginPath(); l.pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke();
    if (lines.length <= 12) l.pts.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(X(x), Y(y), 2, 0, 7); ctx.fill(); });
  }
  ctx.globalAlpha = 1;
  if (marker) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(marker[0]), Y(marker[1]), 7, 0, 7); ctx.stroke(); }
}
