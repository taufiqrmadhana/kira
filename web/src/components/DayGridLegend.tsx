import type { RampStep } from './day-grid-model';
export function DayGridLegend({money,review,waiting,empty,latest,unavailable=false}:{money:boolean;review:boolean;waiting:boolean;empty:boolean;latest:boolean;unavailable?:boolean}) {
    const ramp: RampStep[]=['red','amber','healthy','good','strong','high'];
    return <div className="day-grid-legend" aria-label="How to read the day grid">
        <span className="day-grid-legend-ramp"><span aria-hidden="true" className="day-grid-swatches">{ramp.map(step=><i key={step} className={`day-grid-swatch day-grid-cell--${step}`}/>)}</span>low … high end-to-end match</span>
        {money && <span><i className="day-grid-legend-box" aria-hidden="true"><i className="day-grid-corner day-grid-corner--red"/></i>money to check</span>}
        {review && <span><i className="day-grid-legend-box" aria-hidden="true"><i className="day-grid-corner day-grid-corner--amber"/></i>needs review only</span>}
        {waiting && <span><i className="day-grid-legend-box" aria-hidden="true"><i className="day-grid-waiting"/></i>waiting for the bank</span>}
        {unavailable && <span><i className="day-grid-legend-box day-grid-cell--unavailable" aria-hidden="true"/>no POS rate</span>}
        {empty && <span><i className="day-grid-legend-box day-grid-empty" aria-hidden="true"/>no data</span>}
        {latest && <span><i className="day-grid-legend-box day-grid-latest" aria-hidden="true"/>latest close</span>}
        <span className="day-grid-threshold">below 95% is amber, below 80% red</span>
    </div>;
}
