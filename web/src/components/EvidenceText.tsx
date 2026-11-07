import {useId,useState,type ReactNode} from 'react';
import {EvidenceTooltip,type EvidenceTooltipProps} from './EvidenceTooltip';
/** A focusable text detail for evidence that cannot fit into the visible table cell. */
export function EvidenceText({children,className='',onActivate,...evidence}:Omit<EvidenceTooltipProps,'id'|'anchor'> & {children:ReactNode;className?:string;onActivate?:(origin:HTMLElement)=>void}) {
  const id=useId();
  const [hover,setHover]=useState<HTMLElement|null>(null),[focus,setFocus]=useState<HTMLElement|null>(null);
  const anchor=hover||focus;
  return <><span className={className} tabIndex={0} role={onActivate?'button':undefined} aria-describedby={anchor?id:undefined} onClick={event=>onActivate?.(event.currentTarget)} onMouseEnter={event=>setHover(event.currentTarget)} onMouseLeave={()=>setHover(null)} onFocus={event=>setFocus(event.currentTarget)} onBlur={()=>setFocus(null)} onKeyDown={event=>{if(event.key==='Escape'){setHover(null);setFocus(null);}if(onActivate&&['Enter',' '].includes(event.key)){event.preventDefault();onActivate(event.currentTarget);}}}>{children}</span><EvidenceTooltip id={id} anchor={anchor} {...evidence}/></>;
}
