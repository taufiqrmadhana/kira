import {useState} from 'react';
import {act, cleanup, fireEvent, render, screen, within} from '@testing-library/react';
import {MemoryRouter, useLocation} from 'react-router-dom';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import GuidedTour from './GuidedTour';
import type {TourStep} from './tourSteps';

const steps:TourStep[]=[
  {id:'overview',title:'See your payments',body:'Read the daily overview.',path:'/overview',target:'overview'},
  {id:'convert',title:'Convert uploaded files',body:'Review the uploaded columns.',path:'/workflow?step=2',target:'convert'},
  {id:'matching',title:'Review matching',body:'Check how payments were linked.',path:'/workflow?step=4',target:'matching'},
];
const targetAction=vi.fn();
const exit=vi.fn();
const fetchRequest=vi.fn();

function LocationProbe(){const location=useLocation();return <output data-testid="tour-location">{location.pathname+location.search}</output>;}
function Harness({client='demo',tourSteps=steps,targets=true,blocked=false}:{client?:string;tourSteps?:TourStep[];targets?:boolean;blocked?:boolean}){
  const [open,setOpen]=useState(false);
  return <><button onClick={()=>setOpen(true)}>Start tour</button><LocationProbe/>
    {targets && <><button data-tour="overview" onClick={targetAction}>Overview target</button><button data-tour="convert" onClick={targetAction}>Convert target</button><button data-tour="matching" onClick={targetAction}>Matching target</button></>}
    {blocked && <button data-tour="gated-step" disabled data-tour-unavailable="Upload files before continuing.">Matching step</button>}
    {open && <GuidedTour client={client} steps={tourSteps} onExit={()=>{exit();setOpen(false);}}/>}
  </>;
}
function tree(props:Parameters<typeof Harness>[0]={}){return <MemoryRouter initialEntries={['/analysis?c=old-client']}><Harness {...props}/></MemoryRouter>;}
function start(props:Parameters<typeof Harness>[0]={}){
  const view=render(tree(props));
  const trigger=screen.getByRole('button',{name:'Start tour'});
  trigger.focus();fireEvent.click(trigger);
  act(()=>vi.advanceTimersByTime(50));
  return view;
}
function tick(milliseconds:number){act(()=>vi.advanceTimersByTime(milliseconds));}
function route(){return new URL(screen.getByTestId('tour-location').textContent!,'http://localhost');}

beforeEach(()=>{
  vi.useFakeTimers();exit.mockReset();targetAction.mockReset();fetchRequest.mockReset();
  vi.stubGlobal('fetch',fetchRequest);
  vi.stubGlobal('matchMedia',vi.fn((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){}})));
  vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(performance.now()),16));
  vi.stubGlobal('cancelAnimationFrame',(id:number)=>clearTimeout(id));
  Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:vi.fn()});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({x:120,y:160,left:120,top:160,right:360,bottom:220,width:240,height:60,toJSON(){}});
});
afterEach(()=>{cleanup();vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});

it('navigates through tour paths with the bound client and never clicks an action or fetches data',()=>{
  start({client:'client-a'});
  expect(screen.getByRole('heading',{name:'See your payments'})).toBeInTheDocument();
  expect(route().pathname).toBe('/overview');expect(route().searchParams.get('c')).toBe('client-a');
  fireEvent.click(screen.getByRole('button',{name:'Next'}));tick(50);
  expect(screen.getByRole('heading',{name:'Convert uploaded files'})).toBeInTheDocument();
  expect(route().pathname).toBe('/workflow');expect(route().searchParams.get('step')).toBe('2');expect(route().searchParams.get('c')).toBe('client-a');
  fireEvent.click(screen.getByRole('button',{name:'Previous'}));tick(50);
  expect(screen.getByRole('heading',{name:'See your payments'})).toBeInTheDocument();
  expect(targetAction).not.toHaveBeenCalled();expect(fetchRequest).not.toHaveBeenCalled();
});

it('preserves the explicitly selected default client instead of inheriting a bookmarked client',()=>{
  start({client:''});
  expect(route().searchParams.has('c')).toBe(true);
  expect(route().searchParams.get('c')).toBe('');
});

it('announces the new explanation and keeps the pointer mounted while moving between steps',()=>{
  start();
  const pointer=document.querySelector('.tour-cursor');
  expect(pointer).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Next'}));tick(50);
  expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent('Convert uploaded files. Review the uploaded columns.');
  expect(document.querySelector('.tour-cursor')).toBe(pointer);
});

