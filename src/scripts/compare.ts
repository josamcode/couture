// The comparison slider. The native range input is the source of truth:
// keyboard and assistive tech talk to it directly; pointer drags write into it.
import { gsap } from 'gsap';
import { DUR, EASE } from '../data/motion';
import { prefersReducedMotion } from './state';

const clamp = (v: number) => Math.min(100, Math.max(0, v));

interface CompareApi {
  frame: HTMLElement;
  stopSweep(): void;
  sweep(): void;
}

let sweepDone = false;

function setup(frame: HTMLElement): CompareApi | null {
  const range = frame.querySelector<HTMLInputElement>('[data-compare-range]');
  if (!range) return null;
  const start = Number(frame.dataset.start ?? range.value) || 52;

  let rect: DOMRect | null = null;
  let pending: number | null = null;
  let raf = 0;
  let sweepTl: gsap.core.Timeline | null = null;

  /** Paint a position (may be fractional while dragging). */
  const paint = (v: number) => frame.style.setProperty('--pos', String(Math.round(clamp(v) * 100) / 100));
  /** Paint AND store in the input, so the input value always matches what is on screen at rest. */
  const commit = (v: number) => {
    const r = Math.round(clamp(v));
    range.value = String(r);
    range.setAttribute('aria-valuetext', `Divider at ${r} percent`);
    paint(r);
  };

  const stopSweep = () => {
    if (!sweepTl) return;
    sweepTl.kill();
    sweepTl = null;
  };

  // Keyboard / assistive tech: the input moved itself, mirror it.
  range.addEventListener('input', () => {
    stopSweep();
    commit(Number(range.value));
  });

  // ----- Pointer dragging (mouse, pen, touch) -----
  let active = false; // a pointer is down on the frame
  let dragging = false; // ... and we have decided it is a horizontal drag
  let startX = 0;
  let startY = 0;

  const toPos = (clientX: number) => (rect ? ((clientX - rect.left) / rect.width) * 100 : start);
  const schedule = (v: number) => {
    pending = v;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (pending !== null) paint(pending);
    });
  };
  const beginDrag = (e: PointerEvent) => {
    dragging = true;
    frame.setPointerCapture(e.pointerId);
    frame.classList.add('is-dragging');
  };
  const end = (e: PointerEvent) => {
    if (!active) return;
    active = false;
    if (dragging) {
      dragging = false;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      commit(pending ?? Number(range.value));
      pending = null;
      if (frame.hasPointerCapture(e.pointerId)) frame.releasePointerCapture(e.pointerId);
      frame.classList.remove('is-dragging');
    }
  };

  frame.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    stopSweep();
    rect = frame.getBoundingClientRect();
    active = true;
    startX = e.clientX;
    startY = e.clientY;
    if (e.pointerType !== 'touch') {
      // Mouse and pen: the divider jumps to the pointer and follows it.
      beginDrag(e);
      schedule(toPos(e.clientX));
    }
  });
  frame.addEventListener('pointermove', (e) => {
    if (!active) return;
    if (!dragging) {
      // Touch: only take over once the finger clearly moves sideways.
      // (touch-action: pan-y lets the browser keep vertical scrolling; it cancels the pointer if it does.)
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx < 6 || dx < dy) return;
      beginDrag(e);
    }
    schedule(toPos(e.clientX));
  });
  frame.addEventListener('pointerup', end);
  frame.addEventListener('pointercancel', end);
  frame.addEventListener('lostpointercapture', end);
  // Images inside must never start a native drag.
  frame.addEventListener('dragstart', (e) => e.preventDefault());

  /** One slow "show me" sweep that teaches the frame can be dragged. */
  const sweep = () => {
    if (sweepDone || prefersReducedMotion()) return;
    sweepDone = true;
    const proxy = { v: Number(range.value) };
    sweepTl = gsap
      .timeline({
        defaults: { ease: EASE.inOut, onUpdate: () => paint(proxy.v) },
        onComplete: () => {
          sweepTl = null;
          commit(start);
        },
      })
      .to(proxy, { v: 75, duration: DUR.base })
      .to(proxy, { v: 30, duration: DUR.slow })
      .to(proxy, { v: start, duration: DUR.base });
  };

  commit(Number(range.value));
  return { frame, stopSweep, sweep };
}

export function initCompare() {
  const apis = [...document.querySelectorAll<HTMLElement>('[data-compare]')]
    .map(setup)
    .filter((a): a is CompareApi => a !== null);
  if (!apis.length || prefersReducedMotion()) return;

  // The first time a (visible) frame is mostly on screen, run the sweep once for the whole page.
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const api = apis.find((a) => a.frame === entry.target);
        io.disconnect();
        // let the frame settle on screen for a beat before moving
        gsap.delayedCall(DUR.fast, () => api?.sweep());
        break;
      }
    },
    { threshold: 0.6 },
  );
  apis.forEach((a) => io.observe(a.frame));
}
