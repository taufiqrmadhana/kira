import {useRef, useState, type KeyboardEvent} from 'react';
import {Link} from 'react-router-dom';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import {Button} from '../../components';
import {clientPath} from '../../lib/api';
import {count, date, percent} from '../../lib/format';

export interface DayResult {pos:number; matched:number}
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monthName = (month:string) => new Intl.DateTimeFormat('en-GB', {month:'long', year:'numeric',timeZone:'UTC'}).format(new Date(month + '-01T12:00:00Z'));

function monthDates(month:string) {
  const [year, number] = month.split('-').map(Number);
  const offset = (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({length:Math.ceil((offset + length) / 7) * 7}, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= length ? `${month}-${String(day).padStart(2,'0')}` : '';
  });
}

export default function MonthCalendar({byDay, latestDay, closes = []}:{byDay:Record<string,DayResult>; latestDay?:string; closes?:{at:string}[]}) {
  const [month, setMonth] = useState(() => latestDay?.slice(0,7) || new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7));
  const [focusedDay, setFocusedDay] = useState(latestDay || '');
  const anchors = useRef(new Map<string, HTMLAnchorElement>());
  const cells = monthDates(month);
  const evidenceDays = cells.filter(day => byDay[day] !== undefined);
  const activeDay = evidenceDays.includes(focusedDay) ? focusedDay : evidenceDays.at(-1);
  const totals = evidenceDays.reduce((sum, day) => ({pos:sum.pos + byDay[day].pos, matched:sum.matched + byDay[day].matched}), {pos:0, matched:0});
  const closeCount = closes.filter(close => close.at.slice(0,7) === month).length;
  const title = monthName(month);

  function moveMonth(delta:number) {
    const [year, number] = month.split('-').map(Number);
    setMonth(new Date(Date.UTC(year,number - 1 + delta,1)).toISOString().slice(0,7));
  }

  function moveFocus(event:KeyboardEvent<HTMLAnchorElement>, day:string) {
    const index = evidenceDays.indexOf(day);
    const cell = cells.indexOf(day);
    let target: string | undefined;
    if(event.key === 'ArrowLeft') target = evidenceDays[Math.max(0,index - 1)];
    if(event.key === 'ArrowRight') target = evidenceDays[Math.min(evidenceDays.length - 1,index + 1)];
    if(event.key === 'Home' || event.key === 'End') {
      const week = cells.slice(Math.floor(cell / 7) * 7,Math.floor(cell / 7) * 7 + 7).filter(value => byDay[value] !== undefined);
      target = event.key === 'Home' ? week[0] : week.at(-1);
    }
    if(event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const step = event.key === 'ArrowUp' ? -7 : 7;
      for(let next=cell + step; next >= 0 && next < cells.length; next += step) {
        if(byDay[cells[next]] !== undefined) {target = cells[next]; break;}
      }
    }
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) event.preventDefault();
    if(target) {setFocusedDay(target); anchors.current.get(target)?.focus();}
  }

  return <section className="overview-history" aria-labelledby="overview-history-title">
    <div className="overview-history-head">
      <div><h2 id="overview-history-title">History</h2><p>Match rate by sales date: POS sales reconciled through both stages with no unexplained amount differences.</p></div>
      <div className="overview-month-nav">
        <Button variant="quiet" aria-label="Previous month" onClick={() => moveMonth(-1)}><ChevronLeft size={17}/></Button>
        <h3 aria-live="polite">{title}</h3>
        <Button variant="quiet" aria-label="Next month" onClick={() => moveMonth(1)}><ChevronRight size={17}/></Button>
      </div>
    </div>
    <div className="overview-history-meta">
      <p>{closeCount > 0 && <span><strong>{count(closeCount)}</strong> {closeCount === 1 ? 'close' : 'closes'}</span>}<span><strong>{count(totals.pos)}</strong> POS sales</span><span><strong>{percent(totals.pos ? totals.matched / totals.pos * 100 : null)}</strong> matched this month</span></p>
      <ul className="overview-calendar-legend" aria-label="Match rate thresholds">
        <li><i className="green"/>≥ 95%</li><li><i className="amber"/>80–95%</li><li><i className="red"/>&lt; 80%</li><li><i className="missing"/>No data</li>
      </ul>
    </div>
    <div className="overview-calendar-scroll">
      <div className="overview-calendar" role="grid" aria-label={`Match history for ${title}`}>
        <div className="overview-calendar-week overview-calendar-weekdays" role="row">{weekdays.map(day => <div role="columnheader" key={day}>{day}</div>)}</div>
        {Array.from({length:cells.length / 7}, (_, week) => <div className="overview-calendar-week" role="row" key={week}>
          {cells.slice(week * 7,week * 7 + 7).map((day,index) => {
            const value = byDay[day];
            const rate = value?.pos ? value.matched / value.pos * 100 : null;
            const tone = rate === null ? 'neutral' : rate >= 95 ? 'green' : rate >= 80 ? 'amber' : 'red';
            const label = !value ? `${date(day)}: No data` : `${date(day)}: ${rate === null ? 'No POS sales' : `${percent(rate)} matched, ${count(value.matched)} of ${count(value.pos)} POS sales`}. Open Match analysis.`;
            return <div role="gridcell" key={day || `blank-${index}`} className={day ? '' : 'overview-calendar-blank'}>
              {!day ? null : value ? <Link
                to={clientPath('/analysis?' + new URLSearchParams({date_from:day,date_to:day}).toString())}
                className={`overview-calendar-day overview-day-${tone}${day === latestDay ? ' overview-day-latest' : ''}`}
                aria-label={label} tabIndex={day === activeDay ? 0 : -1}
                onFocus={() => setFocusedDay(day)} onKeyDown={event => moveFocus(event,day)}
                ref={element => {if(element) anchors.current.set(day,element); else anchors.current.delete(day);}}
              ><span className="overview-day-number">{Number(day.slice(-2))}</span><strong>{percent(rate)}</strong><span className="overview-day-count">{rate === null ? 'No POS sales' : `${count(value.matched)}/${count(value.pos)}`}</span></Link>
                : <div className="overview-calendar-day overview-day-missing" aria-label={label}><span className="overview-day-number">{Number(day.slice(-2))}</span><span className="sr-only">No data</span></div>}
            </div>;
          })}
        </div>)}
      </div>
    </div>
    <p className="overview-calendar-summary">{totals.pos ? `${count(totals.matched)} of ${count(totals.pos)} POS sales reconciled end to end in ${title}. Select a day to see its evidence.` : `No reconciled POS sales in ${title}.`}</p>
  </section>;
}
