import * as fs from 'fs';
import * as path from 'path';
import type { ScriptStep } from '../../../shared/models';
import type { ScriptContext } from '../ScriptContext';
import type { IScriptCommand, CommandResult } from './IScriptCommand';
import { successResult, errorResult } from './IScriptCommand';

/**
 * Write content to a file
 * Ported from: Services/Scripting/Commands/WriteFileCommand.cs
 */
export class WriteFileCommand implements IScriptCommand {
  async execute(step: ScriptStep, context: ScriptContext): Promise<CommandResult> {
    const options = step.writefile;
    if (!options) {
      return errorResult('Writefile options not specified');
    }

    if (!options.path) {
      return errorResult('Writefile requires "path"');
    }

    const filePath = context.substituteVariables(options.path);
    const content = context.substituteVariables(options.content || '');
    const mode = options.mode || 'overwrite';

    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write or append
      if (mode === 'append') {
        fs.appendFileSync(filePath, content + '\n', 'utf8');
        context.emitOutput(`Writefile: appended to ${filePath}`, 'Debug');
      } else {
        fs.writeFileSync(filePath, content, 'utf8');
        context.emitOutput(`Writefile: wrote to ${filePath}`, 'Debug');
      }

      return successResult();
    } catch (error) {
      return errorResult(`Failed to write file: ${(error as Error).message}`);
    }
  }
}
