import {useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent} from 'react';

type Position = {right: number; bottom: number};
type DockStyle = CSSProperties & {
  '--kira-viewport-height'?: string;
  '--kira-viewport-width'?: string;
};
type Drag = {
  pointerId: number;
  target: HTMLElement;
  x: number;
  y: number;
  start: Position;
  moved: boolean;
};

const DEFAULT_POSITION: Position = {right:24, bottom:16};
const MARGIN = 12;
const DRAG_THRESHOLD = 6;

function releaseCapture(drag: Drag) {
  try { drag.target.releasePointerCapture?.(drag.pointerId); }
  catch { /* The browser may already have released a cancelled pointer. */ }
}

function isInteractiveChild(target: EventTarget, handle: HTMLElement) {
  if (!(target instanceof Element)) return false;
  const control = target.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"])');
  return Boolean(control && control !== handle && handle.contains(control));
}

/** Positions only the floating wrapper; conversation and approval state remain in ChatPanel. */
export function useFloatingDock({enabled, expanded}: {enabled: boolean; expanded: boolean}) {
  const dockRef = useRef<HTMLElement>(null);
  const positionRef = useRef<Position>(DEFAULT_POSITION);
  const [position, setPosition] = useState<Position>(DEFAULT_POSITION);
  const [viewportSize, setViewportSize] = useState<{width: number; height: number} | null>(null);
  const [dragging, setDragging] = useState(false);
  const active = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  const moveTo = useCallback((next: Position) => {
    const rect = dockRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewport = window.visualViewport;
    const visibleLeft = viewport?.offsetLeft ?? 0;
    const visibleTop = viewport?.offsetTop ?? 0;
    const visibleWidth = viewport?.width || window.innerWidth;
    const visibleHeight = viewport?.height || window.innerHeight;
    setViewportSize(previous => previous?.width === visibleWidth && previous.height === visibleHeight
      ? previous : {width:visibleWidth, height:visibleHeight});
    // Fixed right/bottom offsets use the layout viewport. Account for an on-screen
    // keyboard or zoomed visual viewport without hiding the launcher behind it.
    const minRight = Math.max(MARGIN, window.innerWidth - visibleLeft - visibleWidth + MARGIN);
    const minBottom = Math.max(MARGIN, window.innerHeight - visibleTop - visibleHeight + MARGIN);
    const maxRight = Math.max(minRight, window.innerWidth - visibleLeft - rect.width - MARGIN);
    const maxBottom = Math.max(minBottom, window.innerHeight - visibleTop - rect.height - MARGIN);
    const clamped = {
      right:Math.min(maxRight, Math.max(minRight, next.right)),
      bottom:Math.min(maxBottom, Math.max(minBottom, next.bottom)),
    };
    const previous = positionRef.current;
    if (clamped.right === previous.right && clamped.bottom === previous.bottom) return;
    positionRef.current = clamped;
    setPosition(clamped);
  }, []);

  useLayoutEffect(() => {
    // Closing the popup removes its header handle before lostpointercapture can
    // reach React. Clear that gesture here so the surviving launcher can move.
    const drag = active.current;
    active.current = null;
    if (drag) {
      releaseCapture(drag);
      suppressClick.current = false;
      setDragging(false);
    }
    if (enabled) moveTo(positionRef.current);
  }, [enabled, expanded, moveTo]);

  useLayoutEffect(() => {
    if (!enabled) {
      if (active.current) releaseCapture(active.current);
      active.current = null;
      suppressClick.current = false;
      setDragging(false);
      return;
    }
    const reclamp = () => moveTo(positionRef.current);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reclamp);
    if (dockRef.current) observer?.observe(dockRef.current);
    const viewport = window.visualViewport;
    window.addEventListener('resize', reclamp);
    viewport?.addEventListener('resize', reclamp);
    viewport?.addEventListener('scroll', reclamp);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', reclamp);
      viewport?.removeEventListener('resize', reclamp);
      viewport?.removeEventListener('scroll', reclamp);
      const drag = active.current;
      active.current = null;
      if (drag) releaseCapture(drag);
    };
  }, [enabled, moveTo]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!enabled || active.current || event.button !== 0 || event.isPrimary === false
      || isInteractiveChild(event.target, event.currentTarget)) return;
    suppressClick.current = false;
    active.current = {
      pointerId:event.pointerId,
      target:event.currentTarget,
      x:event.clientX,
      y:event.clientY,
      start:positionRef.current,
      moved:false,
    };
    try { event.currentTarget.setPointerCapture?.(event.pointerId); }
    catch { /* A pointer that ended before dispatch cannot be captured. */ }
  }, [enabled]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const drag = active.current;
    if (!enabled || !drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!drag.moved) {
      drag.moved = true;
      suppressClick.current = true;
      setDragging(true);
    }
    event.preventDefault();
    moveTo({right:drag.start.right - dx, bottom:drag.start.bottom - dy});
  }, [enabled, moveTo]);

  const finishPointer = useCallback((event: PointerEvent<HTMLElement>, cancelled = false) => {
    const drag = active.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    active.current = null;
    if (cancelled) suppressClick.current = false;
    setDragging(false);
    releaseCapture(drag);
  }, []);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (!enabled || event.target !== event.currentTarget) return;
    // Keyboard activation must never inherit suppression from a pointer gesture
    // whose browser did not dispatch a click (for example, lost capture).
    suppressClick.current = false;
    const step = event.shiftKey ? 48 : 16;
    const next = {...positionRef.current};
    switch (event.key) {
      case 'ArrowLeft': next.right += step; break;
      case 'ArrowRight': next.right -= step; break;
      case 'ArrowUp': next.bottom += step; break;
      case 'ArrowDown': next.bottom -= step; break;
      case 'Home': Object.assign(next, DEFAULT_POSITION); break;
      default: return;
    }
    event.preventDefault();
    moveTo(next);
  }, [enabled, moveTo]);

  const consumeDragClick = useCallback(() => {
    const suppressed = suppressClick.current;
    suppressClick.current = false;
    return suppressed;
  }, []);

  const style: DockStyle = enabled ? {
    right:position.right,
    bottom:position.bottom,
    ...(viewportSize ? {
      '--kira-viewport-height':`${viewportSize.height}px`,
      '--kira-viewport-width':`${viewportSize.width}px`,
    } : {}),
  } : {};
  return {
    dockRef,
    style,
    dragging,
    consumeDragClick,
    dragProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp:(event: PointerEvent<HTMLElement>) => finishPointer(event),
      onPointerCancel:(event: PointerEvent<HTMLElement>) => finishPointer(event, true),
      onLostPointerCapture:(event: PointerEvent<HTMLElement>) => finishPointer(event),
      onKeyDown,
    },
  };
}