it('retains positive spotlight geometry when navigating to a route with the same target',()=>{
  start({tourSteps:[steps[0],{...steps[1],target:'overview'}]});
  const first=document.querySelector<HTMLElement>('.tour-highlight')!;
  expect(first).not.toBeNull();expect(parseFloat(first.style.width)).toBeGreaterThan(0);expect(parseFloat(first.style.height)).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button',{name:'Next'}));tick(50);
  expect(route().pathname).toBe('/workflow');
  const relocated=document.querySelector<HTMLElement>('.tour-highlight')!;
  expect(relocated).not.toBeNull();expect(parseFloat(relocated.style.width)).toBeGreaterThan(0);expect(parseFloat(relocated.style.height)).toBeGreaterThan(0);
  expect(parseFloat(relocated.style.left)).toBeLessThan(120);expect(parseFloat(relocated.style.top)).toBeLessThan(160);
});

it('advances after ten seconds and pauses until Resume is selected',()=>{
  start();tick(10000);
  expect(screen.getByRole('heading',{name:'Convert uploaded files'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Pause'}));tick(30000);
  expect(screen.getByRole('heading',{name:'Convert uploaded files'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Resume'}));tick(10000);
  expect(screen.getByRole('heading',{name:'Review matching'})).toBeInTheDocument();
});

it('resets the timer after manually moving forward or back',()=>{
  start();tick(8000);
  fireEvent.click(screen.getByRole('button',{name:'Next'}));tick(2500);
  expect(screen.getByRole('heading',{name:'Convert uploaded files'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Previous'}));tick(2500);
  expect(screen.getByRole('heading',{name:'See your payments'})).toBeInTheDocument();
  tick(7500);
  expect(screen.getByRole('heading',{name:'Convert uploaded files'})).toBeInTheDocument();
});

it('starts paused for reduced motion and allows an explicit Resume',()=>{
  vi.mocked(matchMedia).mockImplementation(query=>({matches:query==='(prefers-reduced-motion: reduce)',media:query,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent(){return true;}}));
  start();expect(screen.getByRole('button',{name:'Resume'})).toBeInTheDocument();tick(30000);
  expect(screen.getByRole('heading',{name:'See your payments'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Resume'}));tick(10000);
  expect(screen.getByRole('heading',{name:'Convert uploaded files'})).toBeInTheDocument();
});

it('keeps navigation usable when a target is missing and explains the missing area',()=>{
  start({targets:false});tick(1600);
  expect(screen.getByText(/^This area is not available on the current screen\./)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Next'}));tick(1600);
  expect(screen.getByRole('heading',{name:'Convert uploaded files'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Previous'})).toBeEnabled();
  expect(fetchRequest).not.toHaveBeenCalled();
});

it('uses a gated fallback explanation without unlocking or invoking its control',()=>{
  start({targets:false,blocked:true,tourSteps:[{...steps[0],target:'unavailable',fallback:'gated-step',blocked:'Matching is not available yet.'},steps[1]]});tick(1600);
  expect(screen.getByText('Upload files before continuing.')).toBeInTheDocument();
  expect(document.querySelector('[data-tour="gated-step"]')).toBeDisabled();
  expect(screen.getByRole('button',{name:'Next'})).toBeEnabled();
  expect(targetAction).not.toHaveBeenCalled();expect(fetchRequest).not.toHaveBeenCalled();
});

it('exits when the client changes without navigating into the new client',()=>{
  const view=start({client:'client-a'});
  view.rerender(tree({client:'client-b'}));tick(50);
  expect(exit).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(route().searchParams.get('c')).toBe('client-a');
});

it('keeps keyboard focus in the tour, exits with Escape, and restores the launch control',()=>{
  start();const dialog=screen.getByRole('dialog');
  expect(dialog.contains(document.activeElement)).toBe(true);
  const buttons=within(dialog).getAllByRole('button').filter(button=>!(button as HTMLButtonElement).disabled);
  const first=buttons[0],last=buttons.at(-1)!;
  last.focus();fireEvent.keyDown(last,{key:'Tab'});expect(first).toHaveFocus();
  first.focus();fireEvent.keyDown(first,{key:'Tab',shiftKey:true});expect(last).toHaveFocus();
  fireEvent.keyDown(last,{key:'Escape'});tick(50);
  expect(exit).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Start tour'})).toHaveFocus();
});

it('finishes through an explicit final control and offers Exit tour on earlier steps',()=>{
  start();expect(screen.getByRole('button',{name:'Exit tour'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Next'}));fireEvent.click(screen.getByRole('button',{name:'Next'}));tick(50);
  fireEvent.click(screen.getByRole('button',{name:'Finish tour'}));tick(50);
  expect(exit).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(fetchRequest).not.toHaveBeenCalled();
});
