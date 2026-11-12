// The one WebGL effect on the site: you travel into the hero painting and it redraws itself as
// glowing ivory line-art, lit by a candle that follows the pointer, with sparks rising through it.
//
// This file is the page's side of it, and it is small on purpose: it puts a <canvas> over the image,
// hands it to a worker (painting.worker.ts, where OGL and every bit of GPU work live), and then only
// passes numbers along: scroll state, pointer position, size. Nothing here can block scrolling.
// Loaded only through a dynamic import from scroll.ts.
import type { FromWorker, ToWorker } from './painting.worker';

export interface PaintingHandle {
  destroy(): void;
}

export interface PaintingState {
  /** 0 = painting, 1 = line-art */
  progress: number;
  /** 0 → 1: how far we have travelled into the picture */
  zoom: number;
}

export async function mountPainting(plate: HTMLElement, state: PaintingState): Promise<PaintingHandle | null> {
  const img = plate.querySelector<HTMLImageElement>('[data-plate-img]');
  const host = plate.querySelector<HTMLElement>('[data-plate-scale]');
  if (!img || !host) return null;
  // No OffscreenCanvas (older Safari): no effect. The static image simply stays.
  if (typeof Worker === 'undefined' || !('transferControlToOffscreen' in HTMLCanvasElement.prototype)) return null;

  const canvas = document.createElement('canvas');
  canvas.className = 'plate__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  // Pixel ratio. The plate is scaled up on scroll (CSS transform) until it fills the screen, so the
  // buffer is sized for that: what reaches the screen is never denser than 2× (the DPR cap), and the
  // buffer itself never exceeds 3× the plate's resting size. (The worker scales it down further
  // when frames are slow: adaptive quality.)
  const pixelRatio = () => {
    const grow = Math.max(1, Number(plate.dataset.maxScale) || 1);
    return Math.min(Math.min(window.devicePixelRatio || 1, 2) * grow, 3);
  };

  if (!img.complete) await img.decode().catch(() => undefined);
  const paintSrc = new URL(img.currentSrc || img.src, location.href).href;
  const lineRel = (host.clientWidth * pixelRatio() > 1400 ? img.dataset.lineartLg : img.dataset.lineartSm) ?? img.dataset.lineartSm;
  if (!lineRel) return null;
  const lineSrc = new URL(lineRel, location.href).href;

  let worker: Worker;
  let offscreen: OffscreenCanvas;
  try {
    offscreen = canvas.transferControlToOffscreen();
    worker = new Worker(new URL('./painting.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  const send = (msg: ToWorker, transfer: Transferable[] = []) => worker.postMessage(msg, transfer);

  let destroyed = false;
  let raf = 0;
  let onScreen = false;
  let ro: ResizeObserver | undefined;
  let io: IntersectionObserver | undefined;
  let sent = { progress: -1, zoom: -1 };
  let pointer: { x: number; y: number } | null = null;

  // Pass the scroll state (and the pointer) to the worker, at most once per frame, only when it changed.
  const pump = () => {
    raf = requestAnimationFrame(pump);
    if (state.progress !== sent.progress || state.zoom !== sent.zoom) {
      sent = { progress: state.progress, zoom: state.zoom };
      send({ type: 'state', ...sent });
    }
    if (pointer) {
      const r = canvas.getBoundingClientRect();
      if (r.width && r.height) {
        send({
          type: 'light',
          x: Math.min(1.1, Math.max(-0.1, (pointer.x - r.left) / r.width)),
          y: Math.min(1.1, Math.max(-0.1, (pointer.y - r.top) / r.height)),
        });
      }
      pointer = null;
    }
  };
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') pointer = { x: e.clientX, y: e.clientY };
  };

  // Draw only while the plate is on screen and the tab is visible.
  const sync = () => {
    const run = onScreen && !document.hidden && !destroyed;
    cancelAnimationFrame(raf);
    if (run) raf = requestAnimationFrame(pump);
    send({ type: 'run', on: run });
  };

  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    ro?.disconnect();
    io?.disconnect();
    document.removeEventListener('visibilitychange', sync);
    window.removeEventListener('pointermove', onPointer);
    worker.terminate();
    canvas.remove();
  };

  return new Promise<PaintingHandle | null>((resolve) => {
    worker.addEventListener('message', (e: MessageEvent<FromWorker>) => {
      if (e.data.type === 'live') {
        // the canvas now holds a frame identical to the image underneath: show it
        canvas.classList.add('is-live');
        resolve({ destroy });
      } else {
        // no WebGL in the worker, or the GPU dropped the context: the image underneath is still there
        destroy();
        resolve(null);
      }
    });
    worker.addEventListener('error', () => {
      destroy();
      resolve(null);
    });

    host.appendChild(canvas);
    send(
      { type: 'init', canvas: offscreen, paintSrc, lineSrc, width: host.clientWidth, height: host.clientHeight, ratio: pixelRatio() },
      [offscreen],
    );

    ro = new ResizeObserver(() => {
      if (host.clientWidth && host.clientHeight) {
        send({ type: 'size', width: host.clientWidth, height: host.clientHeight, ratio: pixelRatio() });
      }
    });
    ro.observe(host);
    io = new IntersectionObserver((entries) => {
      onScreen = entries.some((en) => en.isIntersecting);
      sync();
    });
    io.observe(host);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pointermove', onPointer, { passive: true });
  });
}
