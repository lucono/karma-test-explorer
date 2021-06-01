import { Logger } from "../core/logger";
import { getPorts } from "portfinder";
import { Disposable } from "../api/disposable";

export class PortAcquisitionManager implements Disposable {

  private assignedPorts: Set<number> = new Set();

  public constructor(private readonly logger: Logger) {}

  public async findAvailablePort(
    basePort: number,
    futurePortRelease: Promise<any>): Promise<number>
  {
    const singlePortArray: number[] = await this.findAvailablePorts(basePort, 1, futurePortRelease);
    return singlePortArray[0];
  }

  public async findAvailablePorts(
    basePort: number,
    portCount: number = 1,
    futurePortRelease: Promise<any>): Promise<number[]>
  {
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
            reject(`Failed to get available ports for base port ${basePort}: ${error.message ?? error}`)
          });
      });
      // FIXME: Handle failure to get available ports

      const unassignedPorts = ports.filter(port => !this.assignedPorts.has(port));
      foundPorts.push(...unassignedPorts);
      nextBasePort = Math.max(...ports) + 1;
    }

    foundPorts.forEach(port => this.assignedPorts.add(port));

    futurePortRelease.then(() => {
      this.logger.debug(() => `Releasing ports: ${JSON.stringify(foundPorts)}`);
      foundPorts.forEach(port => this.assignedPorts.delete(port));
    });

    this.logger.info(
      `Request for ${portCount} ports at base port ${basePort} produced: ` +
      `${JSON.stringify(foundPorts)}`);

    this.logger.debug(() => `Current assigned ports: ${JSON.stringify([...this.assignedPorts])}`);

    return foundPorts;
  }

  public dispose() {
    this.logger.dispose();
  }
}