import { EventEmitter } from 'events';
import type { OutputType } from '../../shared/models';

/**
 * Script output event data
 */
export interface ScriptOutputEvent {
  message: string;
  type: OutputType;
}

/**
 * Column update event data
 */
export interface ColumnUpdateEvent {
  columnName: string;
  value: string;
}

/**
 * Script exit status
 */
export type ScriptExitStatus = 'success' | 'failure' | 'cancelled' | 'error';

/**
 * Result of script execution
 */
export interface ScriptResult {
  status: ScriptExitStatus;
  message: string;
  fullOutput: string;
  error?: Error;
}

/**
 * Manages the execution context for a script, including variables and output
 * Ported from: Services/Scripting/ScriptContext.cs
 */
export class ScriptContext extends EventEmitter {
  private variables: Map<string, unknown> = new Map();
  private output: string[] = [];
  private lastCommandOutput: string = '';

  /** Debug mode - when true, debug output is shown */
  debugMode: boolean = false;

  /** Session ID for SSH operations */
  sessionId?: string;

  /** Host ID for tracking which host this context is for */
  hostId?: string;

  /** Row index in the host grid */
  rowIndex?: number;

  constructor(initialVariables?: Record<string, string>) {
    super();

    // Import initial variables (e.g., from CSV columns)
    if (initialVariables) {
      for (const [key, value] of Object.entries(initialVariables)) {
        this.variables.set(key.toLowerCase(), value);
      }
    }

    // Add built-in variables
    this.variables.set('_timestamp', new Date().toISOString().replace('T', ' ').substring(0, 19));
  }

  /**
   * Sets a variable value
   */
  setVariable(name: string, value: unknown): void {
    this.variables.set(name.toLowerCase(), value);
  }

  /**
   * Gets a variable value, or undefined if not found
   */
  getVariable(name: string): unknown {
    return this.variables.get(name.toLowerCase());
  }

  /**
   * Gets a variable as a string, with fallback to empty string
   */
  getVariableString(name: string): string {
    const value = this.getVariable(name);
    return value?.toString() ?? '';
  }

  /**
   * Gets a variable as a list (for array variables)
   */
  getVariableList(name: string): string[] {
    const value = this.getVariable(name);
    if (Array.isArray(value)) {
      return value.map((v) => String(v));
    }
    if (typeof value === 'string') {
      return [value];
    }
    return [];
  }

  /**
   * Checks if a variable exists
   */
  hasVariable(name: string): boolean {
    return this.variables.has(name.toLowerCase());
  }

  /**
   * Gets all current variables (for debugging/inspection)
   */
  getAllVariables(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.variables) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Substitutes ${variable} placeholders in a string
   * Supports nested references and array indexing: ${array[0]} or ${array[index]}
   */
  substituteVariables(input: string): string {
    if (!input) return input;

    // Handle special _output variable
    let result = input.replace(/\$\{_output\}/g, this.lastCommandOutput);

    // Replace ${variable} patterns
    result = result.replace(/\$\{([^}]+)\}/g, (_match, expr) => {
      return this.resolveVariableExpression(expr);
    });

    return result;
  }

  /**
   * Resolves a variable expression which may include array indexing
   */
  private resolveVariableExpression(expr: string): string {
    // Check for array indexing: varname[index]
    const arrayMatch = expr.match(/^(\w+)\[([^\]]+)\]$/);
    if (arrayMatch) {
      const varName = arrayMatch[1];
      const indexExpr = arrayMatch[2];

      // Resolve the index (could be a number or variable name)
      let index = parseInt(indexExpr, 10);
      if (isNaN(index)) {
        // Try to get index from a variable
        const indexVar = this.getVariable(indexExpr);
        if (indexVar !== undefined) {
          index = parseInt(String(indexVar), 10);
        }
        if (isNaN(index)) {
          return '';
        }
      }

      const list = this.getVariableList(varName);
      if (index >= 0 && index < list.length) {
        return list[index];
      }
      return '';
    }

    // Simple variable lookup
    return this.getVariableString(expr);
  }

  /**
   * Records the output of a command and optionally captures it to a variable
   */
  recordCommandOutput(output: string, captureVariable?: string): void {
    this.lastCommandOutput = output;
    this.variables.set('_output', output);
    this.output.push(output);

    if (captureVariable) {
      this.setVariable(captureVariable, output);
    }
  }

  /**
   * Gets the last command output
   */
  getLastCommandOutput(): string {
    return this.lastCommandOutput;
  }

  /**
   * Gets the accumulated full output
   */
  getFullOutput(): string {
    return this.output.join('\n');
  }

  /**
   * Emits output to subscribers
   */
  emitOutput(message: string, type: OutputType = 'Info'): void {
    // Suppress debug output when not in debug mode
    if (type === 'Debug' && !this.debugMode) {
      return;
    }

    this.output.push(message);
    this.emit('output', { message, type } as ScriptOutputEvent);
  }

  /**
   * Clears the accumulated output
   */
  clearOutput(): void {
    this.output = [];
  }

  /**
   * Requests an update to a column in the host table
   */
  requestColumnUpdate(columnName: string, value: string): void {
    this.emit('columnUpdate', { columnName, value } as ColumnUpdateEvent);
  }

  /**
   * Imports variables from a script's vars section
   * Only sets if not already defined (CSV variables take precedence)
   */
  importScriptVars(vars: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(vars)) {
      const lowerKey = key.toLowerCase();
      if (!this.variables.has(lowerKey)) {
        this.variables.set(lowerKey, value);
      }
    }
  }
}
