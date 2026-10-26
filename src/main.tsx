import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { FeedbackHost } from './components/feedback';
import { AuthPage } from './pages/AuthPage';
import { useServer } from './server';
import './index.css';

function Root() {
  const { phase, boot } = useServer();
  useEffect(() => {
    boot();
  }, [boot]);
  if (phase === 'detecting') return null;
  return (
    <>
      {phase === 'setup' || phase === 'login' ? <AuthPage mode={phase} /> : <App />}
      <FeedbackHost />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
