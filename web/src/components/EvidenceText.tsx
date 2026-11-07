import {useId,useState,type ReactNode} from 'react';
import {EvidenceTooltip,type EvidenceTooltipProps} from './EvidenceTooltip';
/** A focusable text detail for evidence that cannot fit into the visible table cell. */
export function EvidenceText({children,className='',...evidence}:Omit<EvidenceTooltipProps,'id'|'anchor'> & {children:ReactNode;className?:string}) {
  const id=useId();
  const [hover,setHover]=useState<HTMLElement|null>(null),[focus,setFocus]=useState<HTMLElement|null>(null);
  const anchor=hover||focus;
  return <><span className={className} tabIndex={0} aria-describedby={anchor?id:undefined} onMouseEnter={event=>setHover(event.currentTarget)} onMouseLeave={()=>setHover(null)} onFocus={event=>setFocus(event.currentTarget)} onBlur={()=>setFocus(null)} onKeyDown={event=>{if(event.key==='Escape'){setHover(null);setFocus(null);}}}>{children}</span><EvidenceTooltip id={id} anchor={anchor} {...evidence}/></>;
}
