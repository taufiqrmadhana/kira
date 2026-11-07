import {useRef,useState,type KeyboardEvent} from 'react';
/** Manual activation: arrows move focus; Enter/Space retain each native control's action. */
export function useRovingFocus(keys:string[],{initial,disabled=[]}:{initial?:string;disabled?:string[]}={}) {
  const [focused,setFocused]=useState(initial??keys[0]);
  const nodes=useRef(new Map<string,HTMLElement>());
  const available=keys.filter(key=>!disabled.includes(key));
  const active=available.includes(focused)?focused:initial&&available.includes(initial)?initial:available[0];
  return (key:string)=>({
    tabIndex:key===active?0:-1,
    ref:(node:HTMLElement|null)=>{if(node)nodes.current.set(key,node);else nodes.current.delete(key);},
    onFocus:()=>setFocused(key),
    onKeyDown:(event:KeyboardEvent<HTMLElement>)=>{
      const direction=['ArrowRight','ArrowDown'].includes(event.key)?1:['ArrowLeft','ArrowUp'].includes(event.key)?-1:0;
      if(!direction&&!['Home','End'].includes(event.key)||!available.length)return;
      event.preventDefault();
      const index=event.key==='Home'?0:event.key==='End'?available.length-1:(available.indexOf(key)+direction+available.length)%available.length;
      const next=available[index];setFocused(next);nodes.current.get(next)?.focus();
    },
  });
}
