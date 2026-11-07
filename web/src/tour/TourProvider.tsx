import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {Toast} from '../components';
import {identity,clientPath} from '../lib/api';
import {fetchResource,prefetchPage} from '../lib/query';
import {requestAgent,type ChatReply} from '../kira/protocol';
import {chapters as defaultChapters,autoDelay,moveIndex,prepareChapters,type TourChapter,type TourStatus,type TourStep} from './tours';
import {findTourTarget,waitForTarget} from './useTourTarget';
import {TourLayer} from './TourLayer';
import {TutorialMenu} from './TutorialMenu';
import './tour.css';
interface Preferences {auto:boolean;large:boolean;seen:boolean}
interface Entry {chapter:TourChapter;chapterIndex:number;stepIndex:number;step:TourStep}
interface Run {entries:Entry[];index:number;mode:'full'|'chat'|'chapter'}
interface TourContextValue {start:(chapter?:string,mode?:'chat')=>void;stop:()=>void;active:boolean}
const TourContext=createContext<TourContextValue>({start:()=>{},stop:()=>{},active:false});
export const useTour=()=>useContext(TourContext);
function preferences():Preferences{try{return {auto:false,large:false,seen:false,...JSON.parse(localStorage.getItem('kira-tutorial')||'{}')};}catch{return {auto:false,large:false,seen:false};}}
function tutorialButton(){return findTourTarget('tutorial')??document.querySelector<HTMLElement>('[aria-label="Tutorial"]')??findTourTarget('landing-tutorial');}
export function TourProvider({children,chapters=defaultChapters}:{children:ReactNode;chapters?:TourChapter[]}){
 const navigate=useNavigate(),location=useLocation(),navigateRef=useRef(navigate);navigateRef.current=navigate;
 const [prefs,setPrefs]=useState(preferences),[menu,setMenu]=useState(false),[hint,setHint]=useState(false),[run,setRun]=useState<Run|null>(null),[target,setTarget]=useState<HTMLElement|null>(null),[playing,setPlaying]=useState(false),[ready,setReady]=useState(false),[toast,setToast]=useState(false);
 const [question,setQuestion]=useState(''),[answer,setAnswer]=useState<{question:string;reply:ChatReply}|null>(null),[asking,setAsking]=useState(false),[error,setError]=useState('');
 const activeTutorial=useRef<string|null>(null);
 const openedDialogs=useRef(new Set<string>());
 const skipped=useRef(new Set<number>()),direction=useRef<1|-1>(1),anchor=useRef<HTMLElement|null>(null),request=useRef<AbortController|null>(null),startTicket=useRef(0);
 const entry=run?.entries[run.index];
 useEffect(()=>{try{localStorage.setItem('kira-tutorial',JSON.stringify(prefs));}catch{/* Preferences remain usable in this tab. */}},[prefs]);
 useEffect(()=>{if(prefs.seen||run)return;let timer:ReturnType<typeof setTimeout>;const abort=new AbortController();void waitForTarget('tutorial',abort.signal).then(element=>{if(!element||abort.signal.aborted)return;setHint(true);timer=setTimeout(()=>{setHint(false);setPrefs(p=>({...p,seen:true}));},9000);});return()=>{abort.abort();clearTimeout(timer);};},[location.pathname,prefs.seen,!!run]);
 useEffect(()=>{const replay=()=>window.dispatchEvent(new CustomEvent('kira:tutorial-state',{detail:{tutorial:activeTutorial.current}}));window.addEventListener('kira:request-tutorial-state',replay);return()=>window.removeEventListener('kira:request-tutorial-state',replay);},[]);
 const stop=useCallback(()=>{for(const name of openedDialogs.current)findTourTarget(name)?.closest('[role=dialog]')?.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')?.click();openedDialogs.current.clear();startTicket.current++;request.current?.abort();setRun(null);setTarget(null);setReady(false);setPlaying(false);setAsking(false);activeTutorial.current=null;window.dispatchEvent(new CustomEvent('kira:tutorial-state',{detail:{tutorial:null}}));window.dispatchEvent(new CustomEvent('kira:tour-demo',{detail:{mode:null}}));tutorialButton()?.focus({preventScroll:true});requestAnimationFrame(()=>tutorialButton()?.focus({preventScroll:true}));},[]);
 const finish=useCallback(()=>{stop();setToast(true);window.dispatchEvent(new CustomEvent('kira:tour-ended'));},[stop]);
 const start=useCallback(async(chapter='full',mode?:'chat')=>{
  const ticket=++startTicket.current;request.current?.abort();setPlaying(false);setMenu(false);setHint(false);setToast(false);setPrefs(p=>({...p,seen:true}));setAnswer(null);setQuestion('');setError('');setAsking(false);skipped.current.clear();direction.current=1;
  const id=({tour:'full','guided-close':'guided',clients:'landing'} as Record<string,string>)[chapter]??chapter;
  let available=chapters;
  if(chapters===defaultChapters){try{const status=await fetchResource<TourStatus>('/status');available=prepareChapters(status);}catch{/* Generic explanations still work when status cannot be loaded. */}}
  if(ticket!==startTicket.current)return;
  const selected=id==='full'?available:available.filter(item=>item.id===id);if(!selected.length)return;
  const entries=selected.flatMap(item=>item.steps.map((step,stepIndex)=>({chapter:item,chapterIndex:available.findIndex(c=>c.id===item.id),stepIndex,step})));
  setRun({entries,index:0,mode:mode==='chat'?'chat':id==='full'?'full':'chapter'});setPlaying(prefs.auto);
 },[chapters,prefs.auto]);
 const move=useCallback((by:1|-1)=>{if(!run)return;direction.current=by;const index=moveIndex(run.index,by,run.entries.length,skipped.current);if(index<0)return;if(index>=run.entries.length){finish();return;}setRun({...run,index});},[run,finish]);
 useEffect(()=>{
  const open=()=>{anchor.current=tutorialButton();setHint(false);setMenu(true);};
  const begin=(event:Event)=>{const detail=(event as CustomEvent<{chapter?:string;tour?:string;mode?:'chat'}>).detail;void start(detail?.chapter??detail?.tour??'full',detail?.mode);};
  window.addEventListener('kira:open-tutorial-menu',open);window.addEventListener('kira:start-tutorial',begin);window.addEventListener('kira:tutorial',begin);
  return()=>{window.removeEventListener('kira:open-tutorial-menu',open);window.removeEventListener('kira:start-tutorial',begin);window.removeEventListener('kira:tutorial',begin);};
 },[start]);
 useEffect(()=>{
  if(!entry)return;activeTutorial.current=`${entry.chapter.title}, step ${entry.stepIndex+1}: ${entry.step.text}`;window.dispatchEvent(new CustomEvent('kira:tutorial-state',{detail:{tutorial:activeTutorial.current}}));const abort=new AbortController();setReady(false);setTarget(null);setAnswer(null);setQuestion('');setError('');
  void(async()=>{
   const action=entry.step.action;
   if(action?.kind==='close'){const existing=findTourTarget(action.target);existing?.closest('[role=dialog]')?.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')?.click();}
   if(entry.step.route){await prefetchPage(entry.step.route);if(abort.signal.aborted)return;navigateRef.current(clientPath(entry.step.route),{replace:true});await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));if(abort.signal.aborted)return;}
   window.dispatchEvent(new CustomEvent('kira:tour-demo',{detail:{mode:entry.step.demo??null}}));
   if(action&&action.kind!=='close'){
    const element=await waitForTarget(action.target,abort.signal);if(abort.signal.aborted)return;
    if(element){if(action.kind==='open'){const disclosure=element instanceof HTMLDetailsElement?element:element.querySelector('details');if(disclosure)disclosure.open=true;}else if(element.getAttribute('aria-expanded')!=='true'){element.click();if(action.target==='record-compare')openedDialogs.current.add('compare-dialog');}}
   }
   let element=await waitForTarget(entry.step.target,abort.signal);if(abort.signal.aborted)return;
   // Mobile navigation stays accessible: opening the menu is a read-only action.
   if(!element&&['client-menu','main-nav'].includes(entry.step.target)){document.querySelector<HTMLButtonElement>('[aria-label="Toggle navigation"]')?.click();element=await waitForTarget(entry.step.target,abort.signal);}
   if(abort.signal.aborted)return;
   if(!element){skipped.current.add(run!.index);window.dispatchEvent(new CustomEvent('kira:tour-skipped',{detail:{chapter:entry.chapter.id,target:entry.step.target}}));const next=moveIndex(run!.index,direction.current,run!.entries.length,skipped.current);if(next<0||next>=run!.entries.length){finish();return;}setRun(current=>current?{...current,index:next}:null);return;}
   element.scrollIntoView?.({behavior:'instant',block:'center',inline:'nearest'});element.classList.add('tour-target-active');setTarget(element);setReady(true);
  })();
  return()=>{abort.abort();document.querySelectorAll('.tour-target-active').forEach(element=>element.classList.remove('tour-target-active'));};
 },[entry,finish]);
 useEffect(()=>{if(!entry||!playing||!ready||asking||question.trim())return;const timer=setTimeout(()=>move(1),autoDelay(entry.step.text));return()=>clearTimeout(timer);},[entry,playing,ready,asking,question,move]);
 useEffect(()=>{if(!run)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();stop();return;}if(event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable=true]'))return;if(['ArrowRight','Enter','PageDown'].includes(event.key)){event.preventDefault();if(ready&&!asking)move(1);}else if(['ArrowLeft','PageUp'].includes(event.key)){event.preventDefault();if(ready&&!asking)move(-1);}else if(event.key===' '){event.preventDefault();if(!asking)setPlaying(value=>!value);}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[run,ready,asking,move,stop]);
 useEffect(()=>{document.body.classList.toggle('tour-presenting',!!run&&prefs.large);return()=>document.body.classList.remove('tour-presenting');},[!!run,prefs.large]);
 useEffect(()=>()=>{request.current?.abort();},[]);
 async function ask(value:string){
  const text=value.trim();if(!text||!entry||asking)return;setPlaying(false);setQuestion('');setAsking(true);setError('');const abort=new AbortController();request.current=abort;
  const client=identity.client(),user=identity.user(),storage=`kira:chat:${encodeURIComponent(client)}:${encodeURIComponent(user)}`;let session=localStorage.getItem(storage);if(!session){session=crypto.randomUUID?.()??`kira-${Date.now()}`;localStorage.setItem(storage,session);}
  try{const reply=await requestAgent<ChatReply>({baseUrl:'/api',client,user},'/chat',{session_id:session,message:text,context:{page:location.pathname,tutorial:`${entry.chapter.title}, step ${entry.stepIndex+1}: ${entry.step.text}`}},abort.signal);if(abort.signal.aborted)return;setAnswer({question:text,reply});window.dispatchEvent(new CustomEvent('kira:tutorial-exchange',{detail:{client,session_id:session,question:text,reply}}));}
  catch(cause){if(!abort.signal.aborted)setError(cause instanceof Error?cause.message:'Kira could not answer. Try again.');}
  finally{if(!abort.signal.aborted)setAsking(false);}
 }
 return <TourContext.Provider value={{start:(chapter,mode)=>void start(chapter,mode),stop,active:!!run}}>{children}
  {menu&&<TutorialMenu chapters={chapters} anchor={anchor} preferences={prefs} onPreferences={update=>setPrefs(p=>({...p,...update}))} onClose={()=>setMenu(false)} onStart={chapter=>void start(chapter)}/>}
  {hint&&!run&&!menu&&<div className="tour-first-hint" role="status">New here? Take the tutorial: Kira shows you around, and you can ask questions on the way.<button type="button" onClick={()=>void start('full')}>Start</button></div>}
  {run&&entry&&<TourLayer entry={entry} target={target} ready={ready} mode={run.mode} large={prefs.large} playing={playing} progress={(run.index+1)/run.entries.length} first={run.index===0} last={run.index===run.entries.length-1} question={question} answer={answer} asking={asking} error={error} onQuestion={value=>{setQuestion(value);setPlaying(false);}} onAsk={value=>void ask(value)} onPlay={()=>setPlaying(value=>!value)} onBack={()=>move(-1)} onNext={()=>move(1)} onStop={stop} onApprove={()=>{stop();window.dispatchEvent(new CustomEvent('kira:open-chat'));}}/>}
  {toast&&<Toast onClose={()=>setToast(false)}>That's the tutorial. Open Tutorial any time to replay a chapter.</Toast>}
 </TourContext.Provider>;
}
