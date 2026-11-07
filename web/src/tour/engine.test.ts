import {describe,expect,it} from 'vitest';
import {autoDelay,moveIndex,resolveChatTour,prepareChapters,chapters} from './tours';
describe('read-only tour engine',()=>{
 it('moves forward and backward past missing targets',()=>{expect(moveIndex(0,1,5,new Set([1,2]))).toBe(3);expect(moveIndex(4,-1,5,new Set([2,3]))).toBe(1);expect(moveIndex(0,-1,5,new Set())).toBe(-1);});
 it('times autoplay according to the actual explanation',()=>{expect(autoDelay('Hello')).toBe(2790);});
 it('turns unreachable chapters into a useful locked step',()=>{const prepared=prepareChapters({files:{pos:0,settlement:0,bank:0},converted:false,upload_rules_pending:[],cleaning:{open:0,rules_version:null},matching:{l1:{done:false},l2:{done:false}}});const convert=prepared.find(c=>c.id==='convert')!;expect(convert.steps).toHaveLength(1);expect(convert.steps[0].target).toBe('workflow-step-2');expect(convert.steps[0].text).toContain('each have at least one file');});
 it('has eleven complete chapters and only read-only navigation actions',()=>{expect(chapters).toHaveLength(11);expect(chapters.every(c=>c.steps.length>0)).toBe(true);for(const chapter of chapters)for(const step of chapter.steps)expect(['open','click','close',undefined]).toContain(step.action?.kind);});
 it('recognizes English and Indonesian how-to requests without capturing ordinary data questions',()=>{expect(resolveChatTour('Gimana cara upload file?')).toBe('upload');expect(resolveChatTour('Show me how matching works')).toBe('match');expect(resolveChatTour('Give me a full tour')).toBe('full');expect(resolveChatTour('Show me how to use Kira')).toBe('kira');expect(resolveChatTour('Show me how to use Landing and clients')).toBe('landing');expect(resolveChatTour('Why is Harbor unmatched?')).toBeNull();});
});
