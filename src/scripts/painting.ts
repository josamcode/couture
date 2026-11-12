// The one WebGL effect on the site: the hero painting dissolves into glowing ivory line-art.
// This module (and OGL with it) is only ever loaded through a dynamic import from scroll.ts.
import { Mesh, Program, Renderer, Texture, Triangle } from 'ogl';

export interface PaintingHandle {
  destroy(): void;
}

const VERTEX = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  // textures are uploaded unflipped (ImageBitmap ignores UNPACK_FLIP_Y in some browsers), so flip here
  vUv = vec2(uv.x, 1.0 - uv.y);
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tPaint;
uniform sampler2D tLine;
uniform float uProgress; // 0 = painting, 1 = line-art
uniform float uTime;
uniform vec2 uRes;       // canvas size in device pixels
varying vec2 vUv;

const vec3 INK = vec3(0.043, 0.043, 0.047);
const vec3 IVORY = vec3(0.957, 0.945, 0.918);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p = p * 2.03 + 17.0;
    a *= 0.5;
  }
  return s / 0.9375;
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;

  vec3 paint = texture2D(tPaint, uv).rgb;
  float line = texture2D(tLine, uv).a;

  // soft halo around the lines: eight taps on a small ring
  vec2 o = 2.6 / uRes;
  float halo =
      texture2D(tLine, uv + vec2( o.x, 0.0)).a + texture2D(tLine, uv + vec2(-o.x, 0.0)).a +
      texture2D(tLine, uv + vec2(0.0,  o.y)).a + texture2D(tLine, uv + vec2(0.0, -o.y)).a +
      texture2D(tLine, uv + o * 0.7071).a + texture2D(tLine, uv - o * 0.7071).a +
      texture2D(tLine, uv + vec2(o.x, -o.y) * 0.7071).a + texture2D(tLine, uv + vec2(-o.x, o.y) * 0.7071).a;
  halo *= 0.125;

  // dissolve field: organic noise with a slight drift from the top of the picture downwards
  float field = fbm(vec2(uv.x * aspect, uv.y) * 3.1) * 0.78 + uv.y * 0.22;
  float t = uProgress * 1.36 - 0.18;
  float m = smoothstep(t - 0.085, t + 0.085, field); // 1 = still painting, 0 = line-art
  float front = 1.0 - abs(m * 2.0 - 1.0);            // a thin band where the two meet

  // line-art side: ink ground, ivory lines with a soft glow that breathes very slightly
  float breathe = 0.93 + 0.07 * sin(uTime * 1.1 + uv.x * 5.0 + uv.y * 3.0);
  vec3 art = INK + IVORY * (line * 0.9 + halo * 0.42) * breathe;

  // painting side: just ahead of the front the paint dims and the drawing starts to show through
  vec3 painted = paint * (1.0 - front * 0.3) + IVORY * line * front * 0.55;

  vec3 col = mix(art, painted, m);
  col += IVORY * front * 0.035;

  // light film grain (a touch more on the dark side)
  float g = hash(uv * uRes + fract(uTime * 0.37) * 91.7) - 0.5;
  col += g * mix(0.05, 0.022, m);

  gl_FragColor = vec4(col, 1.0);
}`;

async function loadBitmap(src: string): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      // decoded off the main thread
      return await createImageBitmap(await res.blob());
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  return img;
}

export async function mountPainting(
  plate: HTMLElement,
  state: { progress: number },
): Promise<PaintingHandle | null> {
  const img = plate.querySelector<HTMLImageElement>('[data-plate-img]');
  const host = plate.querySelector<HTMLElement>('[data-plate-scale]');
  if (!img || !host) return null;

  const canvas = document.createElement('canvas');
  canvas.className = 'plate__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  // Ask for the context ourselves first: if WebGL is not available we leave quietly
  // (OGL would log an error) and the static image stays as it is.
  const attrs: WebGLContextAttributes = {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'default',
  };
  let version: 1 | 2 = 2;
  let probe: RenderingContext | null = null;
  try {
    probe = canvas.getContext('webgl2', attrs);
    if (!probe) {
      version = 1;
      probe = canvas.getContext('webgl', attrs);
    }
  } catch {
    probe = null;
  }
  if (!probe) return null;

  const dpr = Math.min(window.devicePixelRatio || 1, 2); // never render above 2×
  const renderer = new Renderer({ canvas, dpr, webgl: version, ...attrs, alpha: false, depth: false });
  const gl = renderer.gl;

  const cssWidth = host.clientWidth || 1;
  const lineSrc =
    (cssWidth * dpr > 1400 ? img.dataset.lineartLg : img.dataset.lineartSm) ?? img.dataset.lineartSm;
  if (!lineSrc) return null;
  if (!img.complete) await img.decode().catch(() => undefined);
  const paintSrc = img.currentSrc || img.src;

  let destroyed = false;
  let raf = 0;
  let onScreen = false;
  let ro: ResizeObserver | undefined;
  let io: IntersectionObserver | undefined;

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    ro?.disconnect();
    io?.disconnect();
    document.removeEventListener('visibilitychange', sync);
    canvas.removeEventListener('webglcontextlost', onLost);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
  };
  // If the GPU drops the context, give up gracefully: the image underneath is still there.
  const onLost = (e: Event) => {
    e.preventDefault();
    destroy();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  let bitmaps: [ImageBitmap | HTMLImageElement, ImageBitmap | HTMLImageElement];
  try {
    bitmaps = await Promise.all([loadBitmap(paintSrc), loadBitmap(lineSrc)]);
  } catch {
    destroy();
    return null;
  }
  if (destroyed) return null;

  const texOpts = { generateMipmaps: false, flipY: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR };
  // OGL's types predate ImageBitmap support in texImage2D; the runtime accepts it.
  type TexImage = HTMLImageElement;
  const tPaint = new Texture(gl, { image: bitmaps[0] as TexImage, ...texOpts });
  const tLine = new Texture(gl, { image: bitmaps[1] as TexImage, ...texOpts });

  const program = new Program(gl, {
    vertex: VERTEX,
    fragment: FRAGMENT,
    uniforms: {
      tPaint: { value: tPaint },
      tLine: { value: tLine },
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uRes: { value: [1, 1] },
    },
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

  let lastProgress = -1;
  let lastTick = -1;
  let dirty = true;

  const render = (ms: number) => {
    program.uniforms.uProgress.value = state.progress;
    program.uniforms.uTime.value = ms / 1000;
    renderer.render({ scene: mesh });
  };

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    // OGL writes px sizes inline; let CSS (100% × 100%) own the display size instead
    canvas.style.width = '';
    canvas.style.height = '';
    program.uniforms.uRes.value = [gl.drawingBufferWidth, gl.drawingBufferHeight];
    dirty = true;
  };

  const loop = (ms: number) => {
    raf = requestAnimationFrame(loop);
    const p = state.progress;
    const tick = Math.floor((ms / 1000) * 24); // grain and glow move at film rate, not display rate
    const moving = p !== lastProgress;
    // At rest on the untouched painting there is nothing to animate: draw nothing.
    const alive = p > 0.001 && tick !== lastTick;
    if (!dirty && !moving && !alive) return;
    dirty = false;
    lastProgress = p;
    lastTick = tick;
    render(ms);
  };

  // Render only while the plate is on screen and the tab is visible.
  function sync() {
    const run = onScreen && !document.hidden && !destroyed;
    cancelAnimationFrame(raf);
    if (run) {
      dirty = true;
      raf = requestAnimationFrame(loop);
    }
  }

  host.appendChild(canvas);
  resize();
  render(performance.now());
  // show the canvas only once it holds a frame identical to the image underneath
  requestAnimationFrame(() => canvas.classList.add('is-live'));

  ro = new ResizeObserver(resize);
  ro.observe(host);
  io = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    sync();
  });
  io.observe(host);
  document.addEventListener('visibilitychange', sync);

  return { destroy };
}
