import { EventEmitter } from 'events';
import { Client, ClientChannel } from 'ssh2';
import type { HostConnection, ExecutionResult } from '../../shared/models';
import { PromptDetector } from '../utils/PromptDetector';
import { TerminalOutputProcessor } from '../utils/TerminalOutputProcessor';

interface SshSession {
  client: Client;
  shell: ClientChannel;
  host: HostConnection;
  promptRegex: RegExp | null;
  currentPrompt: string;
  buffer: string;
  lineBuffer: string; // Buffer for accumulating partial lines
  lastEmittedIndex: number; // Track what we've already emitted
  suppressOutput: boolean; // Whether to suppress real-time output (during command execution)
  commandEchoLength: number; // Length of command being executed (to skip echo)
  commandSentTime: number; // Timestamp when command was sent - data before this is discarded
  preCommandBuffer: string; // Buffer for data received before command was sent (banner/MOTD)
}

interface TimeoutOptions {
  connectionTimeout: number;
  commandTimeout: number;
  idleTimeout: number;
  pollInterval: number;
  promptConfirmMs: number;
}

const DEFAULT_TIMEOUTS: TimeoutOptions = {
  connectionTimeout: 10000,
  commandTimeout: 30000,
  idleTimeout: 5000,
  pollInterval: 50,
  promptConfirmMs: 150,
};

/**
 * SSH execution service using ssh2 library
 * Ported from: Services/SshExecutionService.cs and Services/SshShellSession.cs
 */
export class SshExecutionService extends EventEmitter {
  private sessions: Map<string, SshSession> = new Map();
  private cancelled = false;
  private timeouts: TimeoutOptions = DEFAULT_TIMEOUTS;
  public debugMode = false;

  /**
   * Connect to a host
   */
  async connect(host: HostConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = new Client();

      client.on('ready', () => {
        client.shell({ term: 'xterm-256color', cols: 200, rows: 48 }, (err, stream) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          const session: SshSession = {
            client,
            shell: stream,
            host,
            promptRegex: null,
            currentPrompt: '',
            buffer: '',
            lineBuffer: '',
            lastEmittedIndex: 0,
            suppressOutput: true,  // Start suppressed to hide banner/MOTD during connection
            commandEchoLength: 0,
            commandSentTime: 0,  // 0 means no command in progress - all data goes to preCommandBuffer
            preCommandBuffer: '',  // Accumulates banner/MOTD data before command is sent
          };

          // Handle incoming data - accumulate and emit complete lines
          stream.on('data', (data: Buffer) => {
            const text = data.toString('utf-8');

            // Route data based on whether a command is in progress
            // commandSentTime > 0 means a command has been sent and we should capture output
            // commandSentTime === 0 means no command - data is banner/MOTD and should be discarded
            if (session.commandSentTime > 0) {
              // Command is in progress - accumulate in main buffer
              session.buffer += text;
              session.lineBuffer += text;
            } else {
              // No command in progress - accumulate in preCommandBuffer (will be discarded)
              session.preCommandBuffer += text;
              // Also add to buffer temporarily for prompt detection during initialization
              session.buffer += text;
            }

            // Only emit output if not suppressed (during command execution, we suppress)
            if (!session.suppressOutput) {
              this.emitCompleteLines(session);
            }

            // Try to detect prompt if we don't have one
            if (!session.promptRegex) {
              const prompt = PromptDetector.tryDetectPrompt(session.buffer);
              if (prompt) {
                session.currentPrompt = prompt;
                session.promptRegex = PromptDetector.buildPromptRegex(prompt);
                this.emitDebug(host.id, `Prompt detected: ${prompt}`);
              }
            }
          });

          stream.on('close', () => {
            // Suppress any remaining output on close to prevent banner/MOTD from leaking
            session.suppressOutput = true;
            session.lineBuffer = '';
            this.sessions.delete(host.id);
            this.emit('progress', host.id, 'disconnected');
          });

          stream.on('error', (err: Error) => {
            this.emit('progress', host.id, `error: ${err.message}`);
          });

          this.sessions.set(host.id, session);

          // Initialize: wait for initial prompt
          // Note: suppressOutput is already true from session creation
          this.initializeSession(session)
            .then(() => {
              // Clear ALL buffers but keep output suppressed
              // Output will only be emitted during explicit command execution
              // This prevents late banner messages from appearing
              session.buffer = '';
              session.lineBuffer = '';
              session.lastEmittedIndex = 0;
              // Note: suppressOutput stays true - command execution will handle output
              this.emit('progress', host.id, 'connected');
              resolve();
            })
            .catch(reject);
        });
      });

