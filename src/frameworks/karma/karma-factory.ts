import { Logger } from "../../core/logger";
import { ExtensionConfig } from "../../core/extension-config";
import { TestRunExecutor } from "../../api/test-run-executor";
import { TestServerExecutor } from "../../api/test-server-executor";
import { KarmaCommandLineTestRunExecutor } from "./runner/karma-command-line-test-run-executor";
import { KarmaHttpTestRunExecutor } from "./runner/karma-http-test-run-executor";
import { TestRunner } from "../../api/test-runner";
import { KarmaEventListener } from "./runner/karma-event-listener";
import { SpecResponseToTestSuiteInfoMapper } from "./runner/spec-response-to-test-suite-info-mapper";
import { KarmaTestRunner } from "./runner/karma-test-runner";
import { KarmaCommandLineTestServerExecutor, KarmaCommandLineTestServerExecutorOptions, ServerProcessLogger } from "./server/karma-command-line-test-server-executor";
import { TestServer } from "../../api/test-server";
import { KarmaServer } from "./server/karma-test-server";
import { TestFactory } from "../../api/test-factory";
import { Disposable } from "../../api/disposable";
import { KARMA_SHARD_INDEX_ENV_VAR, KARMA_TOTAL_SHARDS_ENV_VAR } from "./karma-constants";

export class KarmaFactory implements TestFactory {

  private disposables: Disposable[] = [];
  
  public constructor(
    private readonly config: ExtensionConfig,
    private readonly serverProcessLogger: ServerProcessLogger,
    private readonly logger: Logger)
  {
    this.disposables.push(config, logger);
  }

  public createTestServer(
    // serverShardIndex: number = 0,
    // totalServerShards: number = 1,
    testServerExecutor?: TestServerExecutor
  ): TestServer {
    const serverExecutor = testServerExecutor ?? this.createTestServerExecutor();
    return new KarmaServer(serverExecutor, this.logger);
  }

  public createTestRunner(
    karmaEventListener: KarmaEventListener,
    specToTestSuiteMapper: SpecResponseToTestSuiteInfoMapper,
    testRunExecutor?: TestRunExecutor): TestRunner
  {
    const runExecutor = testRunExecutor ?? this.createTestRunExecutor();
    return new KarmaTestRunner(runExecutor, karmaEventListener, specToTestSuiteMapper, this.logger); // FIXME: Create new properly named logger
  }

  public createTestServerExecutor(
    serverShardIndex: number = 0,
    totalServerShards: number = 1): TestServerExecutor
  {
    // return this.isAngularProject()  // FIXME: Angular concerns should not be here but in Angular factory (?)
    //   ? this.createAngularTestServerExecutor(serverShardIndex, totalServerShards)
    return this.createKarmaCommandLineTestServerExecutor(serverShardIndex, totalServerShards);
  }

  public createTestRunExecutor(): TestRunExecutor {
    return this.config.karmaProcessExecutable
      ? this.createKarmaCommandLineTestRunExecutor()
      : this.createKarmaHttpTestRunExecutor();
  }

  private createKarmaHttpTestRunExecutor(): KarmaHttpTestRunExecutor {
    this.logger.info(`Creating Karma http test run executor`);

    return new KarmaHttpTestRunExecutor(this.logger);
  }

  private createKarmaCommandLineTestRunExecutor(): KarmaCommandLineTestRunExecutor {
    this.logger.info(`Creating Karma command line test run executor`);

    const environment: { [key: string]: string | undefined } = {
      ...process.env,
      ...this.config.envFileEnvironment,
      ...this.config.env
    };
    return new KarmaCommandLineTestRunExecutor(
      this.config.projectRootPath,
      this.config.baseKarmaConfFilePath,
      this.config.userKarmaConfFilePath,
      { environment },
      this.logger);
  }

  private createKarmaCommandLineTestServerExecutor(
    serverShardIndex: number,
    totalServerShards: number): KarmaCommandLineTestServerExecutor
  {
    this.logger.info(`Creating Karma test server executor`);
    
    const environment: { [key: string]: string | undefined } = {
      ...process.env,
      ...this.config.envFileEnvironment,
      ...this.config.env,
      [KARMA_SHARD_INDEX_ENV_VAR]: `${serverShardIndex}`,
      [KARMA_TOTAL_SHARDS_ENV_VAR]: `${totalServerShards}`
    };
    const options: KarmaCommandLineTestServerExecutorOptions = {
        environment,
        serverProcessLogger: this.serverProcessLogger,
        serverProcessErrorLogger: this.serverProcessLogger
    };

    return new KarmaCommandLineTestServerExecutor(
      this.config.projectRootPath,
      this.config.baseKarmaConfFilePath,
      this.config.userKarmaConfFilePath,
      options,
      this.logger);
  }

  // private createAngularTestServerExecutor(
  //   serverShardIndex: number = 0,
  //   totalServerShards: number = 1): AngularTestServerExecutor
  // {
  //   this.logger.info(`Creating Angular test server executor`);
    
  //   const angularProject = getDefaultAngularProject(this.config.projectRootPath);

  //   const environment: { [key: string]: string | undefined } = {
  //     ...process.env,
  //     ...this.config.envFileEnvironment,
  //     ...this.config.env,
  //       [KARMA_SHARD_INDEX_ENV_VAR]: `${serverShardIndex}`,
  //       [KARMA_TOTAL_SHARDS_ENV_VAR]: `${totalServerShards}`
  //   };
  //   const options: KarmaCommandLineTestServerExecutorOptions = {
  //       environment,
  //       serverProcessLogger: this.serverProcessLogger,
  //       serverProcessErrorLogger: this.serverProcessLogger
  //   };

  //   return new AngularTestServerExecutor(
  //     angularProject,
  //     this.config.projectRootPath,
  //     this.config.baseKarmaConfFilePath,
  //     options,
  //     this.logger);
  // }

  // private isAngularProject(): boolean {
  //   const angularJsonPath = join(this.config.projectRootPath, "angular.json");
  //   const angularCliJsonPath = join(this.config.projectRootPath, ".angular-cli.json");
  //   const isAngularProject = (existsSync(angularJsonPath) || existsSync(angularCliJsonPath));

  //   this.logger.info(`Project detected to ${isAngularProject ? 'be' : 'not be'} an Angular project`);

  //   return isAngularProject;
  // }

  public dispose() {
    this.disposables.forEach(disposable => disposable.dispose());
  }
}
