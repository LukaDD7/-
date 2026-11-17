import React from 'react';
import {createRoot} from 'react-dom/client';
import Home from './components/teacher-workspace';
import Planner from './app/planner/page';
import './app/globals.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode>{location.pathname.startsWith('/planner')?<Planner/>:<Home/>}</React.StrictMode>);
