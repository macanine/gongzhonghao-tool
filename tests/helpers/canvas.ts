/**
 * 假的 2D 画布上下文。
 *
 * 只为排版测试服务：按字号估算文字宽度、记录每次绘制调用，
 * 并且在文字越出画布时直接抛错——「排不下」是最需要被测出来的问题。
 */

export interface TextCall {
  type: 'text';
  text: string;
  x: number;
  y: number;
  size: number;
}

export interface RectCall {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: unknown;
}

export interface ArcCall {
  type: 'arc';
  x: number;
  y: number;
  radius: number;
  fill: string;
}

export type DrawCall = TextCall | RectCall | ArcCall;

export interface Gradient {
  stops: string[];
  addColorStop(offset: number, color: string): void;
}

export interface StubContext {
  ctx: CanvasRenderingContext2D;
  calls: DrawCall[];
  gradients: Gradient[];
  /** 按基线 y 归并成「行」。列同基线时会合并，所以用 includes 断言。 */
  lines(): { y: number; size: number; text: string }[];
  texts(): TextCall[];
}

const round = (value: number) => Math.round(value * 10) / 10;

export function createStubContext(
  width: number,
  height: number,
  limits: { width: number; height: number } = { width, height },
): StubContext {
  const calls: DrawCall[] = [];
  const gradients: Gradient[] = [];
  let font = '400 16px sans-serif';
  let fillStyle: unknown = '#000';

  const fontSize = () => Number((font.match(/(\d+(?:\.\d+)?)px/) ?? [0, 16])[1]);
  const measure = (text: string) => {
    let value = 0;
    for (const char of String(text)) {
      // 拉丁/数字按 0.55em，汉字按 1em；粗体略宽。
      value += (/[\x00-\xff]/.test(char) ? 0.55 : 1) * fontSize();
    }
    return value * (font.includes('700') ? 1.04 : 1);
  };

  const ctx = {
    canvas: { width, height },
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    get font() {
      return font;
    },
    set font(value: string) {
      font = value;
    },
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: unknown) {
      fillStyle = value;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ type: 'rect', x, y, width: w, height: h, fill: fillStyle });
    },
    fillText(text: string, x: number, y: number) {
      const textWidth = measure(text);
      calls.push({ type: 'text', text, x, y, size: fontSize() });
      if (x < -0.5 || x + textWidth > limits.width + 0.5) {
        throw new Error(
          `「${text}」横向越界：${round(x)} → ${round(x + textWidth)}（画布宽 ${limits.width}）`,
        );
      }
      if (y < -0.5 || y > limits.height + 0.5) {
        throw new Error(`「${text}」纵向越界：y=${round(y)}（画布高 ${limits.height}）`);
      }
    },
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    stroke() {},
    rect() {},
    roundRect() {},
    translate() {},
    rotate() {},
    drawImage() {},
    arc(x: number, y: number, radius: number) {
      calls.push({ type: 'arc', x, y, radius, fill: String(fillStyle) });
    },
    fill() {},
    createLinearGradient() {
      const gradient: Gradient = {
        stops: [],
        addColorStop(_offset: number, color: string) {
          gradient.stops.push(color);
        },
      };
      gradients.push(gradient);
      return gradient;
    },
    createRadialGradient() {
      const gradient: Gradient = {
        stops: [],
        addColorStop(_offset: number, color: string) {
          gradient.stops.push(color);
        },
      };
      gradients.push(gradient);
      return gradient;
    },
    measureText: (text: string) => ({ width: measure(text) }),
  } as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    calls,
    gradients,
    texts: () => calls.filter((call): call is TextCall => call.type === 'text'),
    lines() {
      const rows = new Map<number, { y: number; size: number; text: string }>();
      for (const call of calls) {
        if (call.type !== 'text') continue;
        const key = Math.round(call.y);
        const row = rows.get(key) ?? { y: call.y, size: call.size, text: '' };
        row.text += call.text;
        rows.set(key, row);
      }
      return [...rows.values()].sort((a, b) => a.y - b.y);
    },
  };
}
