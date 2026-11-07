/** Applied only to returned linked rows after the counterpart request settles. */
export function revealLinkedEvidence(panel: HTMLElement | null, reduced: boolean) {
  const pane=panel?.querySelector<HTMLElement>('.table-scroll');
  pane?.scrollTo?.({top:0,behavior:reduced?'instant':'smooth'});
  if(reduced)return;
  panel?.querySelectorAll<HTMLElement>('tbody tr').forEach(row => row.animate?.([
    {backgroundColor:'var(--color-lime)'}, {backgroundColor:'transparent'},
  ],{duration:600,easing:'ease-out'}));
}
