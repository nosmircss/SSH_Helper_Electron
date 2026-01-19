import type { ScriptStep } from '../../../shared/models';
import type { ScriptContext } from '../ScriptContext';

/**
 * Control flow result from command execution
 */
export type ControlFlow = 'continue' | 'break' | 'exit' | 'normal';

/**
 * Result of executing a script command
 */
export interface CommandResult {
  success: boolean;
  controlFlow: ControlFlow;
  exitMessage?: string;
  error?: string;
}

/**
 * Interface for script command handlers
 */
export interface IScriptCommand {
  /**
   * Execute the command
   * @param step The script step to execute
   * @param context The script execution context
   * @returns Result of execution
   */
  execute(step: ScriptStep, context: ScriptContext): Promise<CommandResult>;
}

/**
 * Helper to create a successful result
 */
export function successResult(): CommandResult {
  return { success: true, controlFlow: 'normal' };
}

/**
 * Helper to create an error result
 */
export function errorResult(error: string): CommandResult {
  return { success: false, controlFlow: 'normal', error };
}

/**
 * Helper to create an exit result
 */
export function exitResult(message: string, success: boolean = true): CommandResult {
  return { success, controlFlow: 'exit', exitMessage: message };
}

/**
 * Helper to create a break result (for loops)
 */
export function breakResult(): CommandResult {
  return { success: true, controlFlow: 'break' };
}

/**
 * Helper to create a continue result (for loops)
 */
export function continueResult(): CommandResult {
  return { success: true, controlFlow: 'continue' };
}
