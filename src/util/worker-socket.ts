import { Server as HttpServer, createServer} from "http"
import { Server as SocketIOServer, ServerOptions, Socket} from "socket.io"
import { MessagePort, parentPort, workerData } from "worker_threads";
import * as express from "express"
import { Logger } from "../core/logger";
import { Log } from "../core/log";

export enum SocketEventType {
  Connect = "connect",
  Disconnect = "disconnect",
  Listen = "Listen",
  Data = "Data"
}

export interface SocketMessage {
  type: SocketEventType;
  event: string;
  data?: any;
}

export class WorkerSocket {
  private server: HttpServer | undefined;
  private readonly sockets: Set<Socket> = new Set();

  public constructor(
    private readonly messagePort: MessagePort,
    private readonly pingTimeout: number,
    private readonly pingInterval: number,
    private readonly logger: Logger)
  {}

  public async connect(socketPort: number) {
    await this.reset();

    const app = express();
    const server = createServer(app);
    this.server = server;

    const socketServerOptions = {
      pingInterval: this.pingInterval,
      pingTimeout: this.pingTimeout
    } as ServerOptions;

    const io = new SocketIOServer(server, socketServerOptions);
    
    io.on("connection", (socket) => {
      this.sockets.add(socket);
      this.setupSocket(socket);

      const connectMessage: SocketMessage = {
        type: SocketEventType.Connect,
        event: SocketEventType.Connect
      };
      this.logger.debug(() => `Worker socket sending new message: ${JSON.stringify(connectMessage, null, 2)}`);
      this.messagePort.postMessage(connectMessage);
    });

    server.listen(socketPort, () => {
      const listenMessage: SocketMessage = {
        type: SocketEventType.Listen,
        event: SocketEventType.Listen
      };
      this.logger.debug(() => `Worker socket sending new message: ${JSON.stringify(listenMessage, null, 2)}`);
      this.messagePort.postMessage(listenMessage);
    });

    server.on("close", () => {
      this.server = undefined;
      this.messagePort.postMessage('close');
    });
  }

  private setupSocket(socket: Socket) {

    socket.onAny((event: string, data: any) => {
      if (event === SocketEventType.Disconnect) {
        this.onDisconnect(socket, data);
        return;
      }
      const socketMessage: SocketMessage = { type: SocketEventType.Data, event, data };
      this.logger.debug(() => `Worker socket sending new message: ${JSON.stringify(socketMessage, null, 2)}`);
      this.messagePort.postMessage(socketMessage);
    });
  }

  private onDisconnect(socket: Socket, disconnectReason: string) {
    socket.removeAllListeners();
    this.sockets.delete(socket);

    const disconnectMessage: SocketMessage = {
      type: SocketEventType.Disconnect,
      event: 'disconnect',
      data: disconnectReason
    };
    this.logger.debug(() => `Worker socket sending new message: ${JSON.stringify(disconnectMessage, null, 2)}`);
    this.messagePort.postMessage(disconnectMessage);
  }
  
  private async reset(): Promise<void> {
    if (!this.server) {
      return;
    }
    const server = this.server!;

    return new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          this.logger.error(`Failed closing karma listener connection: ${error.message}`);
          reject();
          return;
        }
        this.logger.info(`Done closing karma listener connection`);
        resolve();
      });
      this.cleanupConnections();
    });
  }

  private cleanupConnections() {
    this.logger.info(`Karma Event Listener: Cleaning up connections`);
    try {
      this.sockets.forEach(socket => {
        socket.removeAllListeners();
        socket.disconnect(true);
      });
      
      this.sockets.clear();

    } catch (error) {
      this.logger.error(`Failure closing connection with karma: ${error}`);
    }
  }
}


const initWorker = () => {
  if (!parentPort || !workerData) {
    return;
  }

  const log: Log = {
    info: global.console.log,
    debug: global.console.log,
    warn: global.console.log,
    error: global.console.log,
    dispose: () => {}
  };

  const { pingTimeout, pingInterval, isDebugMode } = workerData;
  const logger: Logger = new Logger(log, `TestResultReceiverWorker`, isDebugMode);
  
  const workerSocket = new WorkerSocket(parentPort, pingTimeout, pingInterval, logger);

  parentPort.on('message', (message: SocketMessage) => {
    if (message.type === SocketEventType.Connect) {
      const socketPort: number = message.data!;
      workerSocket.connect(socketPort);
    }
  });
};

initWorker();
