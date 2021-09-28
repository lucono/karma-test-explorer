import {
  TestEvent,
  TestLoadFinishedEvent,
  TestLoadStartedEvent,
  TestRunFinishedEvent,
  TestRunStartedEvent,
  TestSuiteEvent
} from 'vscode-test-adapter-api';

export type TestLoadEvent = TestLoadStartedEvent | TestLoadFinishedEvent;

export type TestRunEvent = TestRunStartedEvent | TestRunFinishedEvent;

export type TestResultEvent = TestEvent | TestSuiteEvent;
