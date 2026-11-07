import {useEffect,useRef,useState} from 'react';
import {api,download} from '../../lib/api';
import {queryClient,resourceOptions,useEndpoint} from '../../lib/query';
import type {WorkflowData,Area} from '../../pages/workflow/types';
import {uploadFile} from '../../pages/workflow/upload';
import {guardStep,guideTransition,intakeArea,resumeStep,stepNames,validateFiles,pickedFileKey,type GuideSnapshot,type PickedFile} from './engine';
export interface GuidedMemory {active:boolean;paused:boolean;step:number;follow:boolean;completed:string[]}
const empty:GuidedMemory={active:false,paused:false,step:0,follow:true,completed:[]};
function read(key:string):GuidedMemory{try{return {...empty,...JSON.parse(localStorage.getItem(key)||'{}')};}catch{return empty;}}
export function useGuidedClose(client:string,user:string,initial=false,visible=false){
 const key=`kira:guided:${client}`, [state,setState]=useState<GuidedMemory>(()=>initial?{...read(key),active:true,paused:false,step:0}:read(key));
 const workflow=useEndpoint<WorkflowData>(state.active?'/workflow?rows=5':null,client);
 const status=useEndpoint<GuideSnapshot>(state.active||visible?'/status':null,client);
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[progress,setProgress]=useState<Record<string,{percent?:number;state:string}>>({}),[kept,setKept]=useState<number[]>([]);
 const lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const data=workflow.data;
 const snapshot:GuideSnapshot|undefined=data?{...data.status,matching:data.status.matching as GuideSnapshot['matching'],recommendations:data.cleaning.recommendations}:undefined;
 const step=snapshot?guardStep(state.step,snapshot):state.step;
 const area=intakeArea(step);
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(state));}catch{/* tab state still works */}},[key,state]);
 useEffect(()=>{if(state.active&&!state.paused&&state.follow&&snapshot){const page=step<4?1:step<6?2:step===6?3:4;window.dispatchEvent(new CustomEvent('kira:navigate',{detail:{path:`/workflow?step=${page}`,client}}));}},[state.active,state.paused,state.follow,step,!!snapshot,client]);
 function start(){setState(current=>({...current,active:true,paused:false,step:0,completed:[]}));setError('');setKept([]);}
 function resume(){setState(current=>({...current,active:true,paused:false,step:snapshot?guardStep(current.active?current.step:resumeStep(snapshot),snapshot):current.step}));}
 function pause(){setState(current=>({...current,paused:true}));}
 function finish(){setState(current=>({...current,active:false,paused:false,step:0}));}
 async function refresh(){
  const [next]=await Promise.all([queryClient.fetchQuery({...resourceOptions<WorkflowData>('/workflow?rows=5',client),staleTime:0}),queryClient.fetchQuery({...resourceOptions<GuideSnapshot>('/status',client),staleTime:0})]);
  return {...next.status,matching:next.status.matching as GuideSnapshot['matching'],recommendations:next.cleaning.recommendations};
 }
 const request=<T,>(path:string,body?:unknown,method='POST')=>api<T>(path,{method,headers:{'X-Kira-Client':client,'X-Kira-User':user,'X-Kira-Origin':'guided'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 function advance(summary?:string,nextSnapshot=snapshot){if(!nextSnapshot)return;setState(current=>({...current,step:guideTransition(step,{type:'completed'},nextSnapshot),completed:[...current.completed,summary||`${stepNames[step]} complete`]}));setError('');setProgress({});}
 async function run(label:string,action:()=>Promise<unknown>,advanceAfter=true,summary?:string){
  if(lock.current)return false;lock.current=true;setBusy(label);setError('');
  try{await action();const fresh=await refresh();if(alive.current&&advanceAfter)advance(summary,fresh);return true;}
  catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'The action did not finish. Review the current state and retry.');try{await refresh();}catch{/* preserve original error */}return false;}
  finally{lock.current=false;if(alive.current)setBusy('');}
 }
 async function upload(files:PickedFile[],target:Area=area!){
  const issue=validateFiles(files);if(issue){setError(issue);return;}
  setProgress(current=>({...current,...Object.fromEntries(files.map(pick=>[pickedFileKey(pick),{state:'Waiting'}]))}));
  await run(`Uploading ${files.length} files`,async()=>{
   for(const {file,folder} of files){const uploadKey=pickedFileKey({file,folder});setProgress(current=>({...current,[uploadKey]:{state:'Uploading…'}}));
    try{await uploadFile(target,file,folder,percent=>setProgress(current=>({...current,[uploadKey]:{percent,state:percent===100?'Reading file…':`${Math.round(percent)}% uploaded`}})),{client,user,origin:'guided'});setProgress(current=>({...current,[uploadKey]:{percent:100,state:'Uploaded'}}));}
    catch(cause){setProgress(current=>Object.fromEntries(Object.entries(current).map(([name,value])=>[name,{...value,state:value.state==='Waiting'?'Not uploaded; choose again':name===uploadKey?'Failed; retry':value.state}])));throw cause;}
   }
  },false);
 }
 const wrong=(data?.files||[]).filter(file=>file.type===area&&file.wrong_area&&!kept.includes(file.id));
 return {client,user,exportResults:()=>download('/matching/export','kira-results.csv',client,{'X-Kira-Origin':'guided','X-Kira-User':user}),state,setState,step,area,data,status:status.data,snapshot,busy,error,setError,progress,wrong,workflow,start,resume,pause,finish,advance,run,request,upload,keep:(id:number)=>setKept(ids=>[...ids,id]),toggleFollow:()=>setState(current=>({...current,follow:!current.follow}))};
}
export type GuidedController=ReturnType<typeof useGuidedClose>;
