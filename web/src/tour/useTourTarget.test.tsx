import {afterEach,expect,it,vi} from 'vitest';
import {waitForTarget} from './useTourTarget';
afterEach(()=>{document.body.innerHTML='';vi.useRealTimers();});
it('waits for a real nonzero target through mutation observation',async()=>{const pending=waitForTarget('late');const target=document.createElement('button');target.dataset.tour='late';target.getBoundingClientRect=()=>({width:40,height:20}) as DOMRect;document.body.append(target);expect(await pending).toBe(target);});
it('skips absent and zero-size targets after two seconds',async()=>{vi.useFakeTimers();const target=document.createElement('div');target.dataset.tour='zero';document.body.append(target);const pending=waitForTarget('zero');await vi.advanceTimersByTimeAsync(2000);expect(await pending).toBeNull();});
