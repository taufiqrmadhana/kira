import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles.css';
import App from './App';
import {TourProvider} from './tour/TourProvider';
import { legacyHashRoute } from './lib/legacyHashRoute';
// Accept the demo kit's hash bookmarks while keeping native history routes.
const migratedRoute = legacyHashRoute(location.href);
if (migratedRoute) history.replaceState(null, '', migratedRoute);
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><TourProvider><App /></TourProvider></BrowserRouter></React.StrictMode>);
