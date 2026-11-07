import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './evidence-tooltip.css';

type Rect = { left: number; right: number; top: number; bottom: number };
type Size = { width: number; height: number };
export interface TooltipPosition { left: number; top: number; width: number; maxHeight: number; side: 'above' | 'below' | 'right' | 'left' }
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max));
/** Reserve a 12px gutter around the target; never place the surface over it. */
export function positionTooltip(anchor: Rect, size: Size, viewport: Size): TooltipPosition {
    const edge = 8, gutter = 12, width = Math.min(size.width, viewport.width - edge * 2);
    const height = Math.min(size.height, viewport.height - edge * 2);
    const left = clamp((anchor.left + anchor.right - width) / 2, edge, viewport.width - width - edge);
    const top = clamp((anchor.top + anchor.bottom - height) / 2, edge, viewport.height - height - edge);
    if (anchor.top - gutter - height >= edge) return {left, top: anchor.top - gutter - height, width, maxHeight: height, side: 'above'};
    if (anchor.bottom + gutter + height <= viewport.height - edge) return {left, top: anchor.bottom + gutter, width, maxHeight: height, side: 'below'};
    if (anchor.right + gutter + width <= viewport.width - edge) return {left: anchor.right + gutter, top, width, maxHeight: height, side: 'right'};
    if (anchor.left - gutter - width >= edge) return {left: anchor.left - gutter - width, top, width, maxHeight: height, side: 'left'};
    // Very short/narrow windows: use the larger free vertical region, keeping the target visible.
    const above = Math.max(0, anchor.top - gutter - edge), below = Math.max(0, viewport.height - anchor.bottom - gutter - edge);
    return above > below
        ? {left, top: edge, width, maxHeight: above, side: 'above'}
        : {left, top: anchor.bottom + gutter, width, maxHeight: below, side: 'below'};
}
export interface EvidenceTooltipProps {
    id: string;
    anchor: Element | null;
    title: ReactNode;
    subtitle?: ReactNode;
    rows?: {label: string; value: ReactNode}[];
    flags?: {tone: 'red' | 'amber' | 'green'; text: string}[];
    action?: string;
}
const EMPTY_ROWS: NonNullable<EvidenceTooltipProps['rows']> = [];
const EMPTY_FLAGS: NonNullable<EvidenceTooltipProps['flags']> = [];
export function EvidenceTooltip({id, anchor, title, subtitle, rows = EMPTY_ROWS, flags = EMPTY_FLAGS, action}: EvidenceTooltipProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<TooltipPosition | null>(null);
    useLayoutEffect(() => {
        if (!anchor) { setPosition(null); return; }
        const update = () => {
            if (!ref.current) return;
            const bounds = anchor.getBoundingClientRect();
            // Measure the natural content height, independent of the previous edge constraint.
            const size = {width: Math.min(240, window.innerWidth - 16), height: ref.current.scrollHeight};
            setPosition(positionTooltip(bounds, size, {width: window.innerWidth, height: window.innerHeight}));
        };
        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
        if (ref.current) observer?.observe(ref.current);
        return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); observer?.disconnect(); };
    }, [anchor, title, subtitle, rows, flags]);
    if (!anchor) return null;
    return createPortal(<div ref={ref} role="tooltip" id={id} className="evidence-tooltip" data-side={position?.side} style={{left:position?.left ?? 8,top:position?.top ?? 8,width:position?.width ?? 240,maxHeight:position?.maxHeight,visibility:position?'visible':'hidden'}}>
        <strong className="evidence-tooltip-title">{title}</strong>
        {subtitle && <p className="evidence-tooltip-subtitle">{subtitle}</p>}
        {rows.length > 0 && <dl className="evidence-tooltip-values">{rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>}
        {flags.length > 0 && <ul className="evidence-tooltip-flags">{flags.map((flag,i) => <li key={i}><span className={`evidence-tooltip-dot evidence-tooltip-dot--${flag.tone}`} aria-hidden="true"/>{flag.text}</li>)}</ul>}
        {action && <p className="evidence-tooltip-action">{action}</p>}
    </div>, document.body);
}
