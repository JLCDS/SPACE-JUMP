// test-client.js
// Cliente de prueba para escuchar eventos de ronda por WebSocket

const { io } = require('socket.io-client');

// Cambia la URL si usas Nginx (por ejemplo, http://localhost:8080)
const URL = 'http://localhost:3001';

const socket = io(URL, {
  path: '/socket.io/',
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('Conectado al backend:', URL);
});

socket.on('hello', (msg) => {
  console.log('Mensaje de bienvenida:', msg);
});

socket.on('round:update', (data) => {
  console.log('[round:update]', data);
});

socket.on('round:crash', (data) => {
  console.log('[round:crash]', data);
});

socket.on('disconnect', (reason) => {
  console.log('Desconectado:', reason);
});
