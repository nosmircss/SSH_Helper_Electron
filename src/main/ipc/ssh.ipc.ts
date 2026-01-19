import { IpcMain, BrowserWindow } from 'electron';
import { SshExecutionService } from '../services/SshExecutionService';
import { ScriptParser, ScriptExecutor, ScriptContext } from '../scripting';
import type { HostConnection, ExecutionResult } from '../../shared/models';

let sshService: SshExecutionService;
let scriptExecutor: ScriptExecutor;
const scriptParser = new ScriptParser();
let globalDebugMode = false;

export function registerSshHandlers(ipcMain: IpcMain): void {
  sshService = new SshExecutionService();
  scriptExecutor = new ScriptExecutor(sshService);

  // Wire up events to send to renderer
  sshService.on('output', (hostId: string, output: string) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      win.webContents.send('ssh:output', { hostId, output });
    });
  });

  sshService.on('progress', (hostId: string, status: string) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      win.webContents.send('ssh:progress', { hostId, status });
    });
  });

  sshService.on('complete', (result: ExecutionResult) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      win.webContents.send('ssh:complete', result);
    });
  });

  sshService.on('debug', (hostId: string, message: string) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      win.webContents.send('ssh:output', { hostId, output: message, type: 'Debug' });
    });
  });

  ipcMain.handle(
    'ssh:connect',
    async (_event, host: HostConnection): Promise<{ success: boolean; error?: string }> => {
      try {
        await sshService.connect(host);
        return { success: true };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle('ssh:disconnect', async (_event, hostId: string): Promise<void> => {
    await sshService.disconnect(hostId);
  });

  ipcMain.handle(
    'ssh:execute',
    async (_event, hostId: string, command: string, timeout?: number): Promise<ExecutionResult> => {
      return sshService.execute(hostId, command, timeout);
    }
  );

  ipcMain.handle(
    'ssh:executeOnHosts',
    async (_event, hosts: HostConnection[], command: string, timeout?: number): Promise<void> => {
      // Check if this is a YAML script or simple commands
      const isScript = ScriptParser.isYamlScript(command);

      for (const host of hosts) {
        // Emit progress
        sendToRenderer('ssh:progress', { hostId: host.id, status: 'connecting' });

        try {
          // Always disconnect first to ensure a fresh connection
          // This prevents issues with stale connections or closed shells
          if (sshService.isConnected(host.id)) {
            await sshService.disconnect(host.id);
          }
          await sshService.connect(host);

          sendToRenderer('ssh:progress', { hostId: host.id, status: 'running' });

          if (isScript) {
            // Execute as YAML script
            const script = scriptParser.parse(command);

            // Create context with host variables
            const context = new ScriptContext(host.variables);
            context.hostId = host.id;
            context.debugMode = script.debug || globalDebugMode;

            // Wire up context events
            context.on('output', ({ message, type }) => {
              sendToRenderer('ssh:output', { hostId: host.id, output: message, type });
            });

            context.on('columnUpdate', ({ columnName, value }) => {
              sendToRenderer('ssh:columnUpdate', { hostId: host.id, columnName, value });
            });

            // Execute script
            const result = await scriptExecutor.execute(script, context);

            const execResult: ExecutionResult = {
              hostId: host.id,
              host,
              output: result.fullOutput,
              success: result.status === 'success',
              errorMessage: result.status !== 'success' ? result.message : undefined,
              timestamp: new Date(),
            };

            sendToRenderer('ssh:complete', execResult);
            sendToRenderer('ssh:progress', {
              hostId: host.id,
              status: result.status === 'success' ? 'success' : 'error',
            });
          } else {
            // Execute as simple commands (one per line)
            const lines = command
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter((l) => l && !l.startsWith('#'));

            // Get the detected prompt for the header
            const prompt = sshService.getCurrentPrompt(host.id) || '#';

            // Generate header banner like old app
            const headerText = ` CONNECTED TO ${host.ipAddress} ${prompt} `;
            const headerPadding = '#'.repeat(20);
            const separator = '#'.repeat(headerPadding.length + headerText.length + headerPadding.length);
            const header = `${separator}\n${headerPadding}${headerText}${headerPadding}\n${separator}`;
            sendToRenderer('ssh:output', { hostId: host.id, output: header });

            let allOutput = '';
            let success = true;

            for (const line of lines) {
              // Substitute variables
              const substituted = substituteHostVariables(line, host.variables);

              // Show prompt with command like old app: "FortiGate-VM64-KVM # show system interface"
              sendToRenderer('ssh:output', { hostId: host.id, output: `${prompt} ${substituted}` });

              const result = await sshService.execute(host.id, substituted, timeout);
              allOutput += result.output + '\n';

              if (result.output) {
                sendToRenderer('ssh:output', { hostId: host.id, output: result.output });
              }

              if (!result.success) {
                success = false;
                break;
              }
            }

            // Show final prompt
            sendToRenderer('ssh:output', { hostId: host.id, output: prompt });

            const execResult: ExecutionResult = {
              hostId: host.id,
              host,
              output: allOutput.trim(),
              success,
              timestamp: new Date(),
            };

            sendToRenderer('ssh:complete', execResult);
            sendToRenderer('ssh:progress', {
              hostId: host.id,
              status: success ? 'success' : 'error',
            });
          }
        } catch (error) {
          const execResult: ExecutionResult = {
            hostId: host.id,
            host,
            output: '',
            success: false,
            errorMessage: (error as Error).message,
            timestamp: new Date(),
          };

          sendToRenderer('ssh:complete', execResult);
          sendToRenderer('ssh:progress', { hostId: host.id, status: 'error' });
        }
      }
    }
  );

  ipcMain.handle('ssh:cancel', async (): Promise<void> => {
    sshService.cancelExecution();
    scriptExecutor.cancel();
  });

  ipcMain.handle('ssh:setDebugMode', async (_event, enabled: boolean): Promise<void> => {
    globalDebugMode = enabled;
    sshService.debugMode = enabled;
  });
}

/**
 * Send data to all renderer windows
 */
function sendToRenderer(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    win.webContents.send(channel, data);
  });
}

/**
 * Substitute ${variable} placeholders with host variables
 */
function substituteHostVariables(input: string, variables: Record<string, string>): string {
  return input.replace(/\$\{(\w+)\}/g, (_match, varName) => {
    return variables[varName] || variables[varName.toLowerCase()] || '';
  });
}
