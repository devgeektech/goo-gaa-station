/**
 * Quick Socket.IO connection test.
 * Run from apps/api: pnpm run test:socket   or   node scripts/test-socket.js
 * Ensure the API server is running first (pnpm dev).
 */
const { io } = require('socket.io-client');

const URL = process.env.SOCKET_URL || 'http://localhost:5000';

console.log('Connecting to', URL, '...');
const socket = io(URL, {
  transports: ['websocket', 'polling'],
  withCredentials: true,
});

socket.on('connect', () => {
  console.log('OK – Socket connected. id:', socket.id);
  console.log('Check the API server terminal for: Client connected:', socket.id);
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
  process.exitCode = 1;
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

// Close after a few seconds
setTimeout(() => {
  console.log('Closing connection...');
  socket.close();
  setTimeout(() => process.exit(0), 500);
}, 3000);
