// The one WebGL effect, drawn entirely off the main thread.
//
// This worker owns an OffscreenCanvas. Creating the WebGL context, compiling the shader, uploading
// the two textures and drawing every frame all happen here, so none of it can make scrolling stutter.
// The page only sends small messages: the scroll state, the pointer position, the size.
import { Mesh, Program, Renderer, Texture, Triangle } from 'ogl';

export type ToWorker =
  | { type: 'init'; canvas: OffscreenCanvas; paintSrc: string; lineSrc: string; width: number; height: number; ratio: number }
  | { type: 'state'; progress: number; zoom: number }
  | { type: 'light'; x: number; y: number }
  | { type: 'size'; width: number; height: number; ratio: number }
  | { type: 'run'; on: boolean };
export type FromWorker = { type: 'live' } | { type: 'fail' } | { type: 'lost' };

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
uniform float uZoom;     // 0 → 1, travelling into the picture
uniform float uTime;
uniform vec2 uRes;       // canvas size in device pixels
uniform vec2 uLight;     // where the candle is, 0..1 (follows the pointer)
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
  vec2 asp = vec2(aspect, 1.0);

  // Travel into the picture, toward the sitter. The drawing sits a little "closer" than the paint,
  // so the two layers slide against each other as we move: depth.
  vec2 focal = vec2(0.5, 0.36);
  vec2 uvP = focal + (uv - focal) / (1.0 + uZoom * 0.2);
  vec2 uvL = focal + (uv - focal) / (1.0 + uZoom * 0.32);

  // dissolve field (in picture space, so it travels with the image)
  float field = fbm(uvP * asp * 3.1) * 0.78 + uvP.y * 0.22;
  float t = uProgress * 1.36 - 0.18;
  float m = smoothstep(t - 0.085, t + 0.085, field); // 1 = still painting, 0 = line-art
  float front = 1.0 - abs(m * 2.0 - 1.0);            // a thin band where the two meet

  // the picture ripples where it is turning
  vec2 wob = (vec2(noise(uvP * 36.0 + uTime * 0.5), noise(uvP * 36.0 + 7.3 - uTime * 0.5)) - 0.5) * front * 0.012;

  vec3 paint = texture2D(tPaint, uvP + wob).rgb;
  float line = texture2D(tLine, uvL + wob).a;

  // soft halo around the lines: eight taps on a small ring
  vec2 o = 2.6 / uRes;
  float halo =
      texture2D(tLine, uvL + vec2( o.x, 0.0)).a + texture2D(tLine, uvL + vec2(-o.x, 0.0)).a +
      texture2D(tLine, uvL + vec2(0.0,  o.y)).a + texture2D(tLine, uvL + vec2(0.0, -o.y)).a +
      texture2D(tLine, uvL + o * 0.7071).a + texture2D(tLine, uvL - o * 0.7071).a +
      texture2D(tLine, uvL + vec2(o.x, -o.y) * 0.7071).a + texture2D(tLine, uvL + vec2(-o.x, o.y) * 0.7071).a;
  halo *= 0.125;

  // candle-light: once the drawing appears, the room goes dark and the light you carry reveals it
  float dark = smoothstep(0.2, 0.8, uProgress);
  float d = distance(uv * asp, uLight * asp);
  float flicker = 0.95 + 0.05 * sin(uTime * 7.0 + sin(uTime * 2.3) * 2.0);
  float candle = exp(-d * d * 4.6) * flicker;
  float lit = mix(1.0, 0.36 + 1.3 * candle, dark);

  float breathe = 0.93 + 0.07 * sin(uTime * 1.1 + uv.x * 5.0 + uv.y * 3.0);
  vec3 art = INK + IVORY * (line * 0.9 + halo * 0.45) * lit * breathe + IVORY * candle * 0.045 * dark;

  // sparks: motes of light rising through the drawing
  float sparks = 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    vec2 seed = vec2(hash(vec2(fi, 1.7)), hash(vec2(fi, 9.2)));
    float speed = 0.016 + 0.03 * seed.y;
    vec2 p = vec2(seed.x + 0.03 * sin(uTime * 0.5 + fi * 2.1), fract(seed.y * 3.0 - uTime * speed));
    float dd = distance(uv * asp, p * asp);
    float twinkle = 0.55 + 0.45 * sin(uTime * 2.6 + fi * 4.0);
    // fade each spark in and out at the ends of its climb
    float life = smoothstep(0.0, 0.12, p.y) * smoothstep(1.0, 0.8, p.y);
    sparks += (smoothstep(0.009, 0.0, dd) + smoothstep(0.045, 0.0, dd) * 0.14) * twinkle * life;
  }
  art += IVORY * sparks * 0.9;

  // painting side: just ahead of the front the paint dims and the drawing starts to show through
  vec3 painted = paint * (1.0 - front * 0.3) * mix(1.0, 0.86 + 0.3 * candle, dark) + IVORY * line * front * 0.55;

  vec3 col = mix(art, painted, m);
  col += IVORY * front * 0.04;

  // the edges fall away as we go deeper
  float vig = smoothstep(1.3, 0.35, length((uv - 0.5) * vec2(1.0, 1.15)) * 1.6);
  col *= mix(1.0, vig, 0.5 * uZoom);

  // light film grain (a touch more on the dark side)
  float g = hash(uv * uRes + fract(uTime * 0.37) * 91.7) - 0.5;
  col += g * mix(0.05, 0.022, m);

  gl_FragColor = vec4(col, 1.0);
}`;

const post = (msg: FromWorker) => (self as unknown as Worker).postMessage(msg);
const frame = (cb: (ms: number) => void): number =>
  'requestAnimationFrame' in self ? self.requestAnimationFrame(cb) : (setTimeout(() => cb(performance.now()), 16) as unknown as number);
const cancelFrame = (id: number) => ('cancelAnimationFrame' in self ? self.cancelAnimationFrame(id) : clearTimeout(id));

async function bitmap(src: string): Promise<ImageBitmap> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(String(res.status));
  return createImageBitmap(await res.blob());
}

// Adaptive quality: the buffer starts at half resolution and steps up only while frames stay fast;
// if they slow down it steps back and stays there. A strong GPU is at full quality within a
// fraction of a second; a weak one (or software rendering) never gets the heavy buffer.
const QUALITY = [0.3, 0.5, 0.75, 1];

let renderer: Renderer | undefined;
let program: Program | undefined;
let mesh: Mesh | undefined;
let raf = 0;
let running = false;
let dirty = true;
let level = 1;
let ceiling = QUALITY.length - 1;
let fast = 0;
let slow = 0;
let lastFrame = 0;
let lastProgress = -1;
let lastZoom = -1;
const size = { width: 1, height: 1, ratio: 1 };
const state = { progress: 0, zoom: 0 };
const light = { x: 0.5, y: 0.36, tx: 0.5, ty: 0.36, hasPointer: false };

function resize() {
  if (!renderer || !program) return;
  renderer.dpr = size.ratio * QUALITY[level];
  renderer.setSize(size.width, size.height);
  const gl = renderer.gl;
  program.uniforms.uRes.value = [gl.drawingBufferWidth, gl.drawingBufferHeight];
  dirty = true;
}

function pace(ms: number) {
  const dt = ms - lastFrame;
  lastFrame = ms;
  if (dt <= 0 || dt > 400) return; // first frame, or the tab was away
  if (dt > 34) {
    // below ~30 fps: after a few such frames, drop a level and never go above it again
    fast = 0;
    if (++slow >= 3 && level > 0) {
      level -= 1;
      ceiling = level;
      slow = 0;
      resize();
    }
  } else if (dt < 22) {
    slow = 0;
    if (++fast >= 14 && level < ceiling) {
      level += 1;
      fast = 0;
      resize();
    }
  } else {
    fast = 0;
    slow = 0;
  }
}

function render(ms: number) {
  if (!renderer || !program || !mesh) return;
  const time = ms / 1000;
  if (!light.hasPointer) {
    // no pointer (touch): the candle wanders slowly on its own
    light.tx = 0.5 + 0.26 * Math.sin(time * 0.23);
    light.ty = 0.4 + 0.16 * Math.cos(time * 0.31);
  }
  light.x += (light.tx - light.x) * 0.08;
  light.y += (light.ty - light.y) * 0.08;
  program.uniforms.uProgress.value = state.progress;
  program.uniforms.uZoom.value = state.zoom;
  program.uniforms.uTime.value = time;
  program.uniforms.uLight.value = [light.x, light.y];
  renderer.render({ scene: mesh });
}

function loop(ms: number) {
  raf = frame(loop);
  const moving = state.progress !== lastProgress || state.zoom !== lastZoom;
  // Once the drawing is showing, the light, the sparks and the grain are alive: draw every frame.
  // At rest on the untouched painting there is nothing to animate: draw nothing.
  const alive = state.progress > 0.001;
  if (!dirty && !moving && !alive) return;
  dirty = false;
  lastProgress = state.progress;
  lastZoom = state.zoom;
  pace(ms);
  render(ms);
}

function setRunning(on: boolean) {
  if (on === running) return;
  running = on;
  cancelFrame(raf);
  if (on && renderer) {
    dirty = true;
    lastFrame = 0;
    raf = frame(loop);
  }
}

async function init(msg: Extract<ToWorker, { type: 'init' }>) {
  const { canvas } = msg;
  Object.assign(size, { width: msg.width, height: msg.height, ratio: msg.ratio });
  // OGL writes CSS sizes to canvas.style; an OffscreenCanvas has none, so give it somewhere harmless to write
  (canvas as unknown as { style: Record<string, string> }).style = {};

  const attrs: WebGLContextAttributes = {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'default',
  };
  // Ask for the context ourselves first: if WebGL is not available we leave quietly
  // (OGL would log an error) and the page keeps its static image.
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
  if (!probe) return post({ type: 'fail' });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    setRunning(false);
    post({ type: 'lost' });
  });

  try {
    renderer = new Renderer({
      canvas: canvas as unknown as HTMLCanvasElement,
      dpr: size.ratio * QUALITY[level],
      webgl: version,
      ...attrs,
      alpha: false,
      depth: false,
    });
    const gl = renderer.gl;
    const [paint, line] = await Promise.all([bitmap(msg.paintSrc), bitmap(msg.lineSrc)]);
    const texOpts = { generateMipmaps: false, flipY: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR };
    // OGL's types predate ImageBitmap support in texImage2D; the runtime accepts it.
    type TexImage = HTMLImageElement;
    const tPaint = new Texture(gl, { image: paint as unknown as TexImage, ...texOpts });
    const tLine = new Texture(gl, { image: line as unknown as TexImage, ...texOpts });
    program = new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      uniforms: {
        tPaint: { value: tPaint },
        tLine: { value: tLine },
        uProgress: { value: 0 },
        uZoom: { value: 0 },
        uTime: { value: 0 },
        uRes: { value: [1, 1] },
        uLight: { value: [0.5, 0.36] },
      },
      depthTest: false,
      depthWrite: false,
    });
    mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
    resize();
    render(performance.now());
    // tell the page only once a frame identical to the image underneath has been drawn
    frame(() => post({ type: 'live' }));
  } catch {
    post({ type: 'fail' });
  }
}

self.addEventListener('message', (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'init') void init(msg);
  else if (msg.type === 'state') {
    state.progress = msg.progress;
    state.zoom = msg.zoom;
  } else if (msg.type === 'light') {
    light.tx = msg.x;
    light.ty = msg.y;
    light.hasPointer = true;
  } else if (msg.type === 'size') {
    Object.assign(size, { width: msg.width, height: msg.height, ratio: msg.ratio });
    resize();
  } else if (msg.type === 'run') setRunning(msg.on);
});
