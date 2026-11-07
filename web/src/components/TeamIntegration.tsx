import type { ComponentType } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Empty } from './index';
import { identity } from '../lib/api';
interface ChatProps {
    client: string;
    user: string;
    context: Record<string, string | number | boolean | null>;
    onDataChanged: (calls: unknown[], destination?: 2 | 3 | 4 | 'follow-up' | 'analysis') => void;
    onHighlight: (highlight: {
        keys: string[];
        note: string;
    }) => void;
    onUnauthorized: () => void;
}
// Teammate modules are mounted automatically when their files are merged. Their
// implementations remain under their owners' control; absent modules do not break builds.
const chatModules = import.meta.glob<{
    ChatPanel: ComponentType<ChatProps>;
}>('../kira/index.ts', { eager: true });
const workflowModules = import.meta.glob<{
    default?: ComponentType;
    Workflow?: ComponentType;
}>('../pages/workflow/{Workflow,WorkflowPage,index}.{tsx,ts}', { eager: true });
const step4Modules = import.meta.glob<{
    default?: ComponentType<Step4Props>;
    Step4?: ComponentType<Step4Props>;
}>('../pages/workflow/Step4.tsx', { eager: true });
interface Step4Props {
    clientId?: string;
    userName?: string;
    onDataChanged?: () => void;
    onOpenAnalysis?: () => void;
}
export const notifyDataChanged = () => window.dispatchEvent(new Event('kira:data-changed'));
export function ChatIntegration() {
    const location = useLocation(), navigate = useNavigate();
    const ChatPanel = Object.values(chatModules)[0]?.ChatPanel;
    if (!ChatPanel)
        return null;
    const params = new URLSearchParams(location.search), c = identity.client();
    const go = (path: string, extra: Record<string, string> = {}) => { const next = new URLSearchParams(extra); if (c)
        next.set('c', c); navigate(path + (next.size ? '?' + next : '')); };
    return <aside className="chat-dock" aria-label="Kira assistant"><ChatPanel client={c} user={identity.user()} context={{ page: location.pathname, tab: params.get('tab'), outlet: params.get('outlet'), date_from: params.get('date_from') || params.get('from'), date_to: params.get('date_to') || params.get('to') }} onDataChanged={(_calls, destination) => { notifyDataChanged(); if (typeof destination === 'number')
        go('/workflow', { step: String(destination) });
    else if (destination)
        go('/analysis', { tab: destination === 'follow-up' ? 'follow' : 'map' }); }} onHighlight={({ keys, note }) => go('/analysis', { tab: 'map', stage: 'l2', keys: keys.join(','), highlight: note })} onUnauthorized={() => navigate('/login')}/></aside>;
}
export function WorkflowIntegration() {
    const location = useLocation(), navigate = useNavigate();
    const workflow = Object.values(workflowModules)[0];
    const Workflow = workflow?.default || workflow?.Workflow;
    const step4 = Object.values(step4Modules)[0];
    const Step4 = step4?.default || step4?.Step4;
    if (Workflow)
        return <Workflow />;
    if (Step4 && new URLSearchParams(location.search).get('step') === '4')
        return <Step4 clientId={identity.client()} userName={identity.user()} onDataChanged={notifyDataChanged} onOpenAnalysis={() => navigate('/analysis' + (identity.client() ? '?c=' + encodeURIComponent(identity.client()) : ''))}/>;
    return <><div className="page-head"><div><h1>Workflow</h1><p>Upload, convert, clean, then match.</p></div></div><Empty title="Workflow screens are not available yet"><p>Your saved analysis stays available. Return here when upload and matching are connected.</p>{Step4 && <Link className="button primary" to={'/workflow?step=4' + (identity.client() ? '&c=' + encodeURIComponent(identity.client()) : '')}>Open matching</Link>}</Empty></>;
}
