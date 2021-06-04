
// --- Request Types ---

import { TestState } from "../../../core/test-state";
import { TestCapture } from "./karma-event-listener";
import { SpecCompleteResponse } from "./spec-complete-response";

export enum KarmaTestListenerWorkerRequestType {
  ReceiveConnection = "ReceiveConnection",
  StartListeningForTests = "StartListeningForTests",
  StopListeningForTests = "StopListeningForTests",
  Stop = "Stop"
}

export interface KarmaTestListenerReceiveConnectionRequest {
  type: KarmaTestListenerWorkerRequestType.ReceiveConnection;
  socketPort: number;
}

export interface KarmaTestListenerStartListeningForTestsRequest {
  type: KarmaTestListenerWorkerRequestType.StartListeningForTests;
  specs: string[];
}

export interface KarmaTestListenerStopListeningForTestsRequest {
  type: KarmaTestListenerWorkerRequestType.StopListeningForTests;
}

export interface KarmaTestListenerStopRequest {
  type: KarmaTestListenerWorkerRequestType.Stop;
}

export type KarmaTestListenerWorkerRequest = 
  KarmaTestListenerReceiveConnectionRequest |
  KarmaTestListenerStartListeningForTestsRequest |
  KarmaTestListenerStopListeningForTestsRequest |
  KarmaTestListenerStopRequest;

// --- Response Types ---

export enum KarmaTestListenerWorkerResponseType {
  SpecComplete = "SpecComplete",
  TestState = "TestState",
  TestCapture = "TestCapture",
  Connected = "Connected",
  Disconnected = "Disconnected",
  Stopped = "Stopped"
}

export interface KarmaTestListenerSpecCompleteResponse {
  type: KarmaTestListenerWorkerResponseType.SpecComplete;
  testId: string;
  testResult: SpecCompleteResponse;
}

export interface KarmaTestListenerTestStateResponse {
  type: KarmaTestListenerWorkerResponseType.TestState;
  testId: string;
  testState: TestState;
}

export interface KarmaTestListenerTestCaptureResponse {
  type: KarmaTestListenerWorkerResponseType.TestCapture;
  testCapture: TestCapture;
}

export interface KarmaTestListenerConnectedResponse {
  type: KarmaTestListenerWorkerResponseType.Connected;
}

export interface KarmaTestListenerDisconnectedResponse {
  type: KarmaTestListenerWorkerResponseType.Disconnected;
}

export interface KarmaTestListenerStoppedResponse {
  type: KarmaTestListenerWorkerResponseType.Stopped;
}

export type KarmaTestListenerWorkerResponse = 
  KarmaTestListenerSpecCompleteResponse |
  KarmaTestListenerTestStateResponse |
  KarmaTestListenerTestCaptureResponse |
  KarmaTestListenerConnectedResponse |
  KarmaTestListenerDisconnectedResponse |
  KarmaTestListenerStoppedResponse;
