import {useLayoutEffect,useState} from 'react';
export function findTourTarget(name:string):HTMLElement|null {
 return Array.from(document.querySelectorAll<HTMLElement>('[data-tour]')).find(element=>element.dataset.tour===name&&element.getBoundingClientRect().width>0&&element.getBoundingClientRect().height>0&&!(element.getBoundingClientRect().right<=0||element.getBoundingClientRect().left>=window.innerWidth)&&getComputedStyle(element).visibility!=='hidden')??null;
}
export function waitForTarget(name:string,signal?:AbortSignal,timeout=2000):Promise<HTMLElement|null>{
 return new Promise(resolve=>{let done=false;let timer:ReturnType<typeof setTimeout>;const finish=(element:HTMLElement|null)=>{if(done)return;done=true;observer.disconnect();clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve(element);};const check=()=>{const element=findTourTarget(name);if(element)finish(element);};const abort=()=>finish(null);const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true,attributes:true});timer=setTimeout(()=>finish(null),timeout);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();else check();});
}
export function useTourTarget(target:HTMLElement|null){
 const [rect,setRect]=useState<DOMRect|null>(null);
 useLayoutEffect(()=>{if(!target){setRect(null);return;}const update=()=>setRect(target.getBoundingClientRect());update();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(update);observer?.observe(target);window.addEventListener('resize',update);window.addEventListener('scroll',update,true);return()=>{observer?.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};},[target]);
 return rect;
}
