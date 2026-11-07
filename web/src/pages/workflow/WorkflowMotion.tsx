import {useLayoutEffect, useRef, type ReactNode} from 'react';
import {ArrowRight} from 'lucide-react';
import {useAnimatedNumber, useReducedMotion} from '../../lib/motion';
import {count} from '../../lib/format';
import './workflow-motion.css';

export function AnimatedCount({value, enabled=true, suffix=''}: {value:number; enabled?:boolean; suffix?:string}) {
  const animated=useAnimatedNumber(value,{duration:600,enabled});
  return <span className="wf-animated-count"><span className="sr-only">{count(value)}{suffix}</span><span aria-hidden="true">{count(Math.round(animated))}{suffix}</span></span>;
}
export function FlowConnector({active}: {active:boolean}) {
  const reduced=useReducedMotion();
  return <span className="wf-flow-connector" data-active={active} aria-hidden="true"><ArrowRight size={18}/>{active&&!reduced&&[0,1,2].map(index=><i className="wf-flow-dot" key={index} style={{animationDelay:`${index*330}ms`}}/>)}</span>;
}
export function StepTransition({step,children}: {step:number;children:ReactNode}) {
  const ref=useRef<HTMLDivElement>(null);const previous=useRef(step);const reduced=useReducedMotion();
  useLayoutEffect(()=>{
    const direction=step>previous.current?1:-1;const changed=step!==previous.current;previous.current=step;
    if(!changed||reduced||!ref.current?.animate)return;
    const token=getComputedStyle(ref.current).getPropertyValue('--t-base').trim();
    const duration=token.endsWith('ms')?parseFloat(token):token.endsWith('s')?parseFloat(token)*1000:220;
    const animation=ref.current.animate([{opacity:0,transform:`translateX(${direction*16}px)`},{opacity:1,transform:'translateX(0)'}],{duration:Number.isFinite(duration)?duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
    return()=>animation.cancel();
  },[step,reduced]);
  return <div ref={ref} className="wf-step-transition">{children}</div>;
}
