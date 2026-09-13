import type { Backdrop } from '../settings';
import { coverPlacement, hexToRgba } from './kit';

/** 已加载好的背景图，连同它的原始尺寸一起传进来（drawImage 需要）。 */
export interface BackdropImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

/** 渐变方向向量：按角度穿过画布中心，长度覆盖整个对角线。 */
function gradientVector(width: number, height: number, angleDeg: number): [number, number, number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = (Math.cos(rad) * width) / 2;
  const dy = (Math.sin(rad) * height) / 2;
  const cx = width / 2;
  const cy = height / 2;
  return [cx - dx, cy - dy, cx + dx, cy + dy];
}

/** 光晕：暗底上叠几团彩色辉光，最出效果的一种背景。 */
function paintGlow(ctx: CanvasRenderingContext2D, config: Backdrop, width: number, height: number): void {
  ctx.fillStyle = config.colorA;
  ctx.fillRect(0, 0, width, height);

  const span = Math.max(width, height);
  const blobs: [number, number, number, string, number][] = [
    [0.2, 0.1, 0.75, config.accent, 0.5],
    [0.88, 0.26, 0.7, config.colorB, 0.85],
    [0.62, 0.94, 0.8, config.accent, 0.34],
    [0.08, 0.72, 0.6, config.colorB, 0.4],
  ];
  for (const [x, y, radius, color, alpha] of blobs) {
    const cx = width * x;
    const cy = height * y;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, span * radius);
    gradient.addColorStop(0, hexToRgba(color, alpha));
    gradient.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
}

export function paintBackdrop(
  ctx: CanvasRenderingContext2D,
  config: Backdrop,
  width: number,
  height: number,
  image?: BackdropImage | null,
): void {
  if (config.mode === 'image' && image && image.width > 0 && image.height > 0) {
    const fit = coverPlacement(image.width, image.height, width, height);
    ctx.drawImage(image.source, fit.x, fit.y, fit.width, fit.height);
    const dim = Math.min(100, Math.max(0, Number(config.dim) || 0)) / 100;
    if (dim > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${dim})`;
      ctx.fillRect(0, 0, width, height);
    }
    return;
  }

  if (config.mode === 'glow') {
    paintGlow(ctx, config, width, height);
    return;
  }

  if (config.mode === 'gradient') {
    const [x0, y0, x1, y1] = gradientVector(width, height, config.angle);
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, config.colorA);
    gradient.addColorStop(1, config.colorB);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  ctx.fillStyle = config.colorA;
  ctx.fillRect(0, 0, width, height);
}

/** 右上角一团极淡的强调色，避免大面积纯底色发闷。 */
export function paintDecor(
  ctx: CanvasRenderingContext2D,
  config: Backdrop & { textColor: string },
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = config.accent || config.textColor;
  ctx.beginPath();
  ctx.arc(width * 0.95, height * 0.03, Math.min(width, height) * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
