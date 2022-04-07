import { EXTENSION_CONFIG_PREFIX } from '../../../constants';

export const ExtensionCommands: Record<string, `${typeof EXTENSION_CONFIG_PREFIX}.${string}`> = {
  ExecuteFunction: `${EXTENSION_CONFIG_PREFIX}.ExecuteFunction`,
  SelectProjects: `${EXTENSION_CONFIG_PREFIX}.SelectProjects`
};
