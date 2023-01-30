import { getPorts } from 'portfinder';

import { Disposable } from '../disposable/disposable.js';
import { Disposer } from '../disposable/disposer.js';
import { Logger } from '../logging/logger.js';
import { MultiLogger } from '../logging/multi-logger.js';

export class PortAcquisitionManager implements Disposable {
  private assignedPorts: Set<number> = new Set();

  public constructor(private readonly logger: Logger) {}

  public async findAvailablePort(
    basePort: number,
    futurePortRelease: Promise<unknown>,
    clientLogger?: Logger
  ): Promise<number> {
    const singlePortArray: number[] = await this.findAvailablePorts(basePort, futurePortRelease, 1, clientLogger);
    return singlePortArray[0];
  }

  public async findAvailablePorts(
    basePort: number,
    futurePortRelease: Promise<unknown>,
    portCount: number = 1,
    clientLogger?: Logger
  ): Promise<number[]> {
    const requestLogger = new MultiLogger(clientLogger, this.logger);
    const foundPorts: number[] = [];
    let nextBasePort = basePort;

    while (foundPorts.length < portCount) {
      const desiredPortCount = portCount - foundPorts.length;

      const ports: number[] = await new Promise((resolve, reject) => {
        getPorts(desiredPortCount, { port: nextBasePort }, (error: Error, availablePorts: number[]) => {
          if (!error) {
            resolve(availablePorts);
            return;
          }
          reject(`Failed to get available ports for base port ${basePort}: ${error}`);
        });
      });

      const unassignedPorts = ports.filter(port => !this.assignedPorts.has(port));
      foundPorts.push(...unassignedPorts);
      nextBasePort = Math.max(...ports) + 1;
    }

    foundPorts.forEach(port => this.assignedPorts.add(port));

    requestLogger.debug(
      () => `Request for ${portCount} port(s) at base port ${basePort} acquired: ${foundPorts.join(', ')}`
    );
    requestLogger.trace(() => `Currently assigned ports: ${[...this.assignedPorts].join(', ')}`);

    futurePortRelease.then(() => {
      requestLogger.debug(() => `Releasing ports: ${foundPorts.join(', ')}`);
      foundPorts.forEach(port => this.assignedPorts.delete(port));
      requestLogger.dispose();
    });

    return foundPorts;
  }

  public async dispose() {
    await Disposer.dispose(this.logger);
  }
}
