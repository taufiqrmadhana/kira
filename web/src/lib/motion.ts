import {useEffect, useRef, useState, type RefObject} from 'react';

export function useReducedMotion() {
  const [media] = useState(() => typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null);
  const [reduce, setReduce] = useState(media?.matches ?? false);
  useEffect(() => {
    const changed = () => setReduce(media?.matches ?? false);
    media?.addEventListener?.('change', changed);
    return () => media?.removeEventListener?.('change', changed);
  }, [media]);
  return reduce;
}

/** Interpolate known results only. Never use this to fabricate job progress. */
export function useAnimatedNumber(value: number, {duration = 600, enabled = true}: {duration?: number; enabled?: boolean} = {}) {
  const reduce = useReducedMotion();
  const target = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState(reduce || !enabled ? target : 0);
  const current = useRef(display);
  useEffect(() => {
    if (reduce || !enabled || duration <= 0) {current.current=target;setDisplay(target);return;}
    const start = performance.now(), from = current.current;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.max(0, Math.min(1, (now-start)/duration));
      current.current = progress === 1 ? target : from + (target-from)*(1-Math.pow(1-progress,3));
      setDisplay(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reduce, duration, enabled]);
  return reduce || !enabled ? target : display;
}

export function useReveal(ref: RefObject<HTMLElement | null>, trigger: string, {x=0,y=8,duration=220}: {x?:number;y?:number;duration?:number} = {}) {
  const reduce=useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const animation=ref.current?.animate?.([
      {opacity:0,transform:`translate(${x}px, ${y}px)`},
      {opacity:1,transform:'translate(0, 0)'},
    ],{duration,easing:'cubic-bezier(.2,.8,.2,1)'});
    return () => animation?.cancel();
  },[trigger,reduce,x,y,duration,ref]);
}

/** Reserve a first-view reveal for this client/page; refetches keep final values. */
export function firstView(key: string) {
  try {const name=`kira:seen:${key}`;if(sessionStorage.getItem(name))return false;sessionStorage.setItem(name,'1');return true;}
  catch {return true;}
}
