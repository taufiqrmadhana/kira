import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ChevronLeft,Pause,Play,Send} from 'lucide-react';
import {OverlayPortal,Button} from '../components';
import {KiraMascot} from '../kira/KiraMascot';
import {Markdown} from '../kira/Markdown';
import type {ChatReply} from '../kira/protocol';
import {useReducedMotion} from '../lib/motion';
import {autoDelay,type TourChapter,type TourStep} from './tours';
import {useTourTarget} from './useTourTarget';
interface Props {entry:{chapter:TourChapter;chapterIndex:number;stepIndex:number;step:TourStep};target:HTMLElement|null;ready:boolean;mode:string;large:boolean;playing:boolean;progress:number;first:boolean;last:boolean;question:string;answer:{question:string;reply:ChatReply}|null;asking:boolean;error:string;onQuestion:(value:string)=>void;onAsk:(value:string)=>void;onPlay:()=>void;onBack:()=>void;onNext:()=>void;onStop:()=>void;onApprove:()=>void}
export function TourLayer(props:Props){
 const {entry,target,ready,large,playing,progress}=props,rect=useTourTarget(target),bubble=useRef<HTMLDivElement>(null),reduce=useReducedMotion();
 const [position,setPosition]=useState({left:12,top:12}),[cursor,setCursor]=useState(()=>{const launcher=document.querySelector('[data-tour="kira-launcher"]')?.getBoundingClientRect();return {left:launcher?.left??24,top:launcher?.top??24};});
 useEffect(()=>{if(!rect)return;const move=()=>setCursor({left:rect.left+Math.min(rect.width/2,60),top:rect.top+Math.min(rect.height/2,28)});if(reduce){move();return;}const frame=requestAnimationFrame(move);return()=>cancelAnimationFrame(frame);},[rect,reduce]);
 useLayoutEffect(()=>{if(!rect)return;const place=()=>{const w=Math.min(large?440:360,innerWidth-24),h=Math.min(bubble.current?.getBoundingClientRect().height??360,innerHeight-24);const right=rect.right+18,left=right+w<=innerWidth-12?right:rect.left-w-18>=12?rect.left-w-18:Math.max(12,(innerWidth-w)/2);const preferred=rect.bottom+18+h<=innerHeight-12?rect.bottom+18:rect.top-h-18>=12?rect.top-h-18:rect.top;setPosition({left:Math.max(12,Math.min(left,innerWidth-w-12)),top:Math.max(12,Math.min(preferred,innerHeight-h-12))});};place();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(place);if(bubble.current)observer?.observe(bubble.current);return()=>observer?.disconnect();},[rect,large,props.answer,props.error]);
 useLayoutEffect(()=>{if(ready)bubble.current?.focus({preventScroll:true});},[entry,ready]);
 return <OverlayPortal><div className="tour-layer" data-reduced-motion={reduce} data-large={large} data-tour-chapter={entry.chapter.id} data-tour-step={entry.stepIndex+1}>
  {rect&&ready&&<><div className="tour-spotlight" style={{left:rect.left-6,top:rect.top-6,width:rect.width+12,height:Math.min(rect.height+12,innerHeight*.8)}}/><div className="tour-cursor" aria-hidden="true" style={{left:cursor.left,top:cursor.top}}><svg width="28" height="32" viewBox="0 0 28 32"><path d="M3 2 L3 24 L9 18.5 L13.5 28 L17.5 26.2 L13 17 L21.5 17 Z" fill="var(--color-dark)" stroke="white" strokeWidth="2"/></svg><span><KiraMascot/>Kira</span>{entry.step.action&&<i key={`${entry.chapter.id}-${entry.stepIndex}`} className="tour-ripple"/>}</div></>}
  <div ref={bubble} role="dialog" aria-label="Tutorial step" aria-live="polite" tabIndex={-1} className="tour-bubble" style={{left:position.left,top:position.top,width:large?440:360}}>
   <header><span>{props.mode==='chat'?`Tour: ${entry.chapter.title}`:`Chapter ${entry.chapterIndex+1} of 11: ${entry.chapter.title}`}</span><span>Step {entry.stepIndex+1} of {entry.chapter.steps.length}</span></header>
   <p className="tour-explanation">{entry.step.text}</p>{!ready&&<p role="status" className="tour-waiting">Finding this part of the page…</p>}
   {props.answer&&<div className="tour-answer"><strong>{props.answer.question}</strong><Markdown text={props.answer.reply.reply}/>{props.answer.reply.pending?.length>0&&<><p>I need your OK to change data.</p><Button onClick={props.onApprove}>Open the chat to approve</Button></>}</div>}
   {props.error&&<p role="alert" className="tour-error">{props.error}</p>}
   <form className="tour-ask" onSubmit={event=>{event.preventDefault();props.onAsk(props.question);}}><label className="sr-only" htmlFor="tour-question">Ask Kira about this step</label><input id="tour-question" value={props.question} onFocus={()=>{if(playing)props.onPlay();}} onChange={event=>props.onQuestion(event.target.value)} maxLength={2000} placeholder="Ask Kira about this step" disabled={props.asking}/><button type="submit" aria-label="Send tutorial question" disabled={props.asking||!props.question.trim()}><Send size={16} aria-hidden="true"/></button></form>
   <div className="tour-ask-chips">{['Explain with my data','Why does this matter?'].map(text=><button type="button" key={text} disabled={props.asking} onClick={()=>props.onAsk(text)}>{text}</button>)}</div>{props.asking&&<p role="status">Kira is reading the evidence…</p>}
   <footer><Button variant="quiet" disabled={props.first||!ready||props.asking} onClick={props.onBack}><ChevronLeft size={16}/>Back</Button><Button variant="quiet" aria-label={playing?'Pause tutorial':'Play tutorial'} aria-pressed={playing} onClick={props.onPlay} disabled={props.asking}>{playing?<Pause size={16}/>:<Play size={16}/>}</Button><span/><Button variant="quiet" onClick={props.onStop}>Stop</Button><Button variant="primary" onClick={props.onNext} disabled={!ready||props.asking}>{props.last?'Done':'Next'}</Button></footer>
   <div className="tour-progress" aria-hidden="true"><span key={`${entry.chapter.id}-${entry.stepIndex}-${playing}`} className={playing&&ready?'is-playing':''} style={{width:`${progress*100}%`,animationDuration:`${autoDelay(entry.step.text)}ms`}}/></div>
  </div>
 </div></OverlayPortal>;
}
