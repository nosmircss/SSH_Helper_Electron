import { EventEmitter } from 'events';
import { Client, ClientChannel } from 'ssh2';
import type { HostConnection, ExecutionResult } from '../../shared/models';
import { PromptDetector } from '../utils/PromptDetector';
import { TerminalOutputProcessor } from '../utils/TerminalOutputProcessor';

interface PooledConnection {
  client: Client;
  shell: ClientChannel;
  host: HostConnection;
  promptRegex: RegExp | null;
  currentPrompt: string;
  buffer: string;
  lastUsed: number;
  inUse: boolean;
}

interface PoolConfig {
  maxConnectionsPerHost: number;
  connectionTimeout: number;
  commandTimeout: number;
  idleTimeout: number;
  keepaliveInterval: number;
  pollInterval: number;
  promptConfirmMs: number;
}

const DEFAULT_CONFIG: PoolConfig = {
  maxConnectionsPerHost: 1,
  connectionTimeout: 10000,
  commandTimeout: 30000,
  idleTimeout: 300000, // 5 minutes
  keepaliveInterval: 10000,
  pollInterval: 50,
  promptConfirmMs: 150,
};

/**
 * SSH Connection Pool for managing and reusing SSH connections
 * Ported from: Services/SshConnectionPool.cs
 */
export class SshConnectionPool extends EventEmitter {
  private connections: Map<string, PooledConnection> = new Map();
  private config: PoolConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private cancelled = false;
  public debugMode = false;

  constructor(config: Partial<PoolConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupTask();
  }

