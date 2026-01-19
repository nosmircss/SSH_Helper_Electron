import type { ScriptStep } from '../../../shared/models';
import type { ScriptContext } from '../ScriptContext';
import type { IScriptCommand, CommandResult } from './IScriptCommand';
import { exitResult } from './IScriptCommand';

/**
 * Exits script execution
 * Ported from: Services/Scripting/Commands/ExitCommand.cs
 */
export class ExitCommand implements IScriptCommand {
  async execute(step: ScriptStep, context: ScriptContext): Promise<CommandResult> {
    const rawMessage = String(step.value || 'Script exited');
    const message = context.substituteVariables(rawMessage);

    // Check if this is a failure exit
    const isFailure = message.toLowerCase().includes('fail') ||
                      message.toLowerCase().includes('error');

    const exitType = isFailure ? 'FAILURE' : 'SUCCESS';
    context.emitOutput(`[EXIT] Terminating script (${exitType}): "${message}"`, 'Debug');

    context.emitOutput(message, isFailure ? 'Error' : 'Success');

    return exitResult(message, !isFailure);
  }
}
