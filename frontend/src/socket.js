import { io } from 'socket.io-client';

const URL = 'http://localhost:9999'; // Backend URL
export const socket = io(URL);
