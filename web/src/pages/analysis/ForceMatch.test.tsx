import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {ForceMatchCard} from './ForceMatch';
beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.open = true; });
    HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) { this.open = false; });
});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});
const evidence = {groupId:'payout:one',outlet:'Riverside',day:'2026-10-29',count:138,net:11146027,withdrawal:11146000,withdrawalN:139,bank:11143500,bankN:1,bankDay:'2026-10-30',delay:1,token:'shown-evidence',maxDays:3};
it('requires a reason and explicit acceptance before saving the selected evidence', async () => {
    const fetch=vi.fn(async(_url:string,_init?:RequestInit)=>new Response('{"id":7}',{headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetch);
    const saved=vi.fn();render(<ForceMatchCard evidence={evidence} onClose={vi.fn()} onSaved={saved}/>);
    const confirm=screen.getByRole('button',{name:'Confirm Force Match'});
    expect(confirm).toBeDisabled();expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Use suggested reason'}));
    expect((screen.getByLabelText('Reason') as HTMLTextAreaElement).value).toContain('Rp 2.500');
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(confirm);
    await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1));
    const [url,init]=fetch.mock.calls[0];
    expect(url).toBe('/api/analysis/force-matches');
    expect(JSON.parse(String(init?.body))).toMatchObject({group_id:'payout:one',bank_n:1,withdrawal_n:139,evidence_token:'shown-evidence',accept_difference:true});
});
it('keeps the reason and card open when evidence has changed', async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('{"detail":"Evidence changed; review again"}',{status:409})));
    const saved=vi.fn();render(<ForceMatchCard evidence={evidence} onClose={vi.fn()} onSaved={saved}/>);
    fireEvent.change(screen.getByLabelText('Reason'),{target:{value:'Provider confirmed the adjustment.'}});
    fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Confirm Force Match'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Evidence changed');
    expect(screen.getByLabelText('Reason')).toHaveValue('Provider confirmed the adjustment.');
    expect(saved).not.toHaveBeenCalled();
});
