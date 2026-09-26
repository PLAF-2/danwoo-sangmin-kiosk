import { createRoot } from 'react-dom/client';

import { createAppRuntime } from '../app/bootstrap';
import '../styles/global.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Renderer root element was not found');
}

const runtime = createAppRuntime();

createRoot(root).render(runtime.element);
