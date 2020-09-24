import { TestExplorerConfiguration } from "../../src/model/test-explorer-configuration";
import { KarmaTestExplorer } from "../../src/core/karma-test-explorer";
import { KarmaEventListener } from "../../src/core/integration/karma-event-listener";
import { KarmaServer } from "../../src/core/karma/karma-server";
import { KarmaRunner } from "../../src/core/karma/karma-runner";
import { Logger } from "../../src/core/helpers/logger";
import * as expectedTests from "../../__mocks__/expectedTests.mock";

jest.mock("../../src/core/integration/karma-event-listener");
jest.mock("../../src/core/karma/karma-server");
jest.mock("../../src/core/karma/karma-runner");
jest.mock("../../src/core/helpers/logger");

let karmaRunner: jest.Mocked<KarmaRunner>;
let karmaServer: jest.Mocked<KarmaServer>;
let karmaEventListener: jest.Mocked<KarmaEventListener>;
let logger: jest.Mocked<Logger>;
let testExplorerConfiguration: TestExplorerConfiguration;

beforeEach(() => {
  karmaRunner = new (KarmaRunner as any)() as any;
  karmaEventListener = new (KarmaEventListener as any)() as any;
  karmaServer = new (KarmaServer as any)() as any;
  logger = new (Logger as any)() as any;
  testExplorerConfiguration = {
    projectRootPath: "",
    defaultSocketConnectionPort: 2000,
    userKarmaConfFilePath: "",
  } as TestExplorerConfiguration;
});

test("loadTests should return a valid set of tests if its the first run", async () => {
  // Arrange
  karmaRunner.isKarmaRunning.mockReturnValue(false);
  karmaServer.start.mockResolvedValue("");
  karmaRunner.loadTests.mockResolvedValue(expectedTests.mock);
  const karmaTestExplorer = new KarmaTestExplorer(karmaRunner, logger, karmaServer, karmaEventListener);

  // Act
  const loadedTests = await karmaTestExplorer.loadTests(testExplorerConfiguration);

  // Assert
  expect(loadedTests.label).toBeDefined();
  expect(loadedTests.children).toBeDefined();
  expect(karmaServer.stop).toBeCalledTimes(0);
  expect(karmaServer.start).toBeCalledTimes(1);
});

test("loadTests should return a valid set of tests if its the reload run", async () => {
  // Arrange
  karmaRunner.isKarmaRunning.mockReturnValue(true);
  karmaServer.start.mockResolvedValue("");
  karmaRunner.loadTests.mockResolvedValue(expectedTests.mock);
  const karmaTestExplorer = new KarmaTestExplorer(karmaRunner, logger, karmaServer, karmaEventListener);

  // Act
  const loadedTests = await karmaTestExplorer.loadTests(testExplorerConfiguration);

  // Assert
  expect(loadedTests.label).toBeDefined();
  expect(loadedTests.children).toBeDefined();
  expect(karmaServer.stopAsync).toBeCalledTimes(1);
  expect(karmaServer.start).toBeCalledTimes(1);
});

test("runTests should be called only once with the correct sent tests name", async () => {
  // Arrange
  karmaRunner.runTests.mockResolvedValue();
  karmaEventListener.runCompleteEvent = { results: [] };
  const karmaTestExplorer = new KarmaTestExplorer(karmaRunner, logger, karmaServer, karmaEventListener);
  const fakeTests = ["fakeTests"];

  // Act
  await karmaTestExplorer.runTests(fakeTests, true);

  // Assert
  expect(karmaRunner.runTests).toBeCalledWith(fakeTests, true);
  expect(karmaRunner.runTests).toBeCalledTimes(1);
});

test("stopCurrentRun should stop server if server karma server is running", async () => {
  // Arrange
  karmaRunner.isKarmaRunning.mockReturnValue(true);
  karmaEventListener.runCompleteEvent = { results: [] };
  const karmaTestExplorer = new KarmaTestExplorer(karmaRunner, logger, karmaServer, karmaEventListener);

  // Act
  await karmaTestExplorer.stopCurrentRun();

  // Assert
  expect(karmaServer.stopAsync).toBeCalledTimes(1);
});

test("stopCurrentRun should not stop server if server karma server is not running", async () => {
  // Arrange
  karmaRunner.isKarmaRunning.mockReturnValue(false);
  karmaEventListener.runCompleteEvent = { results: [] };
  const karmaTestExplorer = new KarmaTestExplorer(karmaRunner, logger, karmaServer, karmaEventListener);

  // Act
  await karmaTestExplorer.stopCurrentRun();

  // Assert
  expect(karmaServer.stopAsync).toBeCalledTimes(0);
});

test("dispose should stop server if server karma server is running", async () => {
  // Arrange
  karmaRunner.isKarmaRunning.mockReturnValue(true);
  karmaEventListener.runCompleteEvent = { results: [] };
  const karmaTestExplorer = new KarmaTestExplorer(karmaRunner, logger, karmaServer, karmaEventListener);

  // Act
  await karmaTestExplorer.dispose();

  // Assert
  expect(karmaServer.stop).toBeCalledTimes(1);
});

test("dispose should not stop server if server karma server is not running", async () => {
  // Arrange
  karmaRunner.isKarmaRunning.mockReturnValue(false);
  karmaEventListener.runCompleteEvent = { results: [] };
  const karmaTestExplorer = new KarmaTestExplorer(karmaRunner, logger, karmaServer, karmaEventListener);

  // Act
  await karmaTestExplorer.dispose();

  // Assert
  expect(karmaServer.stop).toBeCalledTimes(0);
});
