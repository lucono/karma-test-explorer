import { io } from 'socket.io-client';
import { parentPort, workerData } from 'worker_threads';

import { KarmaEvent } from '../runner/karma-event.js';
import { TestResultEmitterWorkerData } from './test-result-emitter-worker-data.js';

const initWorker = () => {
  if (!parentPort || !workerData) {
    return;
  }

  const messagePort = parentPort;
  const { socketPort, pingTimeout, pingInterval }: TestResultEmitterWorkerData = workerData;

  const socket = io('http://localhost:' + socketPort + '/', {
    forceNew: true,
    reconnection: true
  });

  const socketOptions = { pingTimeout, pingInterval };

  Object.assign(socket, socketOptions);

  messagePort.on('message', (event: KarmaEvent) => {
    socket.emit(event.name, event);
  });
};

initWorker();
