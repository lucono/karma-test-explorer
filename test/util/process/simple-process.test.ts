import { ChildProcess, spawn } from 'child_process';
import { mock } from 'jest-mock-extended';
import treeKill from 'tree-kill';
import { Logger } from '../../../src/util/logging/logger';
import { Process } from '../../../src/util/process/process';
import { SimpleProcess } from '../../../src/util/process/simple-process';
import { Writeable } from '../../test-util';

jest.mock('child_process');
jest.mock('tree-kill');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockTreeKill = treeKill as jest.MockedFunction<typeof treeKill>;

describe('SimpleProcess', () => {
  let mockLogger: Logger;
  let simpleProcess: Process;

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

    it('spawns a process using the specified command and arguments', () => {
      simpleProcess = new SimpleProcess(processCommand, processArgs, mockLogger);
      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawn).toHaveBeenCalledWith(processCommand, processArgs, expect.objectContaining({}));
    });

    it('starts the execution for the process', () => {
      simpleProcess = new SimpleProcess(processCommand, processArgs, mockLogger);
      expect(simpleProcess.execution().isStarted()).toBe(true);
    });

    it('registers an error handler', () => {
      simpleProcess = new SimpleProcess(processCommand, processArgs, mockLogger);
      expect(mockChildProcess.on).toHaveBeenCalledWith('error', expect.anything());
    });

    it('registers an exit handler', () => {
      simpleProcess = new SimpleProcess(processCommand, processArgs, mockLogger);
      expect(mockChildProcess.on).toHaveBeenCalledWith('exit', expect.anything());
    });

    it('kills the PID for the process with SIGTERM when the stop method is called', () => {
      simpleProcess = new SimpleProcess(processCommand, processArgs, mockLogger);
      simpleProcess.stop();
      expect(mockTreeKill).toHaveBeenCalledTimes(1);
      expect(mockTreeKill).toHaveBeenCalledWith(mockChildProcess.pid, 'SIGTERM', expect.anything());
    });

    it('kills the PID for the process with SIGKILL when the kill method is called', () => {
      simpleProcess = new SimpleProcess(processCommand, processArgs, mockLogger);
      simpleProcess.kill();
      expect(mockTreeKill).toHaveBeenCalledTimes(1);
      expect(mockTreeKill).toHaveBeenCalledWith(mockChildProcess.pid, 'SIGKILL', expect.anything());
    });

    it('has an end-succeeded execution state if the process exits with a zero exit code', () => {
      simpleProcess = new SimpleProcess(processCommand, processArgs, mockLogger);
      const registeredExitListener = listeners.get('exit');
      registeredExitListener?.(0);

      expect(simpleProcess.execution().isEnded()).toBe(true);
    });

    it('has an end-failed execution state if the process exits with a non-zero exit code', async () => {
      simpleProcess = new SimpleProcess(processCommand, processArgs, mockLogger);
      simpleProcess.execution().ended().suppressUnhandledRejections();

      const randomNonZeroExitCode = 5;
      const failureReason = `Process exited with non-zero status code ${randomNonZeroExitCode}`;
      const registeredExitListener = listeners.get('exit');
      registeredExitListener?.(randomNonZeroExitCode);

      await expect(simpleProcess.execution().ended()).rejects.toBe(failureReason);
    });

    it('has a start-succeeded execution state if the child process has a pid', async () => {
      (mockChildProcess as Partial<Writeable<ChildProcess>>).pid = 1000;
      simpleProcess = new SimpleProcess(processCommand, processArgs, mockLogger);

      await expect(simpleProcess.execution().started()).resolves.not.toThrow();
    });

    it('has a start-failed execution state if the child process does not have a pid when the process errors', async () => {
      (mockChildProcess as Partial<Writeable<ChildProcess>>).pid = undefined;
      simpleProcess = new SimpleProcess(processCommand, processArgs, mockLogger);
      simpleProcess.execution().started().suppressUnhandledRejections();

      const errorReason = 'random failure reason';
      const registeredErrorListener = listeners.get('error');
      registeredErrorListener?.(errorReason);

      await expect(simpleProcess.execution().started()).rejects.toBe(errorReason);
    });

    it('has an end-failed execution state if the child process has a pid when the process errors', async () => {
      (mockChildProcess as Partial<Writeable<ChildProcess>>).pid = 1000;
      simpleProcess = new SimpleProcess(processCommand, processArgs, mockLogger);
      simpleProcess.execution().ended().suppressUnhandledRejections();

      const errorReason = 'random failure reason';
      const registeredErrorListener = listeners.get('error');
      registeredErrorListener?.(errorReason);

      await expect(simpleProcess.execution().started()).resolves.not.toThrow();
      await expect(simpleProcess.execution().ended()).rejects.toBe(errorReason);
    });

    it('has the `windowsHide` spawn option for the spawned child process as `true` when not provided', () => {
      simpleProcess = new SimpleProcess(processCommand, processArgs, mockLogger);

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawn).toHaveBeenCalledWith(
        processCommand,
        processArgs,
        expect.objectContaining({ windowsHide: true })
      );
    });

    it('has the `windowsHide` spawn option for the spawned child process as `false` when explicitly set to `false` in spawn options', () => {
      simpleProcess = new SimpleProcess(processCommand, processArgs, mockLogger, {
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
