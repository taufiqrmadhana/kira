import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useRovingFocus} from './useRovingFocus';
afterEach(cleanup);
function Collection({items=['a','b','c'],disabled=['b'],onSelect=()=>{}}:{items?:string[];disabled?:string[];onSelect?:(key:string)=>void}) {
  const roving=useRovingFocus(items,{initial:'a',disabled});
  return <div>{items.map(key=><button key={key} disabled={disabled.includes(key)} {...roving(key)} onClick={()=>onSelect(key)}>{key}</button>)}</div>;
}
it('keeps one Tab stop, skips disabled items, wraps, and supports Home/End without activation',()=>{
  const select=vi.fn(); render(<Collection onSelect={select}/>);
  const [a,b,c]=screen.getAllByRole('button');
  expect(a.tabIndex).toBe(0); expect(b.tabIndex).toBe(-1); expect(c.tabIndex).toBe(-1);
  a.focus(); fireEvent.keyDown(a,{key:'ArrowRight'}); expect(c).toHaveFocus();
  expect(a.tabIndex).toBe(-1);expect(c.tabIndex).toBe(0);expect(select).not.toHaveBeenCalled();
  fireEvent.keyDown(c,{key:'ArrowDown'});expect(a).toHaveFocus();
  fireEvent.keyDown(a,{key:'End'});expect(c).toHaveFocus();
  fireEvent.keyDown(c,{key:'Home'});expect(a).toHaveFocus();
});
it('repairs its Tab stop when the focused item disappears',()=>{
  const {rerender}=render(<Collection disabled={[]}/>);
  fireEvent.focus(screen.getByRole('button',{name:'c'}));
  rerender(<Collection items={['a','b']} disabled={[]}/>);
  expect(screen.getByRole('button',{name:'a'}).tabIndex).toBe(0);
});
