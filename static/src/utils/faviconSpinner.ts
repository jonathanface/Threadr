import { subscribeSaving, getIsSaving } from "../api";

const SIZE = 32;
let originalHref: string | null = null;
let animFrame: number | null = null;
let angle = 0;

const canvas = document.createElement("canvas");
canvas.width = SIZE;
canvas.height = SIZE;
const ctx = canvas.getContext("2d")!;

const getLinkEl = (): HTMLLinkElement | null =>
  document.querySelector('link[rel="icon"]') ??
  document.querySelector('link[rel="shortcut icon"]');

const drawSpinner = () => {
  ctx.clearRect(0, 0, SIZE, SIZE);

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = SIZE / 2 - 3;

  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(120, 120, 120, 0.2)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.stroke();

  // Spinning arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, angle, angle + Math.PI * 1.2);
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.stroke();

  const link = getLinkEl();
  if (link) {
    link.href = canvas.toDataURL("image/png");
  }

  angle += 0.15;
  animFrame = requestAnimationFrame(drawSpinner);
};

const start = () => {
  if (animFrame !== null) return;
  const link = getLinkEl();
  if (link && !originalHref) {
    originalHref = link.href;
  }
  angle = 0;
  drawSpinner();
};

const stop = () => {
  if (animFrame !== null) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
  const link = getLinkEl();
  if (link && originalHref) {
    link.href = originalHref;
  }
};

export const initFaviconSpinner = () => {
  // Capture original on init
  const link = getLinkEl();
  if (link) originalHref = link.href;

  subscribeSaving(() => {
    if (getIsSaving()) {
      start();
    } else {
      stop();
    }
  });
};
