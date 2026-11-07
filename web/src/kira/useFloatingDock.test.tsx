import {useState} from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useFloatingDock} from './useFloatingDock';

let width = 80;
let height = 80;
let resizeDock: () => void;
const capture = vi.fn();
const release = vi.fn();

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly isPrimary: boolean;
  readonly pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}

function Harness({enabled = true, expanded = false, hideHandle = false}: {enabled?: boolean; expanded?: boolean; hideHandle?: boolean}) {
  const dock = useFloatingDock({enabled, expanded});
  const [clicks, setClicks] = useState(0);
  return <aside ref={dock.dockRef} style={dock.style} data-testid="dock" data-dragging={dock.dragging}>
    <button {...dock.dragProps} onClick={() => {
      if (!dock.consumeDragClick()) setClicks(value => value + 1);
    }}>Launcher</button>
    {!hideHandle && <div {...dock.dragProps} tabIndex={0} role="button" aria-label="Move chat">
      <span>Handle icon</span><input aria-label="Unrelated input"/>
    </div>}
    <output>{clicks} clicks</output>
  </aside>;
}

const launcher = () => screen.getByRole('button', {name:'Launcher'});
const dock = () => screen.getByTestId('dock');
const point = (clientX: number, clientY: number, extra: PointerEventInit = {}) => ({
  pointerId:1, isPrimary:true, button:0, clientX, clientY, ...extra,
});

beforeEach(() => {
  width = 80;
  height = 80;
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 800);
  vi.stubGlobal('visualViewport', undefined);
  vi.stubGlobal('PointerEvent', TestPointerEvent);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resizeDock = callback; }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x:0, y:0, left:0, top:0, right:width, bottom:height, width, height, toJSON() {},
  }));
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {configurable:true, value:capture});
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {configurable:true, value:release});
  capture.mockClear();
  release.mockClear();
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('keeps a small pointer movement as an ordinary click', () => {
  render(<Harness/>);
  fireEvent.pointerDown(launcher(), point(100,100));
  fireEvent.pointerMove(launcher(), point(103,103));
  expect(dock()).toHaveStyle({right:'24px',bottom:'16px'});
  expect(dock()).toHaveAttribute('data-dragging','false');
  fireEvent.pointerUp(launcher(), point(103,103));
  fireEvent.click(launcher());
  expect(screen.getByText('1 clicks')).toBeInTheDocument();
  expect(capture).toHaveBeenCalledWith(1);
  expect(release).toHaveBeenCalledWith(1);
});

it.each(['mouse','touch','pen'])('moves a %s pointer after the drag threshold and suppresses only the resulting click', pointerType => {
  render(<Harness/>);
  fireEvent.pointerDown(launcher(), point(100,100,{pointerType}));
  fireEvent.pointerMove(launcher(), point(60,70,{pointerType}));
  expect(dock()).toHaveStyle({right:'64px',bottom:'46px'});
  expect(dock()).toHaveAttribute('data-dragging','true');
  fireEvent.pointerUp(launcher(), point(60,70,{pointerType}));
  fireEvent.lostPointerCapture(launcher(), point(60,70,{pointerType}));
  expect(dock()).toHaveAttribute('data-dragging','false');
  fireEvent.click(launcher());
  expect(screen.getByText('0 clicks')).toBeInTheDocument();
  fireEvent.click(launcher());
  expect(screen.getByText('1 clicks')).toBeInTheDocument();
});

it('clamps the entire expanded dock inside the viewport on every edge', () => {
  width = 420;
  height = 660;
  render(<Harness expanded/>);
  fireEvent.pointerDown(launcher(), point(500,500));
  fireEvent.pointerMove(launcher(), point(-1000,-1000));
  expect(dock()).toHaveStyle({right:'568px',bottom:'128px'});
  fireEvent.pointerMove(launcher(), point(2000,2000));
  expect(dock()).toHaveStyle({right:'12px',bottom:'12px'});
});

it('ignores right clicks, additional pointers, and pointer events from a different pointer', () => {
  render(<Harness/>);
  fireEvent.pointerDown(launcher(), point(100,100,{button:2}));
  fireEvent.pointerMove(launcher(), point(0,0));
  fireEvent.pointerDown(launcher(), point(100,100,{isPrimary:false}));
  fireEvent.pointerMove(launcher(), point(0,0));
  expect(capture).not.toHaveBeenCalled();
  fireEvent.pointerDown(launcher(), point(100,100));
  fireEvent.pointerMove(launcher(), point(0,0,{pointerId:2}));
  fireEvent.pointerUp(launcher(), point(0,0,{pointerId:2}));
  expect(dock()).toHaveStyle({right:'24px',bottom:'16px'});
  fireEvent.pointerMove(launcher(), point(80,80));
  expect(dock()).toHaveStyle({right:'44px',bottom:'36px'});
});

it('releases a cancelled drag and allows the next deliberate click', () => {
  render(<Harness/>);
  fireEvent.pointerDown(launcher(), point(100,100));
  fireEvent.pointerMove(launcher(), point(80,80));
  fireEvent.pointerCancel(launcher(), point(80,80));
  expect(dock()).toHaveAttribute('data-dragging','false');
  fireEvent.pointerMove(launcher(), point(0,0));
  expect(dock()).toHaveStyle({right:'44px',bottom:'36px'});
  fireEvent.pointerDown(launcher(), point(80,80));
  fireEvent.pointerUp(launcher(), point(80,80));
  fireEvent.click(launcher());
  expect(screen.getByText('1 clicks')).toBeInTheDocument();
});

