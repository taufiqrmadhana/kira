import { Fragment, type ReactNode } from 'react';
import { safeLink } from './protocol';

// Deliberately render a small Markdown subset as React nodes. Raw HTML stays text.
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\)|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link && safeLink(link[2])) return <a key={index} href={safeLink(link[2])!} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith('```')) {
      const code: string[] = [];
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
      blocks.push(<pre key={i}><code>{code.join('\n')}</code></pre>);
    } else if (/^#{1,6} /.test(line)) {
      blocks.push(<p className="kira-markdown-heading" key={i}>{inline(line.replace(/^#{1,6} /, ''))}</p>);
    } else if (/^\s*([-*]|\d+\.) /.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: ReactNode[] = [];
      const pattern = ordered ? /^\s*\d+\. / : /^\s*[-*] /;
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(<li key={i}>{inline(lines[i].replace(pattern, ''))}</li>);
        i++;
      }
      i--;
      blocks.push(ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>);
    } else if (line.startsWith('> ')) {
      blocks.push(<blockquote key={i}>{inline(line.slice(2))}</blockquote>);
    } else {
      blocks.push(<p key={i}>{inline(line)}</p>);
    }
  }
  return <div className="kira-markdown">{blocks}</div>;
}
