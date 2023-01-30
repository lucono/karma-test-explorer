import { EventEmitter, FileChangeType, FileSystemWatcher, RelativePattern, WorkspaceFolder, workspace } from 'vscode';
import { RetireEvent } from 'vscode-test-adapter-api';

import { join, relative } from 'path';
import { debounce } from 'throttle-debounce';

import { WATCHED_FILE_CHANGE_BATCH_DELAY } from '../constants.js';
import { Disposable } from '../util/disposable/disposable.js';
import { Disposer } from '../util/disposable/disposer.js';
import { Logger } from '../util/logging/logger.js';
import { normalizePath } from '../util/utils.js';
import { TestLocator } from './test-locator.js';
import { TestStore } from './test-store.js';
import { Commands } from './vscode/commands/commands.js';
import { ProjectCommand } from './vscode/commands/project-command.js';

export interface FileWatcherOptions {
  retireTestsInChangedFiles?: boolean;
}

const defaultFileWatcherOptions: Required<FileWatcherOptions> = {
  retireTestsInChangedFiles: true
};

export class FileWatcher {
  private readonly fileWatcherOptions: Required<FileWatcherOptions>;
  private readonly disposables: Disposable[] = [];

  public constructor(
    private readonly workspaceFolder: WorkspaceFolder,
    private readonly projectPath: string,
    private readonly testFilePatterns: readonly string[],
    private readonly reloadTriggerFiles: readonly string[],
    private readonly testLocator: TestLocator,
    private readonly testStore: TestStore,
    private readonly testRetireEventEmitter: EventEmitter<RetireEvent>,
    private readonly projectCommands: Commands<ProjectCommand>,
    private readonly logger: Logger,
    fileWatcherOptions: FileWatcherOptions = {}
  ) {
    // FIXME: Fix non-intuitive all-private, side effect based implementation for watching project files
    this.fileWatcherOptions = { ...defaultFileWatcherOptions, ...fileWatcherOptions };
    this.disposables.push(logger);
    this.disposables.push(...this.createFileWatchers());
  }

  private createFileWatchers(): Disposable[] {
    this.logger.debug(() => 'Creating file watchers for monitored files');

    const reloadTriggerFilesRelativePaths = this.reloadTriggerFiles.map(triggerFile =>
      normalizePath(relative(this.projectPath, triggerFile))
    );

    this.logger.trace(
      () =>
        `Monitored files ( configured --> normalized): ` +
        `${JSON.stringify(this.reloadTriggerFiles, null, 2)} --> ` +
        `${JSON.stringify(reloadTriggerFilesRelativePaths, null, 2)}`
    );

    const fileChangedHandler = (filePath: string) => {
      this.logger.info(() => `Reloading due to monitored file changed: ${filePath}`);
      this.projectCommands.execute(ProjectCommand.Reset);
    };

    const reloadTriggerFilesWatchers = this.registerFileHandler(
      // FIXME: Add file watcher functionality to prompt with changed file and custom message and actions to trigger handler?
      reloadTriggerFilesRelativePaths,
      debounce(WATCHED_FILE_CHANGE_BATCH_DELAY, fileChangedHandler)
    );

    this.logger.debug(() => 'Creating file watchers for test file changes');
    const testFileGlobs = this.testFilePatterns;

    const reloadTestFilesWatchers = this.registerFileHandler(testFileGlobs, async (changedTestFile, changeType) => {
      if (!this.testLocator?.isTestFile(changedTestFile)) {
        this.logger.warn(() => `Expected changed file to be spec file but it is not: ${changedTestFile}`);
        return;
      }
      this.logger.debug(() => `Changed file is spec file: ${changedTestFile}`);

      await (changeType === FileChangeType.Deleted
        ? this.testLocator.removeFiles([changedTestFile])
        : this.testLocator.refreshFiles([changedTestFile]));

      if (this.fileWatcherOptions.retireTestsInChangedFiles) {
        const changedTestIds = this.testStore?.getTestsByFile(changedTestFile).map(changedTest => changedTest.id) ?? [];

        if (changedTestIds.length > 0) {
          this.logger.debug(() => `Retiring ${changedTestIds.length} tests from updated spec file: ${changedTestFile}`);
          this.testRetireEventEmitter.fire({ tests: changedTestIds });
        }
      }
    });

    return [...reloadTriggerFilesWatchers, ...reloadTestFilesWatchers];
  }

  private registerFileHandler(
    filePatterns: readonly string[],
    handler: (filePath: string, changeType: FileChangeType) => void
  ): FileSystemWatcher[] {
    const fileWatchers: FileSystemWatcher[] = [];
    const workspaceRootPath = normalizePath(this.workspaceFolder.uri.fsPath);
    const relativeProjectRootPath = relative(workspaceRootPath, this.projectPath);
    const isProjectRootSameAsWorkspace = this.projectPath === workspaceRootPath;

    this.logger.debug(() => `Registering file handler for files: ${JSON.stringify(filePatterns, null, 2)}`);

    for (const fileOrPattern of filePatterns) {
      const relativeFileOrPattern = isProjectRootSameAsWorkspace
        ? fileOrPattern
        : normalizePath(join(relativeProjectRootPath, fileOrPattern));

      const absoluteFileOrPattern = new RelativePattern(this.workspaceFolder, relativeFileOrPattern);

      this.logger.debug(
        () =>
          `Creating file watcher for file or pattern '${fileOrPattern}' ` +
          `using base path: ${absoluteFileOrPattern.baseUri.fsPath}`
      );
      const fileWatcher = workspace.createFileSystemWatcher(absoluteFileOrPattern);
      fileWatchers.push(fileWatcher);

      this.disposables.push(
        fileWatcher.onDidChange(fileUri => handler(normalizePath(fileUri.fsPath), FileChangeType.Changed)),
        fileWatcher.onDidCreate(fileUri => handler(normalizePath(fileUri.fsPath), FileChangeType.Created)),
        fileWatcher.onDidDelete(fileUri => handler(normalizePath(fileUri.fsPath), FileChangeType.Deleted))
      );
    }
    return fileWatchers;
  }

  public async dispose(): Promise<void> {
    await Disposer.dispose(this.disposables);
  }
}
