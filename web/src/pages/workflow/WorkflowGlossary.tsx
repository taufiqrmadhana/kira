import {useLayoutEffect,useRef,useState} from 'react';

const terms=[
  ['Run','Apply the selected matching rules to the cleaned data and save the result.'],
  ['Matching rule','Conditions that link two sources. Rules run from top to bottom, and a linked row is used once per stage.'],
  ['Test','Preview the selected rules against the current data. Testing does not save or replace matching results.'],
  ['Batch payout','One bank credit pays several settlements: many settlements to one credit.'],
  ['Match rate','The share of POS sales traced through settlement to a bank credit.'],
  ['Mismatched','A POS sale is missing a link in at least one stage. Records without a POS sale are counted separately.'],
  ['Needs review','An amount-only match or several possible matches need a person to decide.'],
];

export default function WorkflowGlossary(){
  const ref=useRef<HTMLElement>(null);
  const [docked,setDocked]=useState(false),[expanded,setExpanded]=useState(false);
  useLayoutEffect(()=>{
    const media=window.matchMedia?.('(min-width: 1280px)');
    const update=()=>setDocked((media?.matches??window.innerWidth>=1280)&&(ref.current?.parentElement?.getBoundingClientRect().width||window.innerWidth)>=850);
    update();media?.addEventListener?.('change',update);
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;
    if(ref.current?.parentElement)observer?.observe(ref.current.parentElement);
    return()=>{media?.removeEventListener?.('change',update);observer?.disconnect();};
  },[]);
  return <aside ref={ref} className="step4-glossary" data-docked={docked} data-tour="workflow-glossary"><details open={docked||expanded} onToggle={event=>{if(!docked)setExpanded(event.currentTarget.open);}}><summary onClick={event=>{if(docked)event.preventDefault();}}>Glossary</summary><dl>{terms.map(([term,meaning])=><div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}</dl></details></aside>;
}
