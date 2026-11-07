import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {useLocation, useNavigate} from 'react-router-dom';
import {ArrowLeft, ArrowRight, MousePointer2, Pause, Play, X} from 'lucide-react';
import {TOUR_STEPS, type TourStep} from './tourSteps';
import './GuidedTour.css';

type Props = {client: string; onExit: () => void; steps?: TourStep[]; onStep?: (step: TourStep) => void};
type Target = {element: HTMLElement | null; waiting: boolean; unavailable: string};
type Rect = {left: number; top: number; width: number; height: number};
const reducedQuery = '(prefers-reduced-motion: reduce)';
const findTarget = (name?: string) => name ? Array.from(document.querySelectorAll<HTMLElement>('[data-tour]')).find(node => {
  if (node.dataset.tour !== name || node.closest('[hidden]')) return false;
  for (let ancestor: HTMLElement | null = node; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}) || null : null;

export default function GuidedTour({client, onExit, steps = TOUR_STEPS, onStep}: Props) {
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(() => window.matchMedia?.(reducedQuery).matches ?? false);
  const [paused, setPaused] = useState(reduced);
  const [target, setTarget] = useState<Target>({element: null, waiting: true, unavailable: ''});
  const [rect, setRect] = useState<Rect | null>(null);
  const [cursor, setCursor] = useState<{left: number; top: number} | null>(null);
  const [viewport, setViewport] = useState({width: window.innerWidth, height: window.innerHeight});
  const [cardHeight, setCardHeight] = useState(300);
  const dialog = useRef<HTMLElement>(null);
  const originalFocus = useRef(document.activeElement as HTMLElement | null);
  const initialClient = useRef(client);
  const callbacks = useRef({onExit, onStep}); callbacks.current = {onExit, onStep};
  const navigate = useNavigate(), location = useLocation();
  const step = steps[Math.min(index, steps.length - 1)];
  const stepPath = new URL(step.path, window.location.origin);
  stepPath.searchParams.set('c', client);
  const path = stepPath.pathname + stepPath.search;
  const atRoute = location.pathname + location.search === path;

  useEffect(() => {
    if (client !== initialClient.current) {callbacks.current.onExit(); return;}
    callbacks.current.onStep?.(step);
    if (!atRoute) navigate(path, {replace: true});
  }, [client, index, path, atRoute, navigate, step]);

  useEffect(() => {
    const media = window.matchMedia?.(reducedQuery);
    if (!media) return;
    const changed = () => {setReduced(media.matches); if (media.matches) setPaused(true);};
    media.addEventListener?.('change', changed);
    return () => media.removeEventListener?.('change', changed);
  }, []);

  useEffect(() => {
    setTarget({element: null, waiting: true, unavailable: ''});
    if (!atRoute) return;
    let allowFallback = false, chosen: HTMLElement | null = null;
    const locate = () => {
      const primary = findTarget(step.target);
      const element = primary || (allowFallback ? findTarget(step.fallback) : null);
      if (!element) {
        if (allowFallback) setTarget({element: null, waiting: false, unavailable: 'This area is not available on the current screen. You can continue the tour or exit and retry after the page loads.'});
        return;
      }
      const unavailable = element.dataset.tourUnavailable || ((element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') ? step.blocked || 'This step is not available yet.' : !primary ? step.fallbackNote || '' : '');
      setTarget(previous => previous.element === element && previous.unavailable === unavailable && !previous.waiting ? previous : {element, waiting: false, unavailable});
      if (chosen !== element) {chosen = element; element.scrollIntoView?.({block: window.innerWidth <= 800 ? 'start' : 'center', inline: 'nearest', behavior: reduced ? 'instant' : 'smooth'});}
    };
    const observer = new MutationObserver(locate);
    observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'data-tour-unavailable']});
    const timeout = window.setTimeout(() => {allowFallback = true; locate();}, 1500);
    locate();
    return () => {observer.disconnect(); clearTimeout(timeout);};
  }, [atRoute, index, step, reduced]);

  useLayoutEffect(() => {
    const measure = () => {
      setViewport({width: window.innerWidth, height: window.innerHeight});
      if (dialog.current) setCardHeight(dialog.current.getBoundingClientRect().height || 300);
      if (!target.element) {setRect(null); return;}
      const bounds = target.element.getBoundingClientRect();
      setRect({left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height});
      setCursor({left: Math.max(12, Math.min(window.innerWidth - 42, bounds.left + Math.min(24, bounds.width / 2))), top: Math.max(12, Math.min(window.innerHeight - 42, bounds.top + Math.min(24, bounds.height / 2)))});
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (target.element) observer?.observe(target.element);
    if (dialog.current) observer?.observe(dialog.current);
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true);
    return () => {observer?.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true);};
  }, [target.element, target.unavailable, index]);

  useEffect(() => {
    if (paused || target.waiting || client !== initialClient.current || index === steps.length - 1) return;
    const timeout = window.setTimeout(() => setIndex(value => Math.min(steps.length - 1, value + 1)), 10000);
    return () => clearTimeout(timeout);
  }, [paused, index, target.waiting, client, steps.length]);

  useLayoutEffect(() => {
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex="0"]') || []);
    dialog.current?.focus({preventScroll: true});
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {event.preventDefault(); event.stopImmediatePropagation(); callbacks.current.onExit();}
      if (event.key !== 'Tab') return;
      const controls = focusable(), first = controls[0], last = controls.at(-1);
      if (!first) {event.preventDefault(); return;}
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {event.preventDefault(); last?.focus();}
      else if (!event.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) {event.preventDefault(); first.focus();}
    };
    const focused = (event: FocusEvent) => {if (event.target instanceof Node && !dialog.current?.contains(event.target)) dialog.current?.focus({preventScroll: true});};
    const visibility = () => {if (document.hidden) setPaused(true);};
    document.addEventListener('keydown', keydown, true); document.addEventListener('focusin', focused); document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('keydown', keydown, true); document.removeEventListener('focusin', focused); document.removeEventListener('visibilitychange', visibility);
      if (originalFocus.current?.isConnected && !originalFocus.current.closest('[hidden]')) originalFocus.current.focus({preventScroll: true});
    };
  }, []);

  const width = Math.min(380, viewport.width - 24);
  const roomRight = rect && viewport.width - rect.left - rect.width > width + 32;
  const roomLeft = rect && rect.left > width + 32;
  const beside = viewport.width >= 900 && (roomRight || roomLeft);
  const cardLeft = beside && rect ? roomRight ? rect.left + rect.width + 20 : rect.left - width - 20 : Math.max(12, viewport.width - width - 24);
  const cardTop = beside && rect ? Math.max(12, Math.min(viewport.height - cardHeight - 12, rect.top)) : Math.max(12, viewport.height - cardHeight - 12);
  const left = rect ? Math.max(4, rect.left - 5) : 0, top = rect ? Math.max(4, rect.top - 5) : 0;
  const highlight = rect ? {left, top, width: Math.max(0, Math.min(viewport.width - 4, rect.left + rect.width + 5) - left), height: Math.max(0, Math.min(viewport.height - 4, rect.top + rect.height + 5) - top)} : null;
  return createPortal(<div className={'guided-tour' + (reduced ? ' is-reduced' : '') + (paused ? ' is-paused' : '')}>
    <svg className="tour-shade" width="100%" height="100%" aria-hidden="true"><defs><mask id="kira-tour-mask"><rect width="100%" height="100%" fill="white"/>{highlight && <rect {...highlight} x={highlight.left} y={highlight.top} rx="10" fill="black"/>}</mask></defs><rect width="100%" height="100%" fill="#122d28" fillOpacity="0.34" mask="url(#kira-tour-mask)"/></svg>
    {highlight && <div className="tour-highlight" style={highlight} aria-hidden="true"/>}
    {cursor && <div className="tour-cursor" style={cursor} aria-hidden="true"><MousePointer2 size={30} fill="currentColor"/></div>}
    <section ref={dialog} className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-description tour-status" tabIndex={-1} style={{width, left: cardLeft, top: cardTop}}>
      <header><span>Kira’s guided tour</span><button type="button" aria-label="Exit tour" onClick={onExit}><X size={18}/></button></header>
      <p className="tour-step-count">Step {index + 1} of {steps.length}</p>
      <p className="tour-sr-only" role="status" aria-live="polite" aria-atomic="true">Step {index + 1} of {steps.length}. {step.title}. {step.body} {target.unavailable}</p>
      <h2 id="tour-title">{step.title}</h2><p id="tour-description">{step.body}</p>
      {target.unavailable && <p className="tour-unavailable">{target.unavailable}</p>}
      <p id="tour-status" className="tour-mode">{target.waiting ? 'Finding this area…' : paused ? 'Paused. Move at your own pace.' : index === steps.length - 1 ? 'Tour complete. Finish when you are ready.' : 'Moves to the next step every 10 seconds.'}</p>
      <div className="tour-controls"><button type="button" disabled={index === 0} onClick={() => setIndex(value => Math.max(0, value - 1))}><ArrowLeft size={15}/>Previous</button><button type="button" onClick={() => setPaused(value => !value)}>{paused ? <Play size={15}/> : <Pause size={15}/>} {paused ? 'Resume' : 'Pause'}</button><button className="tour-next" type="button" onClick={() => index === steps.length - 1 ? onExit() : setIndex(value => value + 1)}>{index === steps.length - 1 ? 'Finish tour' : 'Next'}<ArrowRight size={15}/></button></div>
      <p className="tour-exit-hint"><kbd>Esc</kbd> to exit. Your place will be restored.</p>
    </section>
  </div>, document.body);
}
