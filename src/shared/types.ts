export type ServiceMode = 'process' | 'task' | 'background';
export interface ServiceConfig {
  name: string; cwd: string; command: string; ports: number[]; depends_on: string[];
  mode: ServiceMode; enabled: boolean; env: Record<string, string>; env_file?: string;
  ready_command?: string; stop_command?: string; logs_command?: string;
  startup_timeout: number; stop_timeout: number; allow_successful_exit: boolean;
}
export interface InstallStep { id: string; command: string; cwd: string; env: Record<string, string>; env_file?: string; timeout: number; interactive: boolean; notes?: string }
export interface InstallConfig { cwd: string; check_command?: string; steps: InstallStep[]; recipeHash: string }
export interface Project { id: string; path: string; name: string; services: ServiceConfig[]; install?: InstallConfig; installed?: boolean; error?: string; draft?: boolean }
export interface InstallState { projectId: string; status: 'running' | 'failed' | 'completed' | 'cancelled'; stepId?: string; stepIndex?: number; completedStepIds: string[]; error?: string; notes?: string }
export type ServiceStatus = 'pending' | 'starting' | 'running' | 'ready' | 'completed' | 'failed' | 'stopping' | 'stopped';
export interface ServiceState { name: string; status: ServiceStatus; pid?: number; error?: string; exitCode?: number | null }
export interface Session {
  id: string; project: Project; status: 'starting' | 'running' | 'degraded' | 'stopping' | 'stopped' | 'failed';
  startedAt: string; services: ServiceState[]; error?: string;
}
export interface ProjectFolder { id: string; name: string; parentId: string | null }
export type Appearance = 'light' | 'dark' | 'system';
export interface Settings { roots: string[]; exclusions: string[]; shell: string; releaseRepo: string; appearance: Appearance; projectFolders: ProjectFolder[]; projectFolderAssignments: Record<string, string>; projectTreeOrder: Record<string, string[]>; sidebarPinned: boolean; onboardingCompleted: boolean }
export interface LogEntry { seq: number; time: string; service: string; stream: 'stdout' | 'stderr' | 'system'; text: string }
export interface ConfigDocument { path: string; text: string; revision: string }
export interface ConfigValidation { valid: boolean; message?: string; line?: number; column?: number }
export interface UpdateInfo {
  status: 'idle' | 'checking' | 'available' | 'uptodate' | 'needsToken' | 'error' | 'downloading' | 'downloaded';
  current: string; latest?: string; notes?: string; message?: string; progress?: number; checkedAt?: string;
}
export interface TerminalTheme { background: string; foreground: string; accent: string; secondary: string; source: string }
export interface AppState { projects: Project[]; settings: Settings; session: Session | null; installState: InstallState | null; installOutput: string; scanning: boolean; scanErrors: string[]; error?: string; update: UpdateInfo; hasToken: boolean; theme: TerminalTheme }
export interface DesktopAPI {
  state(): Promise<AppState>; scan(): Promise<void>; addFolder(): Promise<void>; createProject(): Promise<{ id: string; path: string } | null>;
  saveSettings(settings: Settings): Promise<void>;
  start(id: string): Promise<void>; stop(): Promise<void>; restart(name: string): Promise<void>;
  install(id: string, mode?: 'resume' | 'restart'): Promise<void>; cancelInstall(): Promise<void>; installInput(data: string): Promise<void>; installResize(cols: number, rows: number): Promise<void>;
  startService(id: string, name: string): Promise<void>; stopService(id: string, name: string): Promise<void>;
  logs(service?: string): Promise<LogEntry[]>; openTerminal(): Promise<void>;
  openConfigFinder(id: string): Promise<void>; openConfigTerminal(id: string): Promise<void>;
  readConfig(id: string): Promise<ConfigDocument>;
  validateConfig(id: string, text: string): Promise<ConfigValidation>;
  saveConfig(id: string, text: string, revision: string): Promise<ConfigDocument>;
  checkUpdate(): Promise<void>; saveToken(token: string): Promise<void>; installUpdate(): Promise<void>;
  onState(callback: (state: AppState) => void): () => void;
  onLog(callback: (entry: LogEntry) => void): () => void;
  onInstallOutput(callback: (data: string) => void): () => void;
}
