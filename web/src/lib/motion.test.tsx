import {act, cleanup, renderHook} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {useAnimatedNumber, useReducedMotion, useReveal} from './motion';

afterEach(() => {cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
function preference(reduce: boolean) {
  const listeners = new Set<() => void>();
  const media = {matches:reduce, addEventListener:(_type:string,listener:()=>void)=>listeners.add(listener), removeEventListener:(_type:string,listener:()=>void)=>listeners.delete(listener)};
  vi.stubGlobal('matchMedia', () => media);
  return (next:boolean) => {media.matches=next;listeners.forEach(fn=>fn());};
}
it('uses the actual final value immediately with reduced motion and responds to preference changes', () => {
  const set=preference(true);
  const {result,rerender}=renderHook(({value})=>({value:useAnimatedNumber(value),reduce:useReducedMotion()}),{initialProps:{value:8639}});
  expect(result.current.value).toBe(8639);
  rerender({value:8784});expect(result.current.value).toBe(8784);
  act(()=>set(false));expect(result.current.reduce).toBe(false);
});
it('interpolates real values and settles exactly at the latest target when interrupted', () => {
  vi.useFakeTimers();preference(false);
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>setTimeout(()=>cb(performance.now()),16));
  vi.stubGlobal('cancelAnimationFrame',clearTimeout);
  const {result,rerender}=renderHook(({value})=>useAnimatedNumber(value,{duration:300}),{initialProps:{value:100}});
  act(()=>vi.advanceTimersByTime(160));
  expect(result.current).toBeGreaterThan(0);expect(result.current).toBeLessThan(100);
  rerender({value:40});act(()=>vi.advanceTimersByTime(350));expect(result.current).toBe(40);
});
it('does not animate when a caller disables the reveal for refetches', () => {
  preference(false);
  const {result}=renderHook(()=>useAnimatedNumber(99.97,{enabled:false}));
  expect(result.current).toBe(99.97);
});

it('cancels a route reveal when navigation interrupts it and skips reveals for reduced motion',()=>{
  const set=preference(false),cancel=vi.fn();
  const element=document.createElement('div');element.animate=vi.fn(()=>({cancel}) as unknown as Animation);
  const ref={current:element};
  const {rerender}=renderHook(({route})=>useReveal(ref,route),{initialProps:{route:'/overview'}});
  expect(element.animate).toHaveBeenCalledTimes(1);
  rerender({route:'/analysis'});expect(cancel).toHaveBeenCalledTimes(1);
  act(()=>set(true));rerender({route:'/insights'});expect(element.animate).toHaveBeenCalledTimes(2);
});
