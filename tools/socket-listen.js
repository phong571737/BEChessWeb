import { io } from "socket.io-client";
const url = "http://localhost:8080";
const socket = io(url, { transports: ["websocket", "polling"] });
console.log('[test] connecting to', url);
socket.on('connect', () => console.log('[test] connected', socket.id));
socket.on('connect_error', (err) => console.error('[test] connect_error', err));
socket.onAny((ev, ...args) => console.log('[test] recv', ev, args));
// keep process alive
setInterval(() => {}, 1000);
