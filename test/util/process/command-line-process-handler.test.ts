import { ChildProcess } from 'child_process';
import spawn from 'cross-spawn';
import { mock } from 'jest-mock-extended';
import treeKill from 'tree-kill';
import { Logger } from '../../../src/util/logging/logger';
import { CommandLineProcessHandler } from '../../../src/util/process/command-line-process-handler';
import { Writeable } from '../../test-util';

jest.mock('cross-spawn');
jest.mock('tree-kill');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockTreeKill = treeKill as jest.MockedFunction<typeof treeKill>;

describe('CommandLineProcessHandler', () => {
  let mockLogger: Logger;
  let commandLineHandler: CommandLineProcessHandler;

  beforeEach(() => {
    mockSpawn.mockClear();
    mockTreeKill.mockClear();
    mockLogger = mock<Logger>();
  });

  describe('when instantiated using a given command and arguments', () => {
    let mockChildProcess: Writeable<ChildProcess>;
    let processCommand: string;
    let processArgs: string[];
    let listeners: Map<string, (...args: any[]) => any>;

    beforeEach(() => {
      listeners = new Map();
      processCommand = 'randomCommandName';
      processArgs = ['arg1', 'arg2'];

      mockChildProcess = {
        pid: 1000,
        on: jest.fn((event: any, handler: (...args: any[]) => void) => {
          listeners.set(event, handler);
          return mockChildProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockChildProcess);
      mockTreeKill.mockImplementation((pid, signal, callback?: (error?: Error) => void) => callback?.());
    });

    it('a process is spawned using the specified command and arguments', () => {
      commandLineHandler = new CommandLineProcessHandler(processCommand, processArgs, mockLogger);
      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawn).toHaveBeenCalledWith(processCommand, processArgs, expect.objectContaining({}));
    });

    it('the execution for the process is started', () => {
      commandLineHandler = new CommandLineProcessHandler(processCommand, processArgs, mockLogger);
      expect(commandLineHandler.execution().isStarted()).toBe(true);
    });

    it('an error handler is registered', () => {
      commandLineHandler = new CommandLineProcessHandler(processCommand, processArgs, mockLogger);
      expect(mockChildProcess.on).toHaveBeenCalledWith('error', expect.anything());
    });

    it('an exit handler is registered', () => {
      commandLineHandler = new CommandLineProcessHandler(processCommand, processArgs, mockLogger);
      expect(mockChildProcess.on).toHaveBeenCalledWith('exit', expect.anything());
    });

    it('the PID for the process is killed with SIGTERM when the stop method is subsequently called', () => {
      commandLineHandler = new CommandLineProcessHandler(processCommand, processArgs, mockLogger);
      commandLineHandler.stop();
      expect(mockTreeKill).toHaveBeenCalledTimes(1);
      expect(mockTreeKill).toHaveBeenCalledWith(mockChildProcess.pid, 'SIGTERM', expect.anything());
    });

    it('the execution for the process is ended if an exit event is emitted for the process', () => {
      commandLineHandler = new CommandLineProcessHandler(processCommand, processArgs, mockLogger);
      const registeredExitListener = listeners.get('exit');
      registeredExitListener?.();

      expect(commandLineHandler.execution().isEnded()).toBe(true);
    });

    it('the process execution indicates successful start if the child process has a pid', async () => {
      (mockChildProcess as Partial<Writeable<ChildProcess>>).pid = 1000;
      commandLineHandler = new CommandLineProcessHandler(processCommand, processArgs, mockLogger);

      await expect(commandLineHandler.execution().started()).resolves.not.toThrow();
    });

    it('the process execution indicates failure to start if the child process does not have a pid when process errors', async () => {
      (mockChildProcess as Partial<Writeable<ChildProcess>>).pid = undefined;
      commandLineHandler = new CommandLineProcessHandler(processCommand, processArgs, mockLogger);
      commandLineHandler.execution().started().suppressUnhandledRejections();

      const errorReason = 'random failure reason';
      const registeredErrorListener = listeners.get('error');
      registeredErrorListener?.(errorReason);

      await expect(commandLineHandler.execution().started()).rejects.toBe(errorReason);
    });

    it('the process execution indicates failure after start if the child process has a pid when process errors', async () => {
      (mockChildProcess as Partial<Writeable<ChildProcess>>).pid = 1000;
      commandLineHandler = new CommandLineProcessHandler(processCommand, processArgs, mockLogger);
      commandLineHandler.execution().ended().suppressUnhandledRejections();

      const errorReason = 'random failure reason';
      const registeredErrorListener = listeners.get('error');
      registeredErrorListener?.(errorReason);

      await expect(commandLineHandler.execution().started()).resolves.not.toThrow();
      await expect(commandLineHandler.execution().ended()).rejects.toBe(errorReason);
    });

    it('the `windowsHide` spawn option is set to true for the spawned child process when not provided', () => {
      commandLineHandler = new CommandLineProcessHandler(processCommand, processArgs, mockLogger);

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawn).toHaveBeenCalledWith(
        processCommand,
        processArgs,
        expect.objectContaining({ windowsHide: true })
      );
    });

    it('the `windowsHide` spawn option is set to false for the spawned child process when explicitly false in spawn options', () => {
      commandLineHandler = new CommandLineProcessHandler(processCommand, processArgs, mockLogger, undefined, {
        windowsHide: false
      });

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawn).toHaveBeenCalledWith(
        processCommand,
        processArgs,
        expect.objectContaining({ windowsHide: false })
      );
    });
  });
});
