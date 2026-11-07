import {ApiError, identity} from '../../lib/api';
import {invalidateMutation} from '../../lib/query';
import type {Area} from './types';
export type Uploaded = {name:string; status:string; ids:number[]};
/** XMLHttpRequest exposes real upload bytes; fetch does not provide that signal. */
export function uploadFile(area:Area, file:File, folder:string, onProgress:(percent:number)=>void, options:{client?:string;user?:string;origin?:'guided'}={}):Promise<Uploaded[]> {
  const client=options.client??identity.client();
  return new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest();
    request.open('POST',`/api/files/${area}`);request.withCredentials=true;
    request.setRequestHeader('X-Kira-Client',client);request.setRequestHeader('X-Kira-User',options.user??identity.user());
    if(options.origin)request.setRequestHeader('X-Kira-Origin',options.origin);
    request.upload.onprogress=event=>{if(event.lengthComputable && event.total>0)onProgress(Math.min(100,event.loaded/event.total*100));};
    request.onerror=()=>reject(new Error('Upload could not reach KIRA. Check the connection and try again.'));
    request.onabort=()=>reject(new Error('Upload was interrupted. Choose the file again to retry.'));
    request.onload=()=>{
      let result:unknown;try{result=JSON.parse(request.responseText);}catch{reject(new Error('KIRA returned an unreadable upload response. Refresh the files before retrying.'));return;}
      if(request.status<200||request.status>=300){
        const detail=result && typeof result==='object' && 'detail' in result ? String(result.detail) : 'Upload failed. Try again.';
        if(request.status===401&&!['/login','/login.html'].includes(location.pathname))location.assign('/login?next='+encodeURIComponent(location.pathname+location.search));
        reject(new ApiError(request.status,detail));return;
      }
      if(!Array.isArray(result)){reject(new Error('Upload result was incomplete. Refresh the files before retrying.'));return;}
      void invalidateMutation(`/files/${area}`,'POST',client).then(()=>resolve(result as Uploaded[]),reject);
    };
    const body=new FormData();body.set('folder',folder);body.append('uploads',file);request.send(body);
  });
}
