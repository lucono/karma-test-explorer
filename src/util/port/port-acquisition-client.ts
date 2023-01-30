import { Disposable } from '../disposable/disposable.js';
import { Disposer } from '../disposable/disposer.js';
import { Logger } from '../logging/logger.js';
import { PortAcquisitionManager } from './port-acquisition-manager.js';

export class PortAcquisitionClient implements Disposable {
  public constructor(
    private readonly portAcquisitionManager: PortAcquisitionManager,
    private readonly logger: Logger
  ) {}

  public async findAvailablePort(basePort: number, futurePortRelease: Promise<unknown>): Promise<number> {
    return this.portAcquisitionManager.findAvailablePort(basePort, futurePortRelease, this.logger);
  }

  public async findAvailablePorts(
    basePort: number,
    futurePortRelease: Promise<unknown>,
    portCount: number = 1
  ): Promise<number[]> {
    return this.portAcquisitionManager.findAvailablePorts(basePort, futurePortRelease, portCount, this.logger);
  }

  public async dispose() {
    await Disposer.dispose(this.logger);
  }
}
