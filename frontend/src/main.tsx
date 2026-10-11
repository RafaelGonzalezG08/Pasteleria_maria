import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Un 401/404 no se arregla reintentando -- solo vale la pena insistir
      // cuando la peticion ni siquiera llego a la PC (WiFi cortada un
      // instante, la PC durmiendose), que es justo cuando axios no trae
      // "response" en el error.
      retry: (fallas, error: any) => (error?.response ? false : fallas < 3),
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: { fontSize: '13px', borderRadius: '8px' },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
);
