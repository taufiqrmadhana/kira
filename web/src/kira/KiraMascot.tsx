/** Small local vector mascot: no image request or animation library is needed. */
export function KiraMascot({busy = false}: {busy?: boolean}) {
  return <svg className={`kira-mascot${busy ? ' is-thinking' : ''}`} viewBox="0 0 80 80" width="64" height="64" aria-hidden="true" focusable="false">
    <path className="kira-mascot-tail" d="M57 60c16 1 19-14 12-19-5-4-10 2-6 5 4 4-1 8-7 7" fill="var(--palette-a8c783)" stroke="var(--color-green)" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M22 47c-6 9-5 21 2 24 6 3 26 3 32-1 5-4 3-17-2-23" fill="var(--color-green)"/>
    <ellipse cx="39" cy="62" rx="12" ry="10" fill="var(--color-lime)"/>
    <path d="M16 35 14 14c0-3 2-4 5-2l15 10m14-1 14-12c3-2 5 0 4 3l-2 25" fill="var(--color-green)" stroke="var(--color-dark)" strokeWidth="2" strokeLinejoin="round"/>
    <path d="m19 19 2 12 8-7m29-5-8 7 10 5" fill="var(--color-lime)"/>
    <path d="M13 38c0-15 11-21 27-21s27 8 27 22c0 16-12 25-27 25S13 55 13 38" fill="var(--color-green)"/>
    <path d="M22 32c5-4 11-1 18 4 7-5 13-8 18-4 10 7 6 24-18 25-24-1-28-18-18-25" fill="var(--palette-f5f8ed)"/>
    <g className="kira-mascot-eyes" fill="var(--color-dark)">
      <ellipse cx="29" cy="41" rx="3.8" ry="5"/><ellipse cx="51" cy="41" rx="3.8" ry="5"/>
      <circle cx="30" cy="39.5" r="1.25" fill="white"/><circle cx="52" cy="39.5" r="1.25" fill="white"/>
    </g>
    <path d="m37 47 3 2 3-2m-3 2v2m0 0c-3 3-6 1-6 0m6 0c3 3 6 1 6 0" fill="none" stroke="var(--color-green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path className="kira-mascot-leaf" d="M39 20c-2-9 1-15 12-15 0 9-5 14-12 15" fill="var(--palette-b7d991)" stroke="var(--palette-638b49)" strokeWidth="1.5"/>
    <path d="m39 20 7-10" fill="none" stroke="var(--palette-638b49)" strokeWidth="1.5" strokeLinecap="round"/>
    <ellipse cx="27" cy="70" rx="7" ry="4" fill="var(--palette-a8c783)"/><ellipse cx="50" cy="70" rx="7" ry="4" fill="var(--palette-a8c783)"/>
  </svg>;
}
