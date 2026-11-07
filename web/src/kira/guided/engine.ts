import type {Area} from '../../pages/workflow/types';
export const stepNames=['Start','POS files','Settlement files','Bank statements','Convert','Upload rules','Cleaning','Matching stage 1','Matching stage 2','Results'] as const;
export interface GuideSnapshot {files:Record<Area,number>;converted:boolean;upload_rules_pending:string[];cleaning:{open:number;rules_version:number|null};matching:Record<'l1'|'l2',{done:boolean}>;recommendations:{id:string;decision?:string|null}[]}
export type PickedFile={file:File;folder:string};
export function pickedFileKey({file,folder}:PickedFile){return `${folder}/${file.name}:${file.size}`;}
export function resumeStep(state:GuideSnapshot):number {
 const missing=(['pos','settlement','bank'] as const).findIndex(area=>!state.files[area]);if(missing>=0)return missing+1;
 if(!state.converted)return 4;if(state.upload_rules_pending.length)return 5;
 if(state.cleaning.open||state.cleaning.rules_version===null||state.recommendations.length)return 6;
 if(!state.matching.l1.done)return 7;if(!state.matching.l2.done)return 8;return 9;
}
export function guardStep(step:number,state:GuideSnapshot){return Math.min(Math.max(0,step),resumeStep(state));}
export function guideTransition(step:number,event:{type:'refresh'|'pause'|'resume'|'completed'},state:GuideSnapshot){
 if(event.type==='resume')return resumeStep(state);
 if(event.type==='completed')return guardStep(Math.min(9,step+1),state);
 return guardStep(step,state);
}
export function intakeArea(step:number):Area|null {return step>=1&&step<=3?(['pos','settlement','bank'] as const)[step-1]:null;}
export function validateFiles(files:PickedFile[]){
 if(!files.length)return 'Choose at least one file.';
 if(files.some(({file})=>file.size>10*1024*1024))return 'Each file must be 10 MB or smaller.';
 if(files.some(({file})=>! /\.(csv|txt|xlsx|xlsm|pdf)$/i.test(file.name)))return 'Choose CSV, TXT, Excel (.xlsx or .xlsm), or text PDF files.';
 return '';
}
