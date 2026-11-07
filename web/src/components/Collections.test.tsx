import {useState} from 'react';
import {afterEach, expect, it} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {Segmented, Tabs} from './index';

afterEach(cleanup);
const items = [{value:'outlet', label:'By outlet'}, {value:'month', label:'By month'}, {value:'year', label:'By year'}];
function Controls({tabs = false}: {tabs?:boolean}) {
  const [value, setValue] = useState('outlet');
  return tabs ? <Tabs value={value} onChange={setValue} items={items}/> : <Segmented value={value} onChange={setValue} items={items} label="Layout"/>;
}
it.each([false, true])('provides one tab stop and arrow/Home/End navigation (tabs=%s)', tabs => {
  render(<Controls tabs={tabs}/>);
  const buttons = screen.getAllByRole(tabs ? 'tab' : 'button');
  expect(buttons.map(button => button.tabIndex)).toEqual([0, -1, -1]);
  buttons[0].focus();
  fireEvent.keyDown(buttons[0], {key:'ArrowRight'});
  expect(buttons[1]).toHaveFocus();
  expect(buttons.map(button => button.tabIndex)).toEqual([-1, 0, -1]);
  fireEvent.keyDown(buttons[1], {key:'End'});
  expect(buttons[2]).toHaveFocus();
  fireEvent.keyDown(buttons[2], {key:'ArrowRight'});
  expect(buttons[0]).toHaveFocus();
  fireEvent.keyDown(buttons[0], {key:'End'});
  fireEvent.keyDown(buttons[2], {key:'Home'});
  expect(buttons[0]).toHaveFocus();
});
