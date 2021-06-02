import { ExtensionConfig } from "../../../core/extension-config";

export interface KarmaRunnerWorkerData {
  workspaceUriString: string;
  configPrefix: string;
  serverPort: number;
  serverShardIndex: number;
  totalServerShards: number;
  config: ExtensionConfig;
}
