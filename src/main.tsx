import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthPage } from './pages/AuthPage';
import { useServer } from './server';
import './index.css';

function Root() {
  const { phase, boot } = useServer();
  useEffect(() => {
    boot();
  }, [boot]);
  if (phase === 'detecting') return null;
  if (phase === 'setup' || phase === 'login') return <AuthPage mode={phase} />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