  /**
   * Get or create a connection for a host
   */
  async getConnection(host: HostConnection): Promise<PooledConnection> {
    const key = this.getConnectionKey(host);
    let connection = this.connections.get(key);

    if (connection && this.isConnectionValid(connection)) {
      connection.lastUsed = Date.now();
      connection.inUse = true;
      return connection;
    }

    // Remove invalid connection if exists
    if (connection) {
      await this.removeConnection(key);
    }

    // Create new connection
    connection = await this.createConnection(host);
    this.connections.set(key, connection);
    return connection;
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection(host: HostConnection): void {
    const key = this.getConnectionKey(host);
    const connection = this.connections.get(key);
    if (connection) {
      connection.inUse = false;
      connection.lastUsed = Date.now();
    }
  }

  /**
   * Close a specific connection
   */
  async closeConnection(host: HostConnection): Promise<void> {
    const key = this.getConnectionKey(host);
    await this.removeConnection(key);
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    const keys = Array.from(this.connections.keys());
    for (const key of keys) {
      await this.removeConnection(key);
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): { total: number; inUse: number; idle: number } {
    let inUse = 0;
    let idle = 0;
    for (const conn of this.connections.values()) {
      if (conn.inUse) {
        inUse++;
      } else {
        idle++;
      }
    }
    return { total: this.connections.size, inUse, idle };
  }

  /**
   * Check if connected to a host
   */
  isConnected(host: HostConnection): boolean {
    const key = this.getConnectionKey(host);
    const connection = this.connections.get(key);
    return connection ? this.isConnectionValid(connection) : false;
  }

  /**
   * Execute a command on a connection with proper paging handling
   */
  async execute(host: HostConnection, command: string, timeout?: number): Promise<ExecutionResult> {
    const connection = await this.getConnection(host);
    const commandTimeout = timeout || this.config.commandTimeout;
    const startTime = Date.now();

    return new Promise((resolve) => {
      // Clear buffer and prepare for command
      connection.buffer = '';

      // Send command
      connection.shell.write(command + '\n');
      this.emitDebug(host.id, `Sent command: ${command}`);

      let potentialPromptDetected = false;
      let potentialPromptTime: number | null = null;
      let lastDataTime = Date.now();
      let lastBufferLength = 0;
      let justDismissedPager = false;
      let pageCount = 0;
      const maxPages = 50000;

      const processBuffer = () => {
        const elapsed = Date.now() - startTime;

        // Check for timeout
        if (elapsed >= commandTimeout) {
          clearInterval(checkInterval);
          this.emitDebug(host.id, 'Command timeout reached');
          this.releaseConnection(host);
          resolve(this.createResult(connection, false, `Command timed out after ${commandTimeout}ms`, elapsed));
          return;
        }

        // Check for cancellation
        if (this.cancelled) {
          clearInterval(checkInterval);
          this.releaseConnection(host);
          resolve(this.createResult(connection, false, 'Execution cancelled', elapsed));
          return;
        }

        // Track new data
        if (connection.buffer.length > lastBufferLength) {
          lastDataTime = Date.now();
          lastBufferLength = connection.buffer.length;
          // Reset prompt detection if new data arrived
          if (potentialPromptDetected) {
            potentialPromptDetected = false;
            potentialPromptTime = null;
            this.emitDebug(host.id, 'New data arrived, resetting prompt detection');
          }
        }

        // Check for pager in buffer
        if (TerminalOutputProcessor.containsPagerPrompt(connection.buffer)) {
          if (pageCount < maxPages) {
            this.emitDebug(host.id, 'Pager detected, sending space');
            const { text } = TerminalOutputProcessor.stripPagerArtifacts(connection.buffer);
            connection.buffer = text;
            connection.shell.write(' ');
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
          connection.buffer = TerminalOutputProcessor.stripPagerDismissalArtifacts(connection.buffer);
          justDismissedPager = false;
        }

        // Check if we have a definitive prompt match
        if (connection.promptRegex && PromptDetector.bufferEndsWithPrompt(connection.buffer, connection.promptRegex)) {
          clearInterval(checkInterval);
          this.emitDebug(host.id, 'Prompt detected via regex match');
          this.releaseConnection(host);
          resolve(this.createResult(connection, true, undefined, elapsed));
          return;
        }

        // Check for potential prompt and confirm after quiet period
        if (!potentialPromptDetected) {
          const detectedPrompt = PromptDetector.tryDetectPromptFromTail(connection.buffer);
          if (detectedPrompt && PromptDetector.isLikelyPrompt(detectedPrompt)) {
            potentialPromptDetected = true;
            potentialPromptTime = Date.now();
            this.emitDebug(host.id, `Potential prompt detected: ${detectedPrompt}, waiting to confirm...`);
          }
        } else if (potentialPromptTime) {
          const timeSincePotential = Date.now() - potentialPromptTime;
          if (timeSincePotential >= this.config.promptConfirmMs) {
            const detectedPrompt = PromptDetector.tryDetectPromptFromTail(connection.buffer);
            if (detectedPrompt && PromptDetector.isLikelyPrompt(detectedPrompt)) {
              clearInterval(checkInterval);
              this.emitDebug(host.id, `Prompt confirmed after ${timeSincePotential}ms quiet`);
              if (!connection.promptRegex?.test(detectedPrompt)) {
                connection.currentPrompt = detectedPrompt;
                connection.promptRegex = PromptDetector.buildPromptRegex(detectedPrompt);
              }
              this.releaseConnection(host);
              resolve(this.createResult(connection, true, undefined, elapsed));
              return;
            }
            potentialPromptDetected = false;
            potentialPromptTime = null;
          }
        }

        // Check for idle timeout
        const timeSinceData = Date.now() - lastDataTime;
        if (timeSinceData > this.config.idleTimeout) {
          const detectedPrompt = PromptDetector.tryDetectPromptFromTail(connection.buffer);
          if (detectedPrompt && PromptDetector.isLikelyPrompt(detectedPrompt)) {
            clearInterval(checkInterval);
            this.emitDebug(host.id, 'Prompt found after idle timeout');
            this.releaseConnection(host);
            resolve(this.createResult(connection, true, undefined, elapsed));
            return;
          }
        }
      };

      const checkInterval = setInterval(processBuffer, this.config.pollInterval);
    });
  }

  /**
   * Create execution result from connection buffer
   */
  private createResult(
    connection: PooledConnection,
    success: boolean,
    errorMessage?: string,
    duration?: number
  ): ExecutionResult {
    let output = connection.buffer;

    // Normalize output
    output = TerminalOutputProcessor.normalize(output);

    // Remove command echo from beginning (first line)
    const lines = output.split('\n');
    if (lines.length > 0) {
      lines.shift();
    }

    // Remove prompt from end
    if (lines.length > 0 && connection.promptRegex) {
      const lastLine = lines[lines.length - 1];
      if (connection.promptRegex.test(lastLine) || PromptDetector.isLikelyPrompt(lastLine.trim())) {
        lines.pop();
      }
    }

    output = lines.join('\n').trim();

    // Strip any remaining pager artifacts
    const { text } = TerminalOutputProcessor.stripPagerArtifacts(output);
    output = text;

    return {
      hostId: connection.host.id,
      host: connection.host,
      output,
      success,
      errorMessage,
      timestamp: new Date(),
      duration,
    };
  }

  /**
   * Cancel current execution
   */
  cancelExecution(): void {
    this.cancelled = true;
  }

  /**
   * Dispose the pool
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.closeAll();
  }

  /**
   * Get current prompt for a host
   */
  getCurrentPrompt(host: HostConnection): string {
    const key = this.getConnectionKey(host);
    const connection = this.connections.get(key);
    return connection?.currentPrompt || '';
  }

  private getConnectionKey(host: HostConnection): string {
    return `${host.ipAddress}:${host.port || 22}:${host.username || ''}`;
  }

  private isConnectionValid(connection: PooledConnection): boolean {
    try {
      return connection.client && (connection.client as any)._sock?.readable;
    } catch {
      return false;
    }
  }

  private async createConnection(host: HostConnection): Promise<PooledConnection> {
    return new Promise((resolve, reject) => {
      const client = new Client();

      const timeout = setTimeout(() => {
        client.end();
        reject(new Error(`Connection timeout after ${this.config.connectionTimeout}ms`));
      }, this.config.connectionTimeout);

      client.on('ready', () => {
        clearTimeout(timeout);
        client.shell({ term: 'xterm-256color', cols: 200, rows: 48 }, (err, stream) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          const connection: PooledConnection = {
            client,
            shell: stream,
            host,
            promptRegex: null,
            currentPrompt: '',
            buffer: '',
            lastUsed: Date.now(),
            inUse: true,
          };

          // Handle incoming data - accumulate to buffer, emit processed chunks
          stream.on('data', (data: Buffer) => {
            const text = data.toString('utf-8');
            connection.buffer += text;

            // Process chunk: sanitize
            const processedChunk = TerminalOutputProcessor.sanitize(text);

            // Emit the processed chunk (NOT character by character)
            if (processedChunk) {
              this.emit('output', host.id, processedChunk);
            }

            // Try to detect prompt if we don't have one
            if (!connection.promptRegex) {
              const prompt = PromptDetector.tryDetectPrompt(connection.buffer);
              if (prompt) {
                connection.currentPrompt = prompt;
                connection.promptRegex = PromptDetector.buildPromptRegex(prompt);
                this.emitDebug(host.id, `Prompt detected: ${prompt}`);
              }
            }
          });

          stream.on('close', () => {
            const key = this.getConnectionKey(host);
            this.connections.delete(key);
            this.emit('disconnected', host.id);
          });

          stream.on('error', (err: Error) => {
            this.emit('error', host.id, err.message);
          });

          // Initialize: send newline to trigger prompt
          stream.write('\n');

          // Wait a bit for initial prompt detection
          setTimeout(() => {
            this.emit('connected', host.id);
            resolve(connection);
          }, 500);
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      client.on('close', () => {
        const key = this.getConnectionKey(host);
        this.connections.delete(key);
      });

      client.connect({
        host: host.ipAddress,
        port: host.port || 22,
        username: host.username || '',
        password: host.password || '',
        readyTimeout: this.config.connectionTimeout,
        keepaliveInterval: this.config.keepaliveInterval,
      });
    });
  }

  private emitDebug(hostId: string, message: string): void {
    if (this.debugMode) {
      const timestamp = new Date().toISOString().slice(11, 23);
      this.emit('debug', hostId, `[DEBUG ${timestamp}] ${message}`);
    }
  }

  private async removeConnection(key: string): Promise<void> {
    const connection = this.connections.get(key);
    if (connection) {
      try {
        connection.shell?.close();
        connection.client?.end();
      } catch {
        // Ignore errors during cleanup
      }
      this.connections.delete(key);
    }
  }

  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, connection] of this.connections) {
        if (!connection.inUse && (now - connection.lastUsed) > this.config.idleTimeout) {
          this.removeConnection(key);
        }
      }
    }, 60000);
  }
}
