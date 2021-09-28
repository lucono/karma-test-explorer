import { ChildProcess } from 'child_process';
import spawn from 'cross-spawn';
import { mock } from 'jest-mock-extended';
import treeKill from 'tree-kill';
import { Logger } from '../../../src/util/logging/logger';
import { CommandLineProcessHandler } from '../../../src/util/process/command-line-process-handler';

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
    let mockChildProcess: ChildProcess;
    let mockProcessPid: number;
    let processCommand: string;
    let processArgs: string[];
    let handlers: Map<string, (...args: any[]) => any>;

    beforeEach(() => {
      handlers = new Map();
      mockProcessPid = 1000;
      processCommand = 'commandName';
      processArgs = ['arg1', 'arg2'];

      mockChildProcess = {
        pid: mockProcessPid,
        on: jest.fn((event: any, handler: (...args: any[]) => void) => {
          handlers.set(event, handler);
          return mockChildProcess;
        })
      } as any;

      mockSpawn.mockReturnValue(mockChildProcess);
      mockTreeKill.mockImplementation((pid, signal, callback?: (error?: Error) => void) => callback?.());
    });

    it('a process is spawned using the specified command and arguments', () => {
      commandLineHandler = new CommandLineProcessHandler(processCommand, processArgs, mockLogger);
      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawn).toHaveBeenCalledWith(processCommand, processArgs, undefined);
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
      expect(mockTreeKill).toHaveBeenCalledWith(mockProcessPid, 'SIGTERM', expect.anything());
    });

    it('the execution for the process is ended if an exit event is emitted for the process', () => {
      commandLineHandler = new CommandLineProcessHandler(processCommand, processArgs, mockLogger);
      const registeredExitHandler = handlers.get('exit');
      registeredExitHandler?.();

      expect(commandLineHandler.execution().isEnded()).toBe(true);
    });
  });
});
