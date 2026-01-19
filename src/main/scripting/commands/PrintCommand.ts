import type { ScriptStep } from '../../../shared/models';
import type { ScriptContext } from '../ScriptContext';
import type { IScriptCommand, CommandResult } from './IScriptCommand';
import { successResult } from './IScriptCommand';

/**
 * Prints a message to output
 * Ported from: Services/Scripting/Commands/PrintCommand.cs
 */
export class PrintCommand implements IScriptCommand {
  async execute(step: ScriptStep, context: ScriptContext): Promise<CommandResult> {
    const rawMessage = String(step.value || '');
    const message = context.substituteVariables(rawMessage);

    // Debug: show variable substitution if different
    if (rawMessage !== message) {
      context.emitOutput(`[PRINT] Raw: "${rawMessage}"`, 'Debug');
      context.emitOutput(`  Resolved: "${message}"`, 'Debug');
    } else {
      context.emitOutput(`[PRINT] "${message}"`, 'Debug');
    }

    context.emitOutput(message, 'CommandOutput');
    return successResult();
  }
}
