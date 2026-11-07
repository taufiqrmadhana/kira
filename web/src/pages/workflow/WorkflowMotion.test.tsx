import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, render} from '@testing-library/react';
import {FlowConnector, StepTransition} from './WorkflowMotion';
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
const media=(reduced:boolean)=>vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener(){},removeEventListener(){}}));
it('shows flow dots only during real work and removes them for reduced motion',()=>{
 media(false);const view=render(<FlowConnector active/>);expect(view.container.querySelectorAll('.wf-flow-dot')).toHaveLength(3);
 view.rerender(<FlowConnector active={false}/>);expect(view.container.querySelector('.wf-flow-dot')).toBeNull();view.unmount();
 media(true);const reduced=render(<FlowConnector active/>);expect(reduced.container.querySelector('.wf-flow-dot')).toBeNull();
});
it('moves a step in the direction of travel and cancels obsolete animation',()=>{
 media(false);const cancel=vi.fn();const animate=vi.fn((_frames:Keyframe[],_options:KeyframeAnimationOptions)=>({cancel}));Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,value:animate});
 const view=render(<StepTransition step={1}><p>Upload</p></StepTransition>);expect(animate).not.toHaveBeenCalled();
 view.rerender(<StepTransition step={2}><p>Convert</p></StepTransition>);expect(animate.mock.calls[0][0][0]).toMatchObject({transform:'translateX(16px)'});
 view.rerender(<StepTransition step={1}><p>Upload</p></StepTransition>);expect(cancel).toHaveBeenCalled();expect(animate.mock.calls[1][0][0]).toMatchObject({transform:'translateX(-16px)'});
});
it('keeps step changes instant for reduced motion',()=>{
 media(true);const animate=vi.fn();Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,value:animate});
 const view=render(<StepTransition step={1}>Upload</StepTransition>);view.rerender(<StepTransition step={2}>Convert</StepTransition>);expect(animate).not.toHaveBeenCalled();
});
