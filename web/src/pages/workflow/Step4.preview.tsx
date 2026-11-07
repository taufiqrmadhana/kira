import { createRoot } from 'react-dom/client';
import Step4 from './Step4';

const root = document.getElementById('root');
if (!root) throw new Error('Preview root is missing');
createRoot(root).render(<main><Step4 clientId={new URLSearchParams(location.search).get('client') ?? ''} userName="Nurwan" /></main>);
