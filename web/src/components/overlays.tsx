import {useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import './overlays.css';

function portalRoot() {
  let root=document.querySelector<HTMLElement>('[data-overlay-root]');
  if (!root) {root=document.createElement('div');root.dataset.overlayRoot='';root.className='overlay-root';document.body.append(root);}
  return root;
}

/** All shared overlays use the same body portal, outside clipped page panels. */
export function OverlayPortal({children, layer='surface'}:{children:ReactNode;layer?:'surface'|'notifications'}) {
  if (typeof document==='undefined') return null;
  const root=portalRoot();
  if (layer==='surface') return createPortal(children,root);
  let region=root.querySelector<HTMLElement>('[data-toast-region]');
  if (!region) {region=document.createElement('div');region.dataset.toastRegion='';region.className='overlay-toast-region';root.append(region);}
  return createPortal(children,region);
}

const stack:symbol[]=[];
let modalCount=0;
let background:Array<{element:HTMLElement;inert:string|null;hidden:string|null}>=[];
let oldOverflow='';
function lockBackground() {
  if (modalCount++===0) {
    const root=portalRoot();
    background=Array.from(document.body.children).filter((element):element is HTMLElement=>element instanceof HTMLElement&&element!==root).map(element=>({element,inert:element.getAttribute('inert'),hidden:element.getAttribute('aria-hidden')}));
    for(const {element} of background){element.setAttribute('inert','');element.setAttribute('aria-hidden','true');}
    oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  }
  return ()=>{
    if (--modalCount===0) {
      for(const {element,inert,hidden} of background){if(inert===null)element.removeAttribute('inert');else element.setAttribute('inert',inert);if(hidden===null)element.removeAttribute('aria-hidden');else element.setAttribute('aria-hidden',hidden);}
      background=[];document.body.style.overflow=oldOverflow;
    }
  };
}
function focusable(panel:HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]')).filter(element=>element.tabIndex>=0&&!element.matches(':disabled,[type=hidden]')&&!element.closest('[hidden],[inert],[aria-hidden=true]')&&getComputedStyle(element).display!=='none'&&getComputedStyle(element).visibility!=='hidden');
}
function useOverlay(panel:RefObject<HTMLElement|null>,onClose:()=>void,{modal=false,anchor}:{modal?:boolean;anchor?:RefObject<HTMLElement|null>}={}) {
  const close=useRef(onClose);close.current=onClose;
  useLayoutEffect(()=>{
    const element=panel.current;if(!element)return;
    const trigger=anchor?.current??(document.activeElement instanceof HTMLElement?document.activeElement:null);
    const id=Symbol('overlay');stack.push(id);
    const unlock=modal?lockBackground():()=>{};
    const isTop=()=>stack.at(-1)===id;
    const focusFirst=()=>{(element.querySelector<HTMLElement>('[data-autofocus]')??focusable(element)[0]??element).focus({preventScroll:true});};
    focusFirst();
    const key=(event:KeyboardEvent)=>{
      if(!isTop())return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();return;}
      if(event.key==='Tab'&&modal){const targets=focusable(element);const first=targets[0],last=targets.at(-1);if(!first){event.preventDefault();element.focus();}else if(event.shiftKey&&(document.activeElement===first||document.activeElement===element)){event.preventDefault();last!.focus();}else if(!event.shiftKey&&(document.activeElement===last||!element.contains(document.activeElement))){event.preventDefault();first.focus();}}
    };
    const outside=(event:PointerEvent)=>{if(isTop()&&event.target instanceof Node&&!element.contains(event.target)&&!anchor?.current?.contains(event.target))close.current();};
    const focus=(event:FocusEvent)=>{if(modal&&isTop()&&event.target instanceof Node&&!element.contains(event.target))focusFirst();};
    document.addEventListener('keydown',key,true);document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',focus,true);
    return ()=>{document.removeEventListener('keydown',key,true);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',focus,true);const index=stack.indexOf(id);if(index>=0)stack.splice(index,1);unlock();if(trigger?.isConnected)trigger.focus({preventScroll:true});};
  },[panel,modal,anchor]);
}

export function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
  const panel=useRef<HTMLDivElement>(null);const titleId=useId();useOverlay(panel,onClose,{modal:true});
  return <OverlayPortal><div className="overlay-backdrop"><div ref={panel} className="overlay-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><header><h2 id={titleId}>{title}</h2><button className="button quiet" type="button" aria-label="Close dialog" onClick={onClose}><X size={20} aria-hidden="true"/></button></header>{children}</div></div></OverlayPortal>;
}

