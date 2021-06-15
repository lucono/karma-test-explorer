import { workspace, extensions, ExtensionContext } from "vscode";
import { TestHub, testExplorerExtensionId } from "vscode-test-adapter-api";
import { Log, TestAdapterRegistrar } from "vscode-test-adapter-util";
import { Adapter } from "./adapter";

const CONFIG_PREFIX = "karmaTestExplorer";
const OUTPUT_CHANNEL_NAME = "Karma Test Explorer";
const testExplorerAdapters: Adapter[] = [];

export async function activate(context: ExtensionContext) {
  const workspaceFolder = (workspace.workspaceFolders ?? [])[0];
  // create a simple logger that can be configured with the configuration variables
  // `karmaExplorer.logpanel` and `karmaExplorer.logfile`
  const logger = new Log(CONFIG_PREFIX, workspaceFolder, OUTPUT_CHANNEL_NAME);
  context.subscriptions.push(logger);

  // get the Test Explorer extension
  const testExplorerExtension = extensions.getExtension<TestHub>(testExplorerExtensionId);
  logger.info(`Test Explorer ${testExplorerExtension ? "" : "not "}found`);

  if (testExplorerExtension) {
    const testHub = testExplorerExtension.exports;

    // this will register a KarmaTestAdapter for each WorkspaceFolder
    context.subscriptions.push(
      new TestAdapterRegistrar(
        testHub,
        workspaceFolder => {
          const testExplorerAdapter = new Adapter(workspaceFolder, CONFIG_PREFIX, logger);
          testExplorerAdapters.push(testExplorerAdapter);
          return testExplorerAdapter;
        },
        logger
      )
    );
  }
}

export async function deactivate() {
  testExplorerAdapters.forEach(adapter => adapter.dispose());
}
