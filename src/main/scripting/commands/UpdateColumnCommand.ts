import type { ScriptStep } from '../../../shared/models';
import type { ScriptContext } from '../ScriptContext';
import type { IScriptCommand, CommandResult } from './IScriptCommand';
import { successResult, errorResult } from './IScriptCommand';

/**
 * Update a column value in the host table
 * Ported from: Services/Scripting/Commands/UpdateColumnCommand.cs
 */
export class UpdateColumnCommand implements IScriptCommand {
  async execute(step: ScriptStep, context: ScriptContext): Promise<CommandResult> {
    const options = step.updatecolumn;
    if (!options) {
      return errorResult('UpdateColumn options not specified');
    }

    if (!options.column) {
      return errorResult('UpdateColumn requires "column" name');
    }

    const rawColumn = options.column;
    const rawValue = options.value || '';
    const columnName = context.substituteVariables(rawColumn);
    const value = context.substituteVariables(rawValue);

    // Debug: show variable substitution
    if (rawColumn !== columnName || rawValue !== value) {
      context.emitOutput(`[COLUMN] Updating grid column`, 'Debug');
      if (rawColumn !== columnName) {
        context.emitOutput(`  Column: "${rawColumn}" -> "${columnName}"`, 'Debug');
      } else {
        context.emitOutput(`  Column: "${columnName}"`, 'Debug');
      }
      if (rawValue !== value) {
        context.emitOutput(`  Value: "${rawValue}" -> "${value}"`, 'Debug');
      } else {
        context.emitOutput(`  Value: "${value}"`, 'Debug');
      }
    } else {
      context.emitOutput(`[COLUMN] ${columnName} = "${value}"`, 'Debug');
    }

    // Request the update through context event
    context.requestColumnUpdate(columnName, value);

    return successResult();
  }
}
