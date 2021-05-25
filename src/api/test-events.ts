import {
  TestEvent,
  TestSuiteEvent,
  TestRunFinishedEvent,
  TestRunStartedEvent,
  TestLoadStartedEvent,
  TestLoadFinishedEvent
} from "vscode-test-adapter-api";


export type TestRunEvent = TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent;

export type TestLoadEvent = TestLoadStartedEvent | TestLoadFinishedEvent;
