import { Disposable } from '../disposable/disposable';
import { Disposer } from '../disposable/disposer';
import { Logger } from '../logging/logger';
import { PortAcquisitionManager } from './port-acquisition-manager';

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
