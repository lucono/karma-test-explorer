import { ExtensionContext, extensions, window } from 'vscode';
import { testExplorerExtensionId, TestHub } from 'vscode-test-adapter-api';
import { TestAdapterRegistrar } from 'vscode-test-adapter-util';
import { Adapter } from './adapter';
import { EXTENSION_OUTPUT_CHANNEL_NAME } from './constants';
import { Disposable } from './util/disposable/disposable';
import { Disposer } from './util/disposable/disposer';

const disposables: Disposable[] = [];

export async function activate(context: ExtensionContext) {
  const testExplorerExtension = extensions.getExtension<TestHub>(testExplorerExtensionId);

  if (!testExplorerExtension) {
    const errorMsg = 'ERROR: Could not find Test Explorer UI extension';
    window.createOutputChannel(EXTENSION_OUTPUT_CHANNEL_NAME).append(errorMsg);
    throw new Error(errorMsg);
  }

  const testHub = testExplorerExtension.exports;

  context.subscriptions.push(
    new TestAdapterRegistrar(testHub, workspaceFolder => {
      const testExplorerAdapter = new Adapter(workspaceFolder);
      disposables.push(testExplorerAdapter);
      return testExplorerAdapter;
    })
  );
}

export async function deactivate() {
  await Disposer.dispose(disposables);
}
