import { MessagePort, parentPort, workerData } from "worker_threads";
import { Execution } from "../../../api/execution";
import { Log } from "../../../core/log";
import { Logger } from "../../../core/logger";
import { TestState } from "../../../core/test-state";
import { DeferredPromise } from "../../../util/deferred-promise";
import { WorkerMessage } from "../../../util/message-matching-worker";
import { KarmaEventListener, TestCapture } from "./karma-event-listener";
import { SpecCompleteResponse } from "./spec-complete-response";
import { TestResultReceiverWorkerData } from "./test-result-receiver-worker-data";
import { KarmaTestListenerWorkerResponseType, KarmaTestListenerTestStateResponse, KarmaTestListenerSpecCompleteResponse, KarmaTestListenerWorkerRequest, KarmaTestListenerWorkerRequestType, KarmaTestListenerStopRequest, KarmaTestListenerStoppedResponse, KarmaTestListenerStartListeningForTestsRequest, KarmaTestListenerTestCaptureResponse, KarmaTestListenerStopListeningForTestsRequest, KarmaTestListenerReceiveConnectionRequest, KarmaTestListenerConnectedResponse, KarmaTestListenerDisconnectedResponse } from "./test-result-receiver-worker-messages";
import { TestRunEventEmitter } from "./test-run-event-emitter";

// --- Post Message Event Emitter ---

class PostMessageTestRunEventEmitter implements TestRunEventEmitter {
  public constructor (private readonly workerPort: MessagePort) {}

  public emitTestStateEvent(testId: string, testState: TestState, testRunId?: string): void {
    const type = KarmaTestListenerWorkerResponseType.TestState;
    const testStateMessage: KarmaTestListenerTestStateResponse = { type, testId, testState }
    this.workerPort.postMessage(testStateMessage);
  }

  public emitTestResultEvent(testId: string, testResult: SpecCompleteResponse): void {
    const type = KarmaTestListenerWorkerResponseType.SpecComplete;
    const specCompleteMessage: KarmaTestListenerSpecCompleteResponse = { type, testId, testResult }
    this.workerPort.postMessage(specCompleteMessage);
  }
}







// --- Worker ---

const initWorker = () => {
  if (!parentPort || !workerData) {
    return;
  }

  const messagePort = parentPort;
  const { isDebugMode }: TestResultReceiverWorkerData = workerData;
  
  const log: Log = {
    info: process.stdout.write,
    debug: process.stdout.write,
    warn: process.stdout.write,
    error: process.stdout.write,
    dispose: () => {}
  };

  const logger: Logger = new Logger(log, `TestResultReceiverWorker`, isDebugMode);
  


  
  const testRunEventEmitter: TestRunEventEmitter = new PostMessageTestRunEventEmitter(messagePort);
  const karmaEventListener = new KarmaEventListener(testRunEventEmitter, logger);
  let stopListeningForTestsDeferred: DeferredPromise | undefined;

  
  messagePort.on(`message`, (workerMessage: WorkerMessage) => {
    const messageId: string = workerMessage.messageId;
    const requestMessage: KarmaTestListenerWorkerRequest = workerMessage.data;

    if (requestMessage.type === KarmaTestListenerWorkerRequestType.ReceiveConnection) {
      receiveKarmaConnection(messageId, requestMessage);

    } else if (requestMessage.type === KarmaTestListenerWorkerRequestType.StartListeningForTests) {
      startListeningForTests(messageId, requestMessage);

    } else if (requestMessage.type === KarmaTestListenerWorkerRequestType.StopListeningForTests) {
      stopListeningForTests(messageId, requestMessage);

    } else if (requestMessage.type === KarmaTestListenerWorkerRequestType.Stop) {
      stop(messageId, requestMessage);
    }
  });


  const stop = (messageId: string, requestMessage: KarmaTestListenerStopRequest) => {
    const futureStop: Promise<void> = karmaEventListener.stop();
    const stoppedMessage: KarmaTestListenerStoppedResponse = { type: KarmaTestListenerWorkerResponseType.Stopped };
    futureStop.then(() => messagePort.postMessage({ messageId, data: stoppedMessage }));
  };


  const startListeningForTests = (messageId: string, requestMessage: KarmaTestListenerStartListeningForTestsRequest) => {
    stopListeningForTestsDeferred ??= new DeferredPromise();

    const testExecution: Execution = {
      started: () => Promise.resolve(),
      ended: () => stopListeningForTestsDeferred!.promise()
    };

    const futureTestCapture: Promise<TestCapture> = karmaEventListener.listenForTests(testExecution, requestMessage.specs);

    futureTestCapture.then(testCapture => {
      const testCaptureMessage: KarmaTestListenerTestCaptureResponse = {
        type: KarmaTestListenerWorkerResponseType.TestCapture,
        testCapture
      };
      messagePort.postMessage({ messageId, data: testCaptureMessage });
    });
  };


  const stopListeningForTests = (messageId: string, requestMessage: KarmaTestListenerStopListeningForTestsRequest) => {
    stopListeningForTestsDeferred?.resolve();
    stopListeningForTestsDeferred = undefined;
  };


  const receiveKarmaConnection = (messageId: string, requestMessage: KarmaTestListenerReceiveConnectionRequest) => {
    const karmaConnection: Execution = karmaEventListener.receiveKarmaConnection(requestMessage.socketPort);

    karmaConnection.started().then(() => {
      const connectionEstablishedMessage: KarmaTestListenerConnectedResponse = {
        type: KarmaTestListenerWorkerResponseType.Connected
      };
      messagePort.postMessage({ messageId, data: connectionEstablishedMessage });
    });
    
    karmaConnection.ended().then(() => {
      const connectionEndedMessage: KarmaTestListenerDisconnectedResponse = {
        type: KarmaTestListenerWorkerResponseType.Disconnected
      };
      messagePort.postMessage({ messageId, data: connectionEndedMessage });
    });
  };
  
}

initWorker();
