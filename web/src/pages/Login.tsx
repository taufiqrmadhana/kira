import {useEffect,useState,type FormEvent} from 'react';
import {useNavigate,useSearchParams} from 'react-router-dom';
import {ArrowRight,Eye,EyeOff} from 'lucide-react';
import {api} from '../lib/api';
import {Button} from '../components';

export default function Login(){
    const [show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
    const navigate=useNavigate();
    const [params]=useSearchParams();
    const candidate=params.get('next')||'/';
    const next=candidate.startsWith('/')&&!candidate.startsWith('//')&&!candidate.includes('\\')?candidate:'/';
    useEffect(()=>{
        const controller=new AbortController();
        api('/me',{signal:controller.signal}).then(()=>{if(!controller.signal.aborted)navigate(next,{replace:true});}).catch(()=>{/* Keep the sign-in form available when signed out or disconnected. */});
        return()=>controller.abort();
    },[navigate,next]);
    async function submit(event:FormEvent<HTMLFormElement>){
        event.preventDefault();setBusy(true);setError('');
        const form=new FormData(event.currentTarget);
        try{await api('/login',{method:'POST',body:JSON.stringify({username:form.get('username'),password:form.get('password')})});navigate(next,{replace:true});}
        catch(error){setError((error as Error).message);}finally{setBusy(false);}
    }
    return <main className="login"><div className="login-story"><a className="brand" href="/">kira<span>↗</span></a><div><h1>Trace payments<br/>from sale to bank.</h1><p>Review your POS sales, payment settlements,<br/>and bank credits in one workspace.</p><div className="journey"><span>01 POS sales</span><ArrowRight/><span>02 Settlement</span><ArrowRight/><span>03 Bank</span></div></div><small>Payment reconciliation for Indonesian merchants</small></div><div className="login-form"><form onSubmit={submit}><h2>Sign in to KIRA</h2><p>Open your reconciliation workspace.</p><label>Username<input name="username" autoComplete="username" required autoFocus disabled={busy}/></label><label>Password<div className="password"><input name="password" type={show?'text':'password'} autoComplete="current-password" required disabled={busy}/><Button variant="quiet" aria-label={show?'Hide password':'Show password'} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</Button></div></label>{error&&<p role="alert" className="error-text">{error}</p>}<Button variant="primary" type="submit" disabled={busy}>{busy?'Signing in…':'Sign in'}<ArrowRight size={16}/></Button></form></div></main>;
}
