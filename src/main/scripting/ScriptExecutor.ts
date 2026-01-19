import type { Script, ScriptStep, StepType } from '../../shared/models';
import { ScriptContext, type ScriptResult } from './ScriptContext';
import type { IScriptCommand, CommandResult } from './commands/IScriptCommand';
import type { StepExecutor } from './commands/IfCommand';
import { successResult } from './commands/IScriptCommand';

import { SendCommand } from './commands/SendCommand';
import { PrintCommand } from './commands/PrintCommand';
import { SetCommand } from './commands/SetCommand';
import { WaitCommand } from './commands/WaitCommand';
import { ExitCommand } from './commands/ExitCommand';
import { IfCommand } from './commands/IfCommand';
import { ForeachCommand } from './commands/ForeachCommand';
import { WhileCommand } from './commands/WhileCommand';
import { ExtractCommand } from './commands/ExtractCommand';
import { ReadFileCommand } from './commands/ReadFileCommand';
import { WriteFileCommand } from './commands/WriteFileCommand';
import { InputCommand, type InputHandler } from './commands/InputCommand';
import { UpdateColumnCommand } from './commands/UpdateColumnCommand';
import { SshExecutionService } from '../services/SshExecutionService';

/**
 * Executes parsed scripts by dispatching steps to command handlers
 * Ported from: Services/Scripting/ScriptExecutor.cs
 */
export class ScriptExecutor implements StepExecutor {
  private commands: Map<StepType, IScriptCommand> = new Map();
  private cancelled: boolean = false;

  constructor(sshService: SshExecutionService, inputHandler?: InputHandler) {
    // Register command handlers
    this.commands.set('send', new SendCommand(sshService));
    this.commands.set('print', new PrintCommand());
    this.commands.set('set', new SetCommand());
    this.commands.set('wait', new WaitCommand());
    this.commands.set('exit', new ExitCommand());
    this.commands.set('if', new IfCommand(this));
    this.commands.set('foreach', new ForeachCommand(this));
    this.commands.set('while', new WhileCommand(this));
    this.commands.set('extract', new ExtractCommand());
    this.commands.set('readfile', new ReadFileCommand());
    this.commands.set('writefile', new WriteFileCommand());
    this.commands.set('input', new InputCommand(inputHandler));
    this.commands.set('updatecolumn', new UpdateColumnCommand());
  }

  /**
   * Execute a script
   */
  async execute(script: Script, context: ScriptContext): Promise<ScriptResult> {
    this.cancelled = false;
    const startTime = Date.now();

    // Import script variables
    if (script.vars) {
      context.importScriptVars(script.vars);
    }

    // Set debug mode
    if (script.debug) {
      context.debugMode = true;
    }

    // Log script start
    if (script.name) {
      context.emitOutput(`Starting script: ${script.name}`, 'Info');
    }

    // Debug: Script start summary
    context.emitOutput(`[SCRIPT START] ========================================`, 'Debug');
    if (script.name) {
      context.emitOutput(`  Name: ${script.name}`, 'Debug');
    }
    context.emitOutput(`  Steps: ${script.steps.length}`, 'Debug');
    const initialVars = context.getAllVariables();
    const varCount = Object.keys(initialVars).length;
    if (varCount > 0) {
      context.emitOutput(`  Initial variables: ${varCount}`, 'Debug');
      // Show first few variables
      const varEntries = Object.entries(initialVars).slice(0, 5);
      for (const [name, value] of varEntries) {
        const displayValue = typeof value === 'string' && value.length > 30
          ? `"${value.substring(0, 27)}..."`
          : JSON.stringify(value);
        context.emitOutput(`    ${name} = ${displayValue}`, 'Debug');
      }
      if (varCount > 5) {
        context.emitOutput(`    ... and ${varCount - 5} more`, 'Debug');
      }
    }
    context.emitOutput(`[SCRIPT START] ========================================`, 'Debug');

    try {
      const result = await this.executeSteps(script.steps, context);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

      // Debug: Script end summary
      const finalVars = context.getAllVariables();
      const finalVarCount = Object.keys(finalVars).length;
      context.emitOutput(`[SCRIPT END] ==========================================`, 'Debug');
      context.emitOutput(`  Duration: ${elapsed}s`, 'Debug');
      context.emitOutput(`  Status: ${result.success ? 'SUCCESS' : 'FAILED'}`, 'Debug');
      if (result.controlFlow === 'exit') {
        context.emitOutput(`  Exit reason: ${result.exitMessage || 'explicit exit'}`, 'Debug');
      }
      context.emitOutput(`  Final variables (${finalVarCount}):`, 'Debug');
      this.emitVariableSummary(context, finalVars);
      context.emitOutput(`[SCRIPT END] ==========================================`, 'Debug');

      if (result.controlFlow === 'exit') {
        return {
          status: result.success ? 'success' : 'failure',
          message: result.exitMessage || '',
          fullOutput: context.getFullOutput(),
        };
      }

      if (!result.success) {
        return {
          status: 'error',
          message: result.error || 'Script failed',
          fullOutput: context.getFullOutput(),
        };
      }

      return {
        status: 'success',
        message: 'Script completed successfully',
        fullOutput: context.getFullOutput(),
      };
    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      const finalVars = context.getAllVariables();
      const finalVarCount = Object.keys(finalVars).length;
      context.emitOutput(`[SCRIPT END] ==========================================`, 'Debug');
      context.emitOutput(`  Duration: ${elapsed}s`, 'Debug');
      context.emitOutput(`  Status: ERROR - ${(error as Error).message}`, 'Debug');
      context.emitOutput(`  Final variables (${finalVarCount}):`, 'Debug');
      this.emitVariableSummary(context, finalVars);
      context.emitOutput(`[SCRIPT END] ==========================================`, 'Debug');

      return {
        status: 'error',
        message: (error as Error).message,
        fullOutput: context.getFullOutput(),
        error: error as Error,
      };
    }
  }

