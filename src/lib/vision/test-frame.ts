/** A fixed 640x360 picture with a ball-coloured disc, for tests that need frames but no camera. */
export function gradientFrame(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas isn't available");
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, "#345");
  g.addColorStop(1, "#c84");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#e8761c";
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 40, 0, Math.PI * 2);
  ctx.fill();
  return ctx.getImageData(0, 0, width, height);
}
