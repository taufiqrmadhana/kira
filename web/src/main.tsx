import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles.css';
import App from './App';
// Accept the demo kit's hash bookmarks while keeping native history routes.
if (location.hash.startsWith('#/'))
    history.replaceState(null, '', location.hash.slice(1));
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>);