it('stops moving when capture is lost without getting stuck', () => {
  render(<Harness/>);
  fireEvent.pointerDown(launcher(), point(100,100));
  fireEvent.pointerMove(launcher(), point(80,80));
  fireEvent.lostPointerCapture(launcher(), point(80,80));
  expect(dock()).toHaveAttribute('data-dragging','false');
  fireEvent.pointerMove(launcher(), point(0,0));
  expect(dock()).toHaveStyle({right:'44px',bottom:'36px'});
  fireEvent.keyDown(launcher(), {key:'Enter'});
  fireEvent.click(launcher());
  expect(screen.getByText('1 clicks')).toBeInTheDocument();
});

it('ends a header drag when closing removes its handle and lets the launcher move again', () => {
  const view = render(<Harness expanded/>);
  const handle = screen.getByRole('button',{name:'Move chat'});
  fireEvent.pointerDown(handle,point(100,100));
  fireEvent.pointerMove(handle,point(80,80));
  expect(dock()).toHaveAttribute('data-dragging','true');
  view.rerender(<Harness hideHandle/>);
  expect(dock()).toHaveAttribute('data-dragging','false');
  expect(dock()).toHaveStyle({right:'44px',bottom:'36px'});
  fireEvent.pointerDown(launcher(),point(100,100));
  fireEvent.pointerMove(launcher(),point(90,90));
  expect(dock()).toHaveStyle({right:'54px',bottom:'46px'});
  expect(dock()).toHaveAttribute('data-dragging','true');
});

it('moves with arrow keys, uses larger shift steps, and resets with Home', () => {
  render(<Harness/>);
  const handle = screen.getByRole('button',{name:'Move chat'});
  handle.focus();
  fireEvent.keyDown(handle,{key:'ArrowLeft'});
  fireEvent.keyDown(handle,{key:'ArrowUp',shiftKey:true});
  expect(dock()).toHaveStyle({right:'40px',bottom:'64px'});
  expect(handle).toHaveFocus();
  fireEvent.keyDown(handle,{key:'ArrowRight'});
  fireEvent.keyDown(handle,{key:'ArrowDown'});
  expect(dock()).toHaveStyle({right:'24px',bottom:'48px'});
  fireEvent.keyDown(handle,{key:'Home'});
  expect(dock()).toHaveStyle({right:'24px',bottom:'16px'});
  fireEvent.keyDown(screen.getByRole('textbox'),{key:'ArrowLeft'});
  fireEvent.pointerDown(screen.getByRole('textbox'),point(100,100));
  fireEvent.pointerMove(handle,point(0,0));
  expect(dock()).toHaveStyle({right:'24px',bottom:'16px'});
});

it('reclamps when the panel expands, changes size, or the window becomes smaller', () => {
  const view = render(<Harness/>);
  fireEvent.pointerDown(launcher(), point(800,700));
  fireEvent.pointerMove(launcher(), point(100,100));
  fireEvent.pointerUp(launcher(), point(100,100));
  expect(dock()).toHaveStyle({right:'724px',bottom:'616px'});
  width = 420;
  height = 660;
  view.rerender(<Harness expanded/>);
  expect(dock()).toHaveStyle({right:'568px',bottom:'128px'});
  height = 700;
  act(() => resizeDock());
  expect(dock()).toHaveStyle({right:'568px',bottom:'88px'});
  vi.stubGlobal('innerWidth',500);
  act(() => window.dispatchEvent(new Event('resize')));
  expect(dock()).toHaveStyle({right:'68px',bottom:'88px'});
});

it('keeps the dock above a reduced visual viewport and removes listeners on unmount', () => {
  height = 660;
  const viewport = Object.assign(new EventTarget(), {width:1000,height:500,offsetLeft:0,offsetTop:0});
  const remove = vi.spyOn(viewport,'removeEventListener');
  vi.stubGlobal('visualViewport', viewport);
  const view = render(<Harness/>);
  expect(dock()).toHaveStyle({right:'24px',bottom:'312px'});
  expect(dock().style.getPropertyValue('--kira-viewport-height')).toBe('500px');
  expect(dock().style.getPropertyValue('--kira-viewport-width')).toBe('1000px');
  // CSS uses the variable to shrink the panel, then ResizeObserver measures the
  // full panel + launcher again. JSDOM does not perform that CSS layout itself.
  height = 400;
  act(() => resizeDock());
  expect(800 - Number.parseFloat(dock().style.bottom) - height).toBeGreaterThanOrEqual(12);
  viewport.height = 400;
  act(() => viewport.dispatchEvent(new Event('resize')));
  expect(dock()).toHaveStyle({bottom:'412px'});
  expect(dock().style.getPropertyValue('--kira-viewport-height')).toBe('400px');
  height = 300;
  act(() => resizeDock());
  expect(800 - Number.parseFloat(dock().style.bottom) - height).toBeGreaterThanOrEqual(12);
  view.unmount();
  expect(remove).toHaveBeenCalledWith('resize',expect.any(Function));
});

it('leaves embedded chat positioning and interactions untouched', () => {
  render(<Harness enabled={false}/>);
  expect(dock().style.right).toBe('');
  expect(dock().style.bottom).toBe('');
  fireEvent.pointerDown(launcher(),point(100,100));
  fireEvent.pointerMove(launcher(),point(0,0));
  fireEvent.keyDown(launcher(),{key:'ArrowLeft'});
  fireEvent.click(launcher());
  expect(capture).not.toHaveBeenCalled();
  expect(dock()).toHaveAttribute('data-dragging','false');
  expect(screen.getByText('1 clicks')).toBeInTheDocument();
});
