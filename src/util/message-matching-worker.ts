import { Worker, WorkerOptions } from "worker_threads";
import { Disposable } from "../api/disposable";
import { Logger } from "../core/logger";
import { DeferredPromise } from "./deferred-promise";

export type MessageListener = (data: any) => void;

export interface WorkerMessage {
  messageId: string,
  data: any
};

export class MessageMatchingWorker implements Disposable {  // FIXME: Not currently used
  private readonly worker: Worker;
  private readonly openRequests: Map<string, DeferredPromise<any>> = new Map();
  private readonly messageListeners: Set<MessageListener> = new Set();

  public constructor(
    scriptFile: string,
    private readonly logger: Logger,
    workerOptions?: WorkerOptions)
  {
    this.worker = new Worker(scriptFile, workerOptions);
    this.worker.on(`message`, this.handleWorkerMessage.bind(this));
  }

  public async postMessage(data: any): Promise<any> {
    const messageId = this.generateMessageId();
    const workerRequest: WorkerMessage = { messageId, data };
    const deferredResponse = new DeferredPromise<any>();
    this.openRequests.set(messageId, deferredResponse);
    this.worker.postMessage(workerRequest);
    return deferredResponse.promise();
  }

  private handleWorkerMessage(workerMessage: WorkerMessage) {
    if (!workerMessage?.messageId || !this.openRequests.has(workerMessage.messageId)) {
      this.logger.warn(
        `Received new worker message ` + workerMessage?.messageId
          ? `with no message id `
          : `with unknown message id '${workerMessage.messageId}' ` +
        `- will pass through without matching`);

      this.messageListeners.forEach(listener => listener(workerMessage));
      return;
    }

    const deferredResponse = this.openRequests.get(workerMessage.messageId)!;
    this.openRequests.delete(workerMessage.messageId);
    deferredResponse.resolve(workerMessage.data);
  }

  public on(event: string, listener: MessageListener): this {
    event === `message`
      ? this.messageListeners.add(listener)
      : this.worker.on(event, listener);

    return this;
  }

  public off(event: string, listener: MessageListener): this {
    event === `message`
      ? this.messageListeners.delete(listener)
      : this.worker.off(event, listener);

    return this;
  }

  public terminate() {
    this.worker.terminate();
  }

  private generateMessageId() {
    return Math.random().toString(36).slice(2);
  }

  public dispose() {
    this.logger.dispose();
  }
}