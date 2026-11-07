import {expect,it} from 'vitest';
import {resumeStep,guardStep,intakeArea,validateFiles,guideTransition,type GuideSnapshot} from './engine';
const state=():GuideSnapshot=>({files:{pos:7,settlement:7,bank:7},converted:true,upload_rules_pending:[],cleaning:{open:0,rules_version:1},matching:{l1:{done:true},l2:{done:true}},recommendations:[]});
it('resumes from real files, conversion, rules, undecided or unsaved cleaning, both runs, and results',()=>{
 for(const [change,expected] of [
  [{files:{pos:0,settlement:0,bank:0}},1],[{files:{pos:7,settlement:0,bank:0}},2],[{files:{pos:7,settlement:7,bank:0}},3],
  [{converted:false},4],[{upload_rules_pending:['pos']},5],[{cleaning:{open:0,rules_version:null}},6],
  [{recommendations:[{id:'branch',decision:'accept'}]},6],[{matching:{l1:{done:false},l2:{done:false}}},7],
  [{matching:{l1:{done:true},l2:{done:false}}},8],[{},9],
 ] as [Partial<GuideSnapshot>,number][])expect(resumeStep({...state(),...change})).toBe(expected);
});
it('never allows a stale cursor to skip an unmet prerequisite, while intake remains explicit',()=>{
 expect(guardStep(8,{...state(),converted:false})).toBe(4);
 expect(guardStep(1,state())).toBe(1);expect(guardStep(0,state())).toBe(0);
 expect(guideTransition(4,{type:'refresh'},state())).toBe(4);
 expect(guideTransition(4,{type:'completed'}, {...state(),upload_rules_pending:['pos']})).toBe(5);
 expect(guideTransition(5,{type:'completed'}, {...state(),upload_rules_pending:['pos']})).toBe(5);
 expect(guideTransition(5,{type:'completed'},state())).toBe(6);
});
it('pause and resume use the saved real state without running a write',()=>{
 expect(guideTransition(6,{type:'pause'},state())).toBe(6);
 expect(guideTransition(0,{type:'resume'},{...state(),matching:{l1:{done:true},l2:{done:false}}})).toBe(8);
 expect([0,1,2,3,4,9].map(intakeArea)).toEqual([null,'pos','settlement','bank',null,null]);
});
it('rejects oversized and unsupported files before upload and preserves folder paths',()=>{
 expect(validateFiles([{file:{name:'data.exe',size:12} as File,folder:'oct'}])).toMatch(/CSV/);
 expect(validateFiles([{file:{name:'data.csv',size:10*1024*1024+1} as File,folder:'oct'}])).toMatch(/10 MB/);
 expect(validateFiles([{file:{name:'POS.csv',size:100} as File,folder:'October/day8'}])).toBe('');
});
