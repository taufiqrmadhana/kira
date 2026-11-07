import {afterEach, expect, it, vi} from 'vitest';
import {revealLinkedEvidence} from './evidenceMotion';
afterEach(()=>{document.body.replaceChildren();});
it('scrolls the counterpart pane and highlights its actual visible evidence once', () => {
  const panel=document.createElement('section');
  panel.innerHTML='<div class="table-scroll"><table><tbody><tr><td>Bank credit</td></tr></tbody></table></div>';
  const pane=panel.querySelector('.table-scroll') as HTMLElement;
  const row=panel.querySelector('tr')!;
  pane.scrollTo=vi.fn();row.animate=vi.fn();
  revealLinkedEvidence(panel,false);
  expect(pane.scrollTo).toHaveBeenCalledWith({top:0,behavior:'smooth'});
  expect(row.animate).toHaveBeenCalledTimes(1);
});
it('uses instant scrolling and no flash with reduced motion', () => {
  const panel=document.createElement('section');
  panel.innerHTML='<div class="table-scroll"><table><tbody><tr><td>Linked</td></tr></tbody></table></div>';
  const pane=panel.querySelector('.table-scroll') as HTMLElement,row=panel.querySelector('tr')!;
  pane.scrollTo=vi.fn();row.animate=vi.fn();
  revealLinkedEvidence(panel,true);
  expect(pane.scrollTo).toHaveBeenCalledWith({top:0,behavior:'instant'});
  expect(row.animate).not.toHaveBeenCalled();
});
