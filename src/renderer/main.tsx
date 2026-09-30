import { createRoot } from 'react-dom/client';

import { createAppRuntime } from '../app/bootstrap';
import { createAppRouter } from '../app/router';
import { createWebKioskApi } from '../services/webKioskApi';
import '../styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('Renderer root element was not found');

createRoot(root).render(createAppRuntime(createAppRouter, createWebKioskApi(fetch)).element);
