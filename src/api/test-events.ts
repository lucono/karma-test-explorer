import {
	TestEvent,
	TestSuiteEvent,
	TestRunFinishedEvent,
	TestRunStartedEvent,
	TestLoadStartedEvent,
	TestLoadFinishedEvent
} from 'vscode-test-adapter-api';

export type TestLoadEvent = TestLoadStartedEvent | TestLoadFinishedEvent;

export type TestRunEvent = TestRunStartedEvent | TestRunFinishedEvent;

export type TestResultEvent = TestEvent | TestSuiteEvent;
