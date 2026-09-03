import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Opcional: si tienes un archivo de estilos globales generado por Vite
// import './index.css'; 

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
} else {
  console.error("No se encontró el elemento con id 'root' en el index.html");
}