      client.on('error', (err) => {
        reject(err);
      });

      client.on('close', () => {
        this.sessions.delete(host.id);
      });

      // Connect
      client.connect({
        host: host.ipAddress,
        port: host.port || 22,
        username: host.username || '',
        password: host.password || '',
        readyTimeout: this.timeouts.connectionTimeout,
        keepaliveInterval: 10000,
      });
    });
  }

  /**
   * Emit complete lines from the line buffer
   */
  private emitCompleteLines(session: SshSession): void {
    // Find complete lines (ending with \n or \r\n)
    const lines = session.lineBuffer.split(/\r?\n/);

    // If there's no newline, nothing to emit yet
    if (lines.length <= 1) {
      return;
    }

    // Keep the last incomplete line in the buffer
    session.lineBuffer = lines.pop() || '';

    // Emit each complete line
    for (const line of lines) {
      if (line.length > 0 || lines.length > 1) {
        // Process the line: sanitize and handle control characters
        const processed = TerminalOutputProcessor.sanitize(line);
        if (processed !== undefined) {
          this.emit('output', session.host.id, processed);
        }
      }
    }
  }

  /**
   * Flush any remaining content in the line buffer
   * Only emits if suppressOutput is false
   */
  private flushLineBuffer(session: SshSession): void {
    if (session.lineBuffer.length > 0) {
      // Only emit if not suppressed - this prevents banner messages from being sent
      if (!session.suppressOutput) {
        const processed = TerminalOutputProcessor.sanitize(session.lineBuffer);
        if (processed) {
          this.emit('output', session.host.id, processed);
        }
      }
      session.lineBuffer = '';
    }
  }

  /**
   * Initialize session by waiting for initial prompt
   */
  private async initializeSession(session: SshSession): Promise<void> {
    // Send empty line to trigger prompt
    session.shell.write('\n');

    // Wait for prompt detection
    const startTime = Date.now();
    const timeout = this.timeouts.connectionTimeout;

    return new Promise((resolve, reject) => {
      const checkPrompt = setInterval(() => {
        if (session.promptRegex) {
          clearInterval(checkPrompt);
          // Don't flush - suppress all output during initialization to hide banner/MOTD
          session.lineBuffer = '';
          this.emitDebug(session.host.id, `Session initialized with prompt: ${session.currentPrompt}`);
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(checkPrompt);
          // Try one more time to detect from buffer
          const prompt = PromptDetector.tryDetectPrompt(session.buffer);
          if (prompt) {
            session.currentPrompt = prompt;
            session.promptRegex = PromptDetector.buildPromptRegex(prompt);
            // Don't flush - suppress all output during initialization to hide banner/MOTD
            session.lineBuffer = '';
            this.emitDebug(session.host.id, `Prompt detected on timeout: ${prompt}`);
            resolve();
          } else {
            reject(new Error('Failed to detect initial prompt'));
          }
        }
      }, this.timeouts.pollInterval);
    });
  }

  /**
   * Disconnect from a host
   */
  async disconnect(hostId: string): Promise<void> {
    const session = this.sessions.get(hostId);
    if (session) {
      // Suppress any remaining output to prevent banner/MOTD from leaking
      session.suppressOutput = true;
      session.lineBuffer = '';
      session.shell.close();
      session.client.end();
      this.sessions.delete(hostId);
    }
  }

  /**
   * Execute a command on a connected host with proper paging handling
   */
  async execute(hostId: string, command: string, timeout?: number): Promise<ExecutionResult> {
    const session = this.sessions.get(hostId);
    if (!session) {
      return {
        hostId,
        host: { id: hostId, ipAddress: '', port: 22, variables: {} },
        output: '',
        success: false,
        errorMessage: 'Not connected',
        timestamp: new Date(),
      };
    }

    const commandTimeout = timeout || this.timeouts.commandTimeout;
    const startTime = Date.now();

    return new Promise((resolve) => {
      // Suppress real-time output during command execution
      // We'll emit the clean result at the end
      session.suppressOutput = true;
      session.commandEchoLength = command.length + 1; // +1 for newline

      // Keep commandSentTime at 0 during the drain period
      // Any data arriving now goes to preCommandBuffer (discarded)
      session.commandSentTime = 0;

      // Wait for any in-flight banner/MOTD data to arrive and be routed to preCommandBuffer
      // This is similar to the C# implementation's 100ms trailing data wait
      setTimeout(() => {
        // NOW clear all buffers - any data that arrived during the wait is banner/MOTD
        session.buffer = '';
        session.lineBuffer = '';
        session.preCommandBuffer = '';

        // NOW set commandSentTime - from this point forward, data goes to main buffer
        session.commandSentTime = Date.now();

        // Send command
        session.shell.write(command + '\n');
        this.emitDebug(hostId, `Sent command: ${command}`);

        let potentialPromptDetected = false;
        let potentialPromptTime: number | null = null;
        let lastDataTime = Date.now();
        let lastBufferLength = 0;
        let justDismissedPager = false;
        let pageCount = 0;
        const maxPages = 50000;

        // Process buffer periodically
        const processBuffer = () => {
          const elapsed = Date.now() - startTime;

          // Check for timeout
          if (elapsed >= commandTimeout) {
            clearInterval(checkInterval);
            this.emitDebug(hostId, 'Command timeout reached');
            resolve(this.createResult(session, false, `Command timed out after ${commandTimeout}ms`, elapsed));
            return;
          }

          // Check for cancellation
          if (this.cancelled) {
            clearInterval(checkInterval);
            resolve(this.createResult(session, false, 'Execution cancelled', elapsed));
            return;
          }

          // Track new data arrival
          if (session.buffer.length > lastBufferLength) {
            lastDataTime = Date.now();
            lastBufferLength = session.buffer.length;
            // Reset prompt detection if new data arrived
            if (potentialPromptDetected) {
              potentialPromptDetected = false;
              potentialPromptTime = null;
            }
          }

          // Check for pager in buffer
          if (TerminalOutputProcessor.containsPagerPrompt(session.buffer)) {
            if (pageCount < maxPages) {
              this.emitDebug(hostId, 'Pager detected, sending space');
              // Strip the pager from buffer before continuing
              const { text } = TerminalOutputProcessor.stripPagerArtifacts(session.buffer);
              session.buffer = text;
              // Also strip from line buffer
              const lineResult = TerminalOutputProcessor.stripPagerArtifacts(session.lineBuffer);
              session.lineBuffer = lineResult.text;
              // Send space to continue
              session.shell.write(' ');
              pageCount++;
              justDismissedPager = true;
              lastDataTime = Date.now();
              potentialPromptDetected = false;
              potentialPromptTime = null;
              return;
            }
          }

          // Handle pager dismissal artifacts
          if (justDismissedPager) {
            session.buffer = TerminalOutputProcessor.stripPagerDismissalArtifacts(session.buffer);
            session.lineBuffer = TerminalOutputProcessor.stripPagerDismissalArtifacts(session.lineBuffer);
            justDismissedPager = false;
          }

          // Check if we have a definitive prompt match
          if (session.promptRegex && PromptDetector.bufferEndsWithPrompt(session.buffer, session.promptRegex)) {
            clearInterval(checkInterval);
            this.emitDebug(hostId, 'Prompt detected via regex match');
            resolve(this.createResult(session, true, undefined, elapsed));
            return;
          }

          // Check for potential prompt and confirm after quiet period
          if (!potentialPromptDetected) {
            const detectedPrompt = PromptDetector.tryDetectPromptFromTail(session.buffer);
            if (detectedPrompt && PromptDetector.isLikelyPrompt(detectedPrompt)) {
              potentialPromptDetected = true;
              potentialPromptTime = Date.now();
              this.emitDebug(hostId, `Potential prompt detected: ${detectedPrompt}, waiting to confirm...`);
            }
          } else if (potentialPromptTime) {
            // Confirm after quiet period
            const timeSincePotential = Date.now() - potentialPromptTime;
            if (timeSincePotential >= this.timeouts.promptConfirmMs) {
              // Check if buffer still ends with prompt
              const detectedPrompt = PromptDetector.tryDetectPromptFromTail(session.buffer);
              if (detectedPrompt && PromptDetector.isLikelyPrompt(detectedPrompt)) {
                clearInterval(checkInterval);
                this.emitDebug(hostId, `Prompt confirmed after ${timeSincePotential}ms quiet`);
                // Update prompt if changed
                if (!session.promptRegex?.test(detectedPrompt)) {
                  session.currentPrompt = detectedPrompt;
                  session.promptRegex = PromptDetector.buildPromptRegex(detectedPrompt);
                }
                resolve(this.createResult(session, true, undefined, elapsed));
                return;
              }
              potentialPromptDetected = false;
              potentialPromptTime = null;
            }
          }

          // Check for idle timeout
          const timeSinceData = Date.now() - lastDataTime;
          if (timeSinceData > this.timeouts.idleTimeout) {
            // Check one more time for prompt
            const detectedPrompt = PromptDetector.tryDetectPromptFromTail(session.buffer);
            if (detectedPrompt && PromptDetector.isLikelyPrompt(detectedPrompt)) {
              clearInterval(checkInterval);
              this.emitDebug(hostId, 'Prompt found after idle timeout');
              resolve(this.createResult(session, true, undefined, elapsed));
              return;
            }
          }
        };

        const checkInterval = setInterval(processBuffer, this.timeouts.pollInterval);
      }, 100); // 100ms delay to let any in-flight banner data drain
    });
  }

  /**
   * Create execution result from session buffer
   */
  private createResult(
    session: SshSession,
    success: boolean,
    errorMessage?: string,
    duration?: number
  ): ExecutionResult {
    // Reset commandSentTime to 0 - any data arriving after this goes to preCommandBuffer (discarded)
    // This is crucial: it ensures any late-arriving banner/MOTD data doesn't leak into future commands
    session.commandSentTime = 0;

    // Keep output suppressed - the IPC handler sends output explicitly via sendToRenderer
    // This prevents late-arriving banner/warning messages from leaking through
    session.suppressOutput = true;
    session.lineBuffer = '';

    // Clear preCommandBuffer to free memory (banner data is no longer needed)
    session.preCommandBuffer = '';

    let output = session.buffer;

    // Normalize output
    output = TerminalOutputProcessor.normalize(output);

    // Remove command echo from beginning (first line)
    const lines = output.split('\n');
    if (lines.length > 0) {
      lines.shift(); // Remove command echo
    }

    // Remove prompt from end
    if (lines.length > 0 && session.promptRegex) {
      const lastLine = lines[lines.length - 1];
      if (session.promptRegex.test(lastLine) || PromptDetector.isLikelyPrompt(lastLine.trim())) {
        lines.pop();
      }
    }

    output = lines.join('\n');

    // Strip any remaining pager artifacts
    const { text } = TerminalOutputProcessor.stripPagerArtifacts(output);
    output = text;

    // Emit the clean output (the IPC handler will format and send to renderer)
    // Note: We don't emit here - the IPC handler sends the output via sendToRenderer

    return {
      hostId: session.host.id,
      host: session.host,
      output,
      success,
      errorMessage,
      timestamp: new Date(),
      duration,
    };
  }

  /**
   * Execute command on multiple hosts
   */
  async executeOnHosts(hosts: HostConnection[], command: string, timeout = 30000): Promise<void> {
    this.cancelled = false;

    for (const host of hosts) {
      if (this.cancelled) break;

      this.emit('progress', host.id, 'connecting');

      try {
        // Connect if not already connected
        if (!this.sessions.has(host.id)) {
          await this.connect(host);
        }

        this.emit('progress', host.id, 'running');

        const result = await this.execute(host.id, command, timeout);
        this.emit('complete', result);

        if (result.success) {
          this.emit('progress', host.id, 'success');
        } else {
          this.emit('progress', host.id, 'error');
        }
      } catch (error) {
        const result: ExecutionResult = {
          hostId: host.id,
          host,
          output: '',
          success: false,
          errorMessage: (error as Error).message,
          timestamp: new Date(),
        };
        this.emit('complete', result);
        this.emit('progress', host.id, 'error');
      }
    }
  }

  /**
   * Emit debug message if debug mode is enabled
   */
  private emitDebug(hostId: string, message: string): void {
    if (this.debugMode) {
      const timestamp = new Date().toISOString().slice(11, 23);
      this.emit('debug', hostId, `[DEBUG ${timestamp}] ${message}`);
    }
  }

  /**
   * Cancel current execution
   */
  cancelExecution(): void {
    this.cancelled = true;
  }

  /**
   * Disconnect all sessions
   */
  disconnectAll(): void {
    for (const [hostId] of this.sessions) {
      this.disconnect(hostId);
    }
  }

  /**
   * Check if connected to a host
   */
  isConnected(hostId: string): boolean {
    return this.sessions.has(hostId);
  }

  /**
   * Get the current prompt for a host
   */
  getCurrentPrompt(hostId: string): string {
    const session = this.sessions.get(hostId);
    return session?.currentPrompt || '';
  }

  /**
   * Set timeout options
   */
  setTimeouts(options: Partial<TimeoutOptions>): void {
    this.timeouts = { ...this.timeouts, ...options };
  }
}
