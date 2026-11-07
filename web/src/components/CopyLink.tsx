import {useState} from 'react';
import {Link2} from 'lucide-react';
import {Button} from './primitives';
import {Toast} from './overlays';

export function CopyLink() {
  const [pending,setPending]=useState(false);
  const [notice,setNotice]=useState('');
  async function copy() {
    if(pending)return;
    setPending(true);setNotice('');
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice('Link copied. Anyone signed in opens this exact view.');
    } catch {
      setNotice('Copy the address from your browser’s address bar.');
    } finally {setPending(false);}
  }
  return <><Button data-tour="copy-link" onClick={()=>void copy()} disabled={pending}><Link2 size={16} aria-hidden="true"/>{pending?'Copying…':'Copy link'}</Button>{notice&&<Toast onClose={()=>setNotice('')}>{notice}</Toast>}</>;
}
