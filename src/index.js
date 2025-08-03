// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';         // Optional: your global styles
import App from './App';      // Your main React component

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
