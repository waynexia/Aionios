import type { Express } from 'express';
import { PreferenceConfigStore } from '../config';
import { WindowOrchestrator } from '../orchestrator';
import { HostFileSystem } from '../storage/host-fs';
import { RecycleBinStore } from '../storage/recycle-bin';
import { TerminalManager } from '../terminal/manager';
import { registerAppRoutes } from './apps';
import { registerConfigRoutes } from './config';
import { registerFileSystemRoutes } from './fs';
import { registerLlmRoutes } from './llm';
import { registerRecycleBinRoutes } from './recycle-bin';
import { registerSessionRoutes } from './sessions';
import { registerTerminalRoutes } from './terminal';
import { registerWindowActionRoutes } from './window-actions';
import { registerWindowRevisionRoutes } from './window-revisions';
import { registerWindowRoutes } from './windows';

export type ApiRouteDeps = {
  hostFs: HostFileSystem;
  recycleBinStore: RecycleBinStore;
  orchestrator: WindowOrchestrator;
  preferenceConfigStore: PreferenceConfigStore;
  terminalManager: TerminalManager;
};

export function registerApiRoutes(app: Express, deps: ApiRouteDeps) {
  registerAppRoutes(app, { hostFs: deps.hostFs });
  registerFileSystemRoutes(app, { hostFs: deps.hostFs });
  registerLlmRoutes(app, { orchestrator: deps.orchestrator });
  registerRecycleBinRoutes(app, { hostFs: deps.hostFs, recycleBinStore: deps.recycleBinStore });
  registerSessionRoutes(app, { orchestrator: deps.orchestrator });
  registerConfigRoutes(app, { preferenceConfigStore: deps.preferenceConfigStore });
  registerTerminalRoutes(app, { orchestrator: deps.orchestrator, terminalManager: deps.terminalManager });
  registerWindowActionRoutes(app, { orchestrator: deps.orchestrator });
  registerWindowRoutes(app, { orchestrator: deps.orchestrator, terminalManager: deps.terminalManager });
  registerWindowRevisionRoutes(app, { orchestrator: deps.orchestrator });
}
