import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {createRef, useRef, useState} from 'react';
import {Menu, Modal, OverlayPortal, Popover, Toast} from './overlays';

afterEach(() => {cleanup(); vi.useRealTimers();});

function DialogExample() {
  const [open,setOpen]=useState(false);
  return <><button onClick={()=>setOpen(true)}>Edit</button>{open&&<Modal title="Edit outlet" onClose={()=>setOpen(false)}><input aria-label="City"/><button>Save</button></Modal>}</>;
}

it('portals overlay content to a shared body root',()=>{
  const {container}=render(<OverlayPortal><p>Evidence</p></OverlayPortal>);
  expect(container).not.toContainElement(screen.getByText('Evidence'));
  expect(screen.getByText('Evidence').parentElement).toHaveAttribute('data-overlay-root');
});

it('modal focuses, traps keyboard focus, hides background, and returns focus on Escape',()=>{
  const {container}=render(<DialogExample/>);
  const opener=screen.getByRole('button',{name:'Edit'});opener.focus();fireEvent.click(opener);
  const dialog=screen.getByRole('dialog',{name:'Edit outlet'});
  expect(dialog).toHaveAttribute('aria-modal','true');
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
  expect(container).toHaveAttribute('inert');
  screen.getByRole('button',{name:'Save'}).focus();fireEvent.keyDown(document,{key:'Tab'});
  expect(screen.getByRole('button',{name:'Close dialog'})).toHaveFocus();
  fireEvent.keyDown(document,{key:'Tab',shiftKey:true});expect(screen.getByRole('button',{name:'Save'})).toHaveFocus();
  fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(opener).toHaveFocus();expect(container).not.toHaveAttribute('inert');
});

it('outside pointer dismisses a modal, inside pointer does not',()=>{
  const close=vi.fn();render(<Modal title="Evidence" onClose={close}><p>Amount</p></Modal>);
  fireEvent.pointerDown(screen.getByText('Amount'));expect(close).not.toHaveBeenCalled();
  fireEvent.pointerDown(document.body);expect(close).toHaveBeenCalledOnce();
});

it('only the topmost dialog closes and focus returns to its parent',()=>{
  function Example(){const [nested,setNested]=useState(false);return <Modal title="Parent" onClose={vi.fn()}><button onClick={()=>setNested(true)}>Compare</button>{nested&&<Modal title="Child" onClose={()=>setNested(false)}><p>Details</p></Modal>}</Modal>}
  render(<Example/>);const opener=screen.getByRole('button',{name:'Compare'});opener.focus();fireEvent.click(opener);fireEvent.keyDown(document,{key:'Escape'});
  expect(screen.queryByRole('dialog',{name:'Child'})).not.toBeInTheDocument();expect(screen.getByRole('dialog',{name:'Parent'})).toBeInTheDocument();expect(opener).toHaveFocus();
});

it('popover follows its anchor, fits the viewport and restores focus',()=>{
  const anchor=createRef<HTMLButtonElement>();const close=vi.fn();
  const {rerender}=render(<button ref={anchor}>Columns</button>);anchor.current!.focus();
  vi.spyOn(anchor.current!,'getBoundingClientRect').mockReturnValue({left:990,right:1020,top:740,bottom:768,width:30,height:28,x:990,y:740,toJSON(){}});
  rerender(<><button ref={anchor}>Columns</button><Popover label="Columns" anchorRef={anchor} onClose={close}><button>Amount</button></Popover></>);
  const panel=screen.getByRole('dialog',{name:'Columns'});expect(parseFloat(panel.style.left)).toBeLessThanOrEqual(window.innerWidth-12);
  fireEvent.keyDown(document,{key:'Escape'});expect(close).toHaveBeenCalledOnce();
  rerender(<button ref={anchor}>Columns</button>);expect(anchor.current).toHaveFocus();
});

it('menu supports roving arrows, skips disabled entries, selects and closes',()=>{
  function Example(){const anchor=useRef<HTMLButtonElement>(null);const[open,setOpen]=useState(false);return <><button ref={anchor} onClick={()=>setOpen(true)}>Options</button>{open&&<Menu label="Actions" anchorRef={anchor} onClose={()=>setOpen(false)} items={[{id:'edit',label:'Edit',onSelect:select},{id:'disabled',label:'Unavailable',disabled:true,onSelect:select},{id:'remove',label:'Remove',onSelect:select,danger:true}]}/>}</>}
  const select=vi.fn();render(<Example/>);const opener=screen.getByRole('button',{name:'Options'});opener.focus();fireEvent.click(opener);
  expect(screen.getByRole('menuitem',{name:'Edit'})).toHaveFocus();fireEvent.keyDown(document.activeElement!,{key:'ArrowDown'});expect(screen.getByRole('menuitem',{name:'Remove'})).toHaveFocus();fireEvent.click(document.activeElement!);
  expect(select).toHaveBeenCalledOnce();expect(screen.queryByRole('menu')).not.toBeInTheDocument();expect(opener).toHaveFocus();
});

it('toast announces without stealing focus and pauses dismissal during interaction',()=>{
  vi.useFakeTimers();const close=vi.fn();render(<><button>Continue</button><Toast onClose={close}>Saved</Toast></>);const button=screen.getByRole('button',{name:'Continue'});button.focus();
  expect(screen.getByRole('status')).toHaveAttribute('aria-live','polite');expect(button).toHaveFocus();
  fireEvent.mouseEnter(screen.getByRole('status'));vi.advanceTimersByTime(6000);expect(close).not.toHaveBeenCalled();
  fireEvent.mouseLeave(screen.getByRole('status'));vi.advanceTimersByTime(5000);expect(close).toHaveBeenCalledOnce();
});

it('focused toast dismisses on Escape and restores previous focus',()=>{
  function Example(){const[open,setOpen]=useState(true);return <><button>Continue</button>{open&&<Toast duration={0} onClose={()=>setOpen(false)}>Saved</Toast>}</>}
  render(<Example/>);const previous=screen.getByRole('button',{name:'Continue'});previous.focus();screen.getByRole('button',{name:'Dismiss notification'}).focus();fireEvent.keyDown(document.activeElement!,{key:'Escape'});expect(screen.queryByRole('status')).not.toBeInTheDocument();expect(previous).toHaveFocus();
});
