import type { SVGProps } from 'react';

type Name = 'arrow' | 'close' | 'refresh' | 'check' | 'chat' | 'send' | 'plus';
const paths: Record<Name, string> = {
  arrow: 'M4 10h12m-5-5 5 5-5 5',
  close: 'm5 5 10 10M15 5 5 15',
  refresh: 'M16 7a6 6 0 1 0 0 6M16 3v4h-4',
  check: 'm4 10 4 4 8-8',
  chat: 'M5 4h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8l-5 3V6a2 2 0 0 1 2-2ZM7 8h6M7 11h4',
  send: 'M10 16V4m-5 5 5-5 5 5',
  plus: 'M10 4v12M4 10h12',
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: Name }) {
  return <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
