/** Applied only to returned linked rows after the counterpart request settles. */
export function revealLinkedEvidence(panel: HTMLElement | null, reduced: boolean) {
  const pane=panel?.querySelector<HTMLElement>('.table-scroll');
  pane?.scrollTo?.({top:0,behavior:reduced?'instant':'smooth'});
  if(reduced)return;
  panel?.animate?.([{opacity:.65,transform:'translateX(8px)'},{opacity:1,transform:'translateX(0)'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
  panel?.querySelectorAll<HTMLElement>('[data-link]').forEach(chip=>chip.animate?.([{backgroundColor:'var(--color-lime)',transform:'scale(1.04)'},{backgroundColor:'transparent',transform:'scale(1)'}],{duration:600,easing:'ease-out'}));
  panel?.querySelectorAll<HTMLElement>('tbody tr').forEach(row => row.animate?.([
    {backgroundColor:'var(--color-lime)'}, {backgroundColor:'transparent'},
  ],{duration:600,easing:'ease-out'}));
}