interface PopoverProps {label:string;anchorRef:RefObject<HTMLElement|null>;children:ReactNode;onClose:()=>void;align?:'start'|'end';width?:number;role?:'dialog'|'menu'}
export function Popover({label,anchorRef,children,onClose,align='start',width=320,role='dialog'}:PopoverProps) {
  const panel=useRef<HTMLDivElement>(null);const[position,setPosition]=useState({left:12,top:12,width,ready:false});
  useOverlay(panel,onClose,{anchor:anchorRef});
  useLayoutEffect(()=>{
    const place=()=>{const anchor=anchorRef.current?.getBoundingClientRect(),element=panel.current;if(!anchor||!element)return;const w=Math.min(width,Math.max(0,window.innerWidth-24));const h=Math.min(element.getBoundingClientRect().height,window.innerHeight-24);const left=Math.max(12,Math.min(align==='end'?anchor.right-w:anchor.left,window.innerWidth-w-12));const below=anchor.bottom+8;const top=Math.max(12,Math.min(below+h<=window.innerHeight-12?below:anchor.top-h-8,window.innerHeight-h-12));setPosition({left,top,width:w,ready:true});};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(place):null;if(panel.current)observer?.observe(panel.current);if(anchorRef.current)observer?.observe(anchorRef.current);
    return ()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);observer?.disconnect();};
  },[anchorRef,align,width]);
  return <OverlayPortal><div ref={panel} role={role} aria-label={label} className={`overlay-popover ${role==='menu'?'overlay-menu':''}`} tabIndex={-1} style={{left:position.left,top:position.top,width:position.width}}>{children}</div></OverlayPortal>;
}

export interface MenuItem {id:string;label:string;onSelect:()=>void;disabled?:boolean;danger?:boolean}
export function Menu({items,...props}:Omit<PopoverProps,'children'|'role'>&{items:MenuItem[]}) {
  const [active,setActive]=useState(()=>items.find(item=>!item.disabled)?.id);
  const move=(event:React.KeyboardEvent<HTMLButtonElement>)=>{if(event.key==='Tab'){props.onClose();return;}if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const enabled=items.filter(item=>!item.disabled);const index=enabled.findIndex(item=>item.id===event.currentTarget.dataset.menuId);const next=event.key==='Home'?0:event.key==='End'?enabled.length-1:(index+(event.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length;const id=enabled[next]?.id;if(id){setActive(id);event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=menuitem]').forEach(button=>{if(button.dataset.menuId===id)button.focus();});}};
  return <Popover {...props} role="menu">{items.map(item=><button type="button" key={item.id} role="menuitem" data-menu-id={item.id} tabIndex={active===item.id?0:-1} disabled={item.disabled} className={item.danger?'is-danger':''} onFocus={()=>setActive(item.id)} onKeyDown={move} onClick={()=>{item.onSelect();props.onClose();}}>{item.label}</button>)}</Popover>;
}

export function Toast({children,onClose,duration=5000}:{children:ReactNode;onClose:()=>void;duration?:number}) {
  const panel=useRef<HTMLDivElement>(null);const priorFocus=useRef<HTMLElement|null>(null);
  const [hovered,setHovered]=useState(false);const[focused,setFocused]=useState(false);const close=useRef(onClose);close.current=onClose;
  useLayoutEffect(()=>{const element=panel.current;return()=>{if(element?.contains(document.activeElement)&&priorFocus.current?.isConnected)priorFocus.current.focus({preventScroll:true});};},[]);
  useEffect(()=>{if(duration<=0||hovered||focused)return;const timer=window.setTimeout(()=>close.current(),duration);return()=>window.clearTimeout(timer);},[duration,hovered,focused]);
  return <OverlayPortal layer="notifications"><div ref={panel} role="status" aria-live="polite" aria-atomic="true" className="overlay-toast" onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocus={event=>{setFocused(true);if(event.relatedTarget instanceof HTMLElement&&!event.currentTarget.contains(event.relatedTarget))priorFocus.current=event.relatedTarget;}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();}}} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(false);}}>{children}<button type="button" className="button quiet" aria-label="Dismiss notification" onClick={onClose}><X size={16} aria-hidden="true"/></button></div></OverlayPortal>;
}
