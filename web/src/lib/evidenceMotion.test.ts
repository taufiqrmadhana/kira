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

it('reveals the returned panel and flashes actual link chips once, with no movement under reduced motion',()=>{
 const panel=document.createElement('section');panel.innerHTML='<span data-link="M2-1">M2-1</span>';const chip=panel.firstElementChild as HTMLElement;
 panel.animate=vi.fn();chip.animate=vi.fn();revealLinkedEvidence(panel,false);
 expect(panel.animate).toHaveBeenCalledTimes(1);expect(chip.animate).toHaveBeenCalledTimes(1);
 vi.mocked(panel.animate).mockClear();vi.mocked(chip.animate).mockClear();revealLinkedEvidence(panel,true);
 expect(panel.animate).not.toHaveBeenCalled();expect(chip.animate).not.toHaveBeenCalled();
});
