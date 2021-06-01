import { io } from "socket.io-client";
import { parentPort, workerData } from "worker_threads";
import { KarmaEvent } from "../karma/integration/karma-event";

const { socketPort, pingTimeout, pingInterval } = workerData;

const socket = io("http://localhost:" + socketPort + "/", {
  forceNew: true, 
  reconnection: true
});

const socketOptions = { pingTimeout, pingInterval };

Object.assign(socket, socketOptions);

parentPort?.on("message", (event: KarmaEvent) => {
  socket.emit(event.name, event);
});
