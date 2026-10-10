import React, { useEffect, useRef } from 'react';

// Soft blurred lights behind the editor panel that drift after the pointer
// (white-card design): three radial gradients, each following with its own
// delay. Positions are written straight to the elements, so moving the
// pointer does not re-render the editor.

type Glow = {
  w: number;
  h: number;
  // Offset from the point the light follows.
  dx: (x: number, y: number, active: boolean) => number;
  dy: (x: number, y: number, active: boolean) => number;
  style: React.CSSProperties;
};

const REST = { x: 690, y: 40 };

const GLOWS: Glow[] = [
  {
    w: 1300,
    h: 900,
    dx: () => 0,
    dy: () => -120,
    style: {
      background:
        'radial-gradient(closest-side, rgba(70, 112, 210, 0.42), rgba(70, 112, 210, 0.16) 55%, rgba(70, 112, 210, 0) 100%)',
      filter: 'blur(80px)',
      transition: 'transform 1.6s cubic-bezier(0.2, 0.7, 0.2, 1)',
    },
  },
  {
    w: 760,
    h: 560,
    dx: () => 0,
    dy: () => 0,
    style: {
      background:
        'radial-gradient(closest-side, rgba(130, 168, 245, 0.5), rgba(130, 168, 245, 0) 100%)',
      filter: 'blur(64px)',
      transition: 'transform 0.8s cubic-bezier(0.2, 0.7, 0.2, 1)',
    },
  },
  {
    w: 900,
    h: 640,
    dx: (x, _, active) => (active ? (REST.x - x) * 0.6 + 220 : 380),
    dy: (_, y, active) => (active ? (300 - y) * 0.4 + 120 : 260),
    style: {
      background:
        'radial-gradient(closest-side, rgba(160, 140, 235, 0.28), rgba(160, 140, 235, 0) 100%)',
      filter: 'blur(90px)',
      transition: 'transform 2.4s cubic-bezier(0.2, 0.7, 0.2, 1)',
    },
  },
];

const transformOf = (g: Glow, x: number, y: number, active: boolean) =>
  `translate(${Math.round(x - g.w / 2 + g.dx(x, y, active))}px, ${Math.round(
    y - g.h / 2 + g.dy(x, y, active)
  )}px)`;

export default function PanelGlow() {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const panel = anchor.current?.parentElement;
    if (!panel) return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let point: { x: number; y: number } | null = null;
    const place = () => {
      frame = 0;
      const p = point || REST;
      GLOWS.forEach((g, i) => {
        const el = refs.current[i];
        if (el) el.style.transform = transformOf(g, p.x, p.y, !!point);
      });
    };
    const onMove = (e: MouseEvent) => {
      const r = panel.getBoundingClientRect();
      point = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (!frame) frame = requestAnimationFrame(place);
    };
    const onLeave = () => {
      point = null;
      if (!frame) frame = requestAnimationFrame(place);
    };
    if (!reduced) {
      panel.addEventListener('mousemove', onMove);
      panel.addEventListener('mouseleave', onLeave);
    }
    return () => {
      panel.removeEventListener('mousemove', onMove);
      panel.removeEventListener('mouseleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <span ref={anchor} hidden />
      {GLOWS.map((g, i) => (
        <div
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          aria-hidden="true"
          className="mx-glow"
          style={{
            ...g.style,
            width: g.w,
            height: g.h,
            transform: transformOf(g, REST.x, REST.y, false),
          }}
        />
      ))}
    </>
  );
}
