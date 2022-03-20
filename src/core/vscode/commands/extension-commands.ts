import { EXTENSION_CONFIG_PREFIX } from '../../../constants';

export const ExtensionCommands: Record<string, `${typeof EXTENSION_CONFIG_PREFIX}.${string}`> = {
  ExecuteFunction: `${EXTENSION_CONFIG_PREFIX}.ExecuteFunction`,
  AddProject: `${EXTENSION_CONFIG_PREFIX}.AddProject`,
  RemoveProject: `${EXTENSION_CONFIG_PREFIX}.RemoveProject`
};
