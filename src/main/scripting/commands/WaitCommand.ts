import type { ScriptStep } from '../../../shared/models';
import type { ScriptContext } from '../ScriptContext';
import type { IScriptCommand, CommandResult } from './IScriptCommand';
import { successResult } from './IScriptCommand';

/**
 * Waits for specified seconds
 * Ported from: Services/Scripting/Commands/WaitCommand.cs
 */
export class WaitCommand implements IScriptCommand {
  async execute(step: ScriptStep, context: ScriptContext): Promise<CommandResult> {
    const seconds = Number(step.value) || 1;

    context.emitOutput(`[WAIT] Pausing for ${seconds} second(s)...`, 'Debug');

    const startTime = Date.now();
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    context.emitOutput(`[WAIT] Resumed after ${elapsed}s`, 'Debug');

    return successResult();
  }
}
