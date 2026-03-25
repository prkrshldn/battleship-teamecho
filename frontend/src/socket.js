import { io } from "socket.io-client";

const URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:9999";

export const socket = io(URL, {
	withCredentials: true,
	autoConnect: false,
});

let connectInFlight = null;

export function connectSocket() {
	if (socket.connected) return Promise.resolve(socket);
	if (connectInFlight) return connectInFlight;

	connectInFlight = new Promise((resolve, reject) => {
		const onConnect = () => {
			cleanup();
			resolve(socket);
		};

		const onError = (err) => {
			cleanup();
			reject(err instanceof Error ? err : new Error("Socket connection failed"));
		};

		const cleanup = () => {
			socket.off("connect", onConnect);
			socket.off("connect_error", onError);
			connectInFlight = null;
		};

		socket.on("connect", onConnect);
		socket.on("connect_error", onError);
		socket.connect();
	});

	return connectInFlight;
}

export function disconnectSocket() {
	if (socket.connected) {
		socket.disconnect();
	}
}