  /**
   * Execute a list of steps (used by control flow commands)
   */
  async executeSteps(steps: ScriptStep[], context: ScriptContext): Promise<CommandResult> {
    for (const step of steps) {
      if (this.cancelled) {
        return {
          success: false,
          controlFlow: 'exit',
          exitMessage: 'Script cancelled',
        };
      }

      const result = await this.executeStep(step, context);

      // Handle control flow
      if (result.controlFlow !== 'normal') {
        return result;
      }

      if (!result.success) {
        return result;
      }
    }

    return successResult();
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: ScriptStep, context: ScriptContext): Promise<CommandResult> {
    const command = this.commands.get(step.type);

    if (!command) {
      context.emitOutput(`Unknown command type: ${step.type}`, 'Warning');
      return successResult();
    }

    try {
      return await command.execute(step, context);
    } catch (error) {
      const message = (error as Error).message;
      context.emitOutput(`Error executing ${step.type}: ${message}`, 'Error');

      if (step.onError === 'continue') {
        return successResult();
      }

      return {
        success: false,
        controlFlow: 'normal',
        error: message,
      };
    }
  }

  /**
   * Cancel script execution
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Check if execution is cancelled
   */
  isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Emit a formatted summary of all variables (for debug output)
   */
  private emitVariableSummary(context: ScriptContext, vars: Record<string, unknown>): void {
    // Filter out internal variables that start with underscore
    const entries = Object.entries(vars)
      .filter(([name]) => !name.startsWith('_'))
      .sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) {
      context.emitOutput(`    (none)`, 'Debug');
      return;
    }

    for (const [name, value] of entries) {
      const formatted = this.formatVariableValue(value);
      context.emitOutput(`    ${name} = ${formatted}`, 'Debug');
    }
  }

  /**
   * Format a variable value for debug display
   */
  private formatVariableValue(value: unknown): string {
    if (value === undefined) return '<undefined>';
    if (value === null) return '<null>';

    if (Array.isArray(value)) {
      if (value.length === 0) return '[] (empty array)';
      if (value.length <= 3) {
        const items = value.map(v => this.formatScalarValue(v)).join(', ');
        return `[${items}] (${value.length} items)`;
      }
      const preview = value.slice(0, 3).map(v => this.formatScalarValue(v)).join(', ');
      return `[${preview}, ...] (${value.length} items)`;
    }

    return this.formatScalarValue(value);
  }

  /**
   * Format a scalar value (string/number/boolean) for debug display
   */
  private formatScalarValue(value: unknown): string {
    if (typeof value === 'string') {
      if (value.length === 0) return '""';
      if (value.length > 60) {
        return `"${value.substring(0, 57)}..."`;
      }
      // Escape newlines for display
      const escaped = value.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
      if (escaped.length > 60) {
        return `"${escaped.substring(0, 57)}..."`;
      }
      return `"${escaped}"`;
    }
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  }
}
