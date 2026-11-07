import {expect,it} from 'vitest';
import {contextLabel,screenContext,suggestions} from './context';
it('sends the same exact screen selection displayed to the person',()=>{
 const context=screenContext('/analysis','?tab=map&stage=l2&outlet=Harbor&date_from=2026-10-24&date_to=2026-10-24&keys=A,B',{guided_step:'Cleaning'});
 expect(context).toMatchObject({page:'Match analysis',tab:'map',stage:'l2',outlet:'Harbor',selected_record_keys:'A,B',tutorial:null});
 expect(contextLabel(context)).toContain('Settlement → Bank: Harbor: Sat 24 Oct 2026');
});
it('builds English suggestions from real data without inventing an amount',()=>{
 expect(suggestions({page:'Overview'},{lowest:{outlet:'Harbor',rate:0}})[0]).toBe('Why is Harbor at 0%?');
 expect(suggestions({page:'Match analysis'})[3]).toBe('Explain the money differences');
 expect(suggestions({page:'Match analysis'},{toCheck:1000})[3]).toContain('Rp 1.000');
});
