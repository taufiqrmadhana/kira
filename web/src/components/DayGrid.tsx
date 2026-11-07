import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Segmented } from './index';
import { count, date, money, percent } from '../lib/format';
import { DayGridLegend } from './DayGridLegend';
import { DayGridTooltip } from './DayGridTooltip';
import { aggregateDay, calendarDays, dailyCells, dayAriaLabel, rampStep, type DayGridCell, type DayGridGap, type DayGridRateRow } from './day-grid-model';
import './day-grid.css';
export { rampStep, dayAriaLabel } from './day-grid-model';
export type { DayGridCell, DayGridGap, DayGridRateRow } from './day-grid-model';
export interface DayGridProps {
    rows: DayGridRateRow[]; gaps: DayGridGap[]; dateFrom?:string; dateTo?:string; latestDay?:string; compact?:boolean;
    onSelect:(cell:DayGridCell)=>void; selected?:{day:string;outlet?:string};
}
const shortOutlet=(outlet:string)=>outlet.replace(/^Zestly\s+/,'');
const shortDate=(day:string)=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`));
function Summary({cells}:{cells:DayGridCell[]}) {
    const low=cells.filter(c=>c.rate!==null&&c.rate<80).sort((a,b)=>(a.rate??100)-(b.rate??100)||b.to_check-a.to_check);
    const flagged=cells.filter(c=>c.to_check>0).sort((a,b)=>b.to_check-a.to_check);
    const healthy=flagged.filter(c=>c.rate!==null&&c.rate>95);
    const other=flagged.filter(c=>!low.includes(c));
    const total=aggregateDay(cells);
    return <p className="day-grid-summary" data-testid="day-grid-summary">
        {low.length ? <><strong>{count(low.length)}</strong> {low.length===1?'outlet-day is':'outlet-days are'} below <strong>80%</strong>: {low.map((cell,i)=><span key={`${cell.day}${cell.outlet}`}>{i>0?'; ':''}{shortOutlet(cell.outlet)} on {shortDate(cell.day)} at <strong>{percent(cell.rate===null?null:Math.round(cell.rate))}</strong>{cell.to_check>0 && <> (<strong>{money(cell.not_in_bank || cell.to_check)}</strong> {cell.not_in_bank?'not in the bank':'to check'})</>}</span>)}. </> : <>Across <strong>{count(cells.length)}</strong> outlet-days, <strong>{percent(total?.rate)}</strong> of POS sales reached the bank. </>}
        {flagged.length>0 ? <><strong>{count(flagged.length)}</strong> {flagged.length===1?'outlet-day carries':'outlet-days carry'} money to check, <strong>{count(healthy.length)}</strong> of them above <strong>95%</strong> on matching.{other.length>0 && <> To check: {other.map((cell,i)=><span key={`${cell.day}${cell.outlet}`}>{i>0?'; ':''}{shortOutlet(cell.outlet)} on {shortDate(cell.day)} <strong>{money(cell.to_check)}</strong></span>)}.</>}</> : <>No money to check on these days.</>}
    </p>;
}
export function DayGrid({rows,gaps,dateFrom,dateTo,latestDay,compact=false,onSelect,selected}:DayGridProps) {
    const id=useId(), tooltipId=`${id}-tooltip`;
    const [layout,setLayout]=useState('outlet'), [active,setActive]=useState(''), [chosen,setChosen]=useState('');
    const [hover,setHover]=useState<{cell:DayGridCell;anchor:HTMLButtonElement}|null>(null);
    const [focused,setFocused]=useState<{cell:DayGridCell;anchor:HTMLButtonElement}|null>(null);
    const refs=useRef(new Map<string,HTMLButtonElement>());
    const cells=useMemo(()=>dailyCells(rows,gaps).filter(cell=>(!dateFrom||cell.day>=dateFrom)&&(!dateTo||cell.day<=dateTo)),[rows,gaps,dateFrom,dateTo]);
    const dates=cells.map(cell=>cell.day).sort();
    const from=dateFrom||dates[0], to=dateTo||(latestDay && latestDay>(dates.at(-1)||'') ? latestDay : dates.at(-1));
    const days=from&&to?calendarDays(from,to):[];
    const closeDay=latestDay||dates.at(-1);
    const monthView=layout==='month';
    const groups = monthView ? [...new Set(days.map(day=>day.slice(0,7)))] : [...new Set(cells.map(c=>c.outlet))].sort();
    const matrix=groups.map(group=>{
        const datesInRow=monthView ? Array.from({length:31},(_,i)=>`${group}-${String(i+1).padStart(2,'0')}`):days;
        const rowCells=datesInRow.map(day=>{
            if (monthView && new Date(`${day}T12:00:00Z`).getUTCMonth()!==Number(group.slice(5))-1) return undefined;
            return aggregateDay(cells.filter(cell=>cell.day===day&&(monthView||cell.outlet===group)));
        });
        return {group,dates:datesInRow,cells:rowCells};
    });
    const keyFor=(r:number,c:number)=>`${layout}:${groups[r]}:${matrix[r].dates[c]}`;
    const available=matrix.flatMap((row,r)=>row.cells.flatMap((cell,c)=>cell?[keyFor(r,c)]:[]));
    const activeKey=available.includes(active)?active:available[0];
    const handleKey=(event:KeyboardEvent<HTMLButtonElement>,r:number,c:number,cell:DayGridCell)=>{
        if(event.key==='Escape'){setHover(null);setFocused(null);return;}
        if(event.key==='Enter'||event.key===' '){event.preventDefault();setChosen(keyFor(r,c));onSelect(cell);return;}
        let nr=r,nc=c;
        if(event.key==='Home') nc=matrix[r].cells.findIndex(Boolean);
        else if(event.key==='End') nc=matrix[r].cells.map(Boolean).lastIndexOf(true);
        else if(event.key==='ArrowLeft'||event.key==='ArrowRight') {
            const direction=event.key==='ArrowLeft'?-1:1;
            do {nc+=direction;} while(nc>=0&&nc<matrix[r].cells.length&&!matrix[r].cells[nc]);
        } else if(event.key==='ArrowUp'||event.key==='ArrowDown') {
            const direction=event.key==='ArrowUp'?-1:1;
            do {nr+=direction;} while(nr>=0&&nr<matrix.length&&!matrix[nr].cells[c]);
        } else return;
        event.preventDefault();
        if(matrix[nr]?.cells[nc]){const key=keyFor(nr,nc);setActive(key);refs.current.get(key)?.focus();}
    };
    const tooltip=hover||focused;
    const hasEmpty=matrix.some(row=>row.cells.some(cell=>cell===null));
    const showLatest=!!closeDay&&matrix.some(row=>row.dates.includes(closeDay));
    return <section className={`day-grid-panel${compact?' day-grid-panel--compact':''}`} aria-labelledby={`${id}-title`}>
        <header className="day-grid-header"><div><h2 id={`${id}-title`}>Every day at a glance</h2><p>One box per day. The fill is how much of the day's POS sales were traced all the way to a bank credit; the corner flags money to check. Click a day to open it.</p></div>
            {!compact && <Segmented label="Day grid layout" value={layout} onChange={value=>{setLayout(value);setHover(null);setFocused(null);}} items={[{value:'outlet',label:'By outlet'},{value:'month',label:'By month'}]}/>}
        </header>
        {cells.length ? <>
            <div className="day-grid-scroll"><div role="grid" aria-label={monthView?'Daily match by month':'Daily match by outlet'} aria-describedby={`${id}-keyboard`} className={`day-grid${monthView?' day-grid--month':''}`} style={{'--day-grid-columns':monthView?31:days.length} as CSSProperties}>
                <div role="row" className="day-grid-row day-grid-head"><span role="columnheader" className="day-grid-row-label">{monthView?'Month':'Outlet'}</span>{(monthView?Array.from({length:31},(_,i)=>String(i+1)):days).map(day=><span key={day} role="columnheader">{monthView?day:<><span>{new Intl.DateTimeFormat('en-GB',{weekday:'short',timeZone:'UTC'}).format(new Date(`${day}T12:00:00Z`))}</span><strong>{day.slice(-2)}</strong></>}</span>)}<span role="columnheader" className="day-grid-row-total">End to end</span></div>
                {matrix.map((row,r)=>{
                    const rowData=row.cells.filter((cell):cell is DayGridCell=>!!cell), total=aggregateDay(rowData);
                    return <div key={row.group} role="row" className="day-grid-row"><span role="rowheader" className="day-grid-row-label">{monthView?new Intl.DateTimeFormat('id-ID',{month:'short',year:'2-digit',timeZone:'UTC'}).format(new Date(`${row.group}-01T12:00:00Z`)):shortOutlet(row.group)}</span>
                        {row.cells.map((cell,c)=>{
                            const key=keyFor(r,c), latest=row.dates[c]===closeDay;
                            if(cell===undefined)return <span key={key} role="gridcell" className="day-grid-calendar-blank"/>;
                            if(cell===null)return <span key={key} role="gridcell" className={`day-grid-cell day-grid-empty${latest?' day-grid-latest':''}`} aria-label={`${monthView?'All outlets':row.group}, ${date(row.dates[c])}, no data`}/>;
                            const isSelected=selected ? selected.day===cell.day&&(!selected.outlet||selected.outlet===cell.outlet):chosen===key;
                            return <span role="gridcell" key={key} aria-selected={isSelected}><button ref={el=>{if(el)refs.current.set(key,el);else refs.current.delete(key);}} type="button" className={`day-grid-cell day-grid-cell--${cell.rate===null?'unavailable':rampStep(cell.rate)}${latest?' day-grid-latest':''}${isSelected?' day-grid-selected':''}`} tabIndex={activeKey===key?0:-1} aria-label={dayAriaLabel(cell)} aria-describedby={tooltip?.cell.day===cell.day&&tooltip?.cell.outlet===cell.outlet?tooltipId:undefined} onMouseEnter={event=>setHover({cell,anchor:event.currentTarget})} onMouseLeave={()=>setHover(null)} onFocus={event=>{setActive(key);setFocused({cell,anchor:event.currentTarget});}} onBlur={()=>setFocused(null)} onClick={()=>{setChosen(key);onSelect(cell);}} onKeyDown={event=>handleKey(event,r,c,cell)}>
                                <span className="day-grid-number" aria-hidden="true">{cell.rate===null?'—':count(cell.rate)}</span>
                                {(cell.to_check>0||cell.review>0)&&<i aria-hidden="true" className={`day-grid-corner day-grid-corner--${cell.to_check>0?'red':'amber'}`}/>}
                                {cell.not_in_bank>0&&<i aria-hidden="true" className="day-grid-waiting"/>}
                            </button></span>;
                        })}<span role="gridcell" className="day-grid-row-total"><strong>{percent(total?.rate)}</strong><small>{count(rowData.length)} {rowData.length===1?'day':'days'}</small></span>
                    </div>;
                })}
            </div></div>
            <p id={`${id}-keyboard`} className="sr-only">Use the arrow keys to move between days and outlets. Home and End move to the first and last day with data in a row. Enter opens the selected day.</p>
            <DayGridLegend money={cells.some(c=>c.to_check>0)} review={cells.some(c=>!c.to_check&&c.review>0)} waiting={cells.some(c=>c.not_in_bank>0)} empty={hasEmpty} latest={showLatest} unavailable={cells.some(c=>c.rate===null)}/>
            <Summary cells={cells}/>
        </> : <p className="day-grid-empty-message">No daily match data in this selection. Choose dates with completed matching results.</p>}
        <DayGridTooltip id={tooltipId} cell={tooltip?.cell||null} anchor={tooltip?.anchor||null} latestDay={closeDay}/>
    </section>;
}
export default DayGrid;
