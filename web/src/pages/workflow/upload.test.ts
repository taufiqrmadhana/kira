import {afterEach, expect, it, vi} from 'vitest';
import {uploadFile} from './upload';
import {invalidateMutation} from '../../lib/query';
vi.mock('../../lib/query',()=>({invalidateMutation:vi.fn(async()=>{})}));
class Request {
  static latest:Request;
  upload={onprogress:null as null|((event:ProgressEvent)=>void)};
  onload:null|(()=>void)=null;onerror:null|(()=>void)=null;onabort:null|(()=>void)=null;
  status=200;responseText='[{"name":"pos.csv","status":"added","ids":[1]}]';
  open=vi.fn();setRequestHeader=vi.fn();send=vi.fn();withCredentials=false;
  constructor(){Request.latest=this;}
}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();localStorage.clear();});
it('reports only real byte progress, preserves folder and invalidates after confirmed upload',async()=>{
  vi.stubGlobal('XMLHttpRequest',Request);localStorage.setItem('kira-client','demo');localStorage.setItem('kira-user','Taufiq');
  const progress=vi.fn();const file=new File(['sales'],'pos.csv');
  const promise=uploadFile('pos',file,'week/day1',progress);
  const req=Request.latest;
  expect(req.open).toHaveBeenCalledWith('POST','/api/files/pos');
  expect(req.setRequestHeader).toHaveBeenCalledWith('X-Kira-Client','demo');
  const body=req.send.mock.calls[0][0] as FormData;expect(body.get('folder')).toBe('week/day1');expect(body.get('uploads')).toBe(file);
  expect(progress).not.toHaveBeenCalled();expect(invalidateMutation).not.toHaveBeenCalled();
  req.upload.onprogress?.({lengthComputable:true,loaded:20,total:100} as ProgressEvent);
  expect(progress).toHaveBeenLastCalledWith(20);
  req.upload.onprogress?.({lengthComputable:false,loaded:40,total:0} as ProgressEvent);
  expect(progress).toHaveBeenCalledTimes(1);
  req.onload?.();await expect(promise).resolves.toEqual([{name:'pos.csv',status:'added',ids:[1]}]);
  expect(invalidateMutation).toHaveBeenCalledWith('/files/pos','POST','demo');
});
it('rejects a failed upload without invalidating data or inventing completion',async()=>{
  vi.stubGlobal('XMLHttpRequest',Request);const progress=vi.fn();const result=uploadFile('bank',new File(['x'],'bad.csv'),'',progress);
  Request.latest.status=409;Request.latest.responseText='{"detail":"Convert is running; retry afterward."}';Request.latest.onload?.();
  await expect(result).rejects.toThrow('Convert is running');expect(invalidateMutation).not.toHaveBeenCalled();expect(progress).not.toHaveBeenCalled();
});

it('pins guided uploads to their client and records the explicit guided origin',async()=>{
 const original=globalThis.XMLHttpRequest;
 const headers:Record<string,string>={};
 class Request {upload={onprogress:null};status=200;responseText='[]';onload:()=>void=()=>{};open=vi.fn();withCredentials=false;setRequestHeader=(key:string,value:string)=>headers[key]=value;send=()=>this.onload();}
 vi.stubGlobal('XMLHttpRequest',Request);
 await uploadFile('pos',new File(['x'],'pos.csv'),'day8',()=>{}, {client:'zestly-demo-latihan',user:'Taufiq',origin:'guided'});
 expect(headers).toMatchObject({'X-Kira-Origin':'guided','X-Kira-Client':'zestly-demo-latihan','X-Kira-User':'Taufiq'});
 vi.stubGlobal('XMLHttpRequest',original);
});
