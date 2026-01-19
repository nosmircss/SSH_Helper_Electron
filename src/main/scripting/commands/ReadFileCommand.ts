import * as fs from 'fs';
import type { ScriptStep } from '../../../shared/models';
import type { ScriptContext } from '../ScriptContext';
import type { IScriptCommand, CommandResult } from './IScriptCommand';
import { successResult, errorResult } from './IScriptCommand';

/**
 * Read contents of a file into a variable
 * Ported from: Services/Scripting/Commands/ReadFileCommand.cs
 */
export class ReadFileCommand implements IScriptCommand {
  async execute(step: ScriptStep, context: ScriptContext): Promise<CommandResult> {
    const options = step.readfile;
    if (!options) {
      return errorResult('Readfile options not specified');
    }

    if (!options.path) {
      return errorResult('Readfile requires "path"');
    }
    if (!options.into) {
      return errorResult('Readfile requires "into" variable');
    }

    const filePath = context.substituteVariables(options.path);

    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return errorResult(`File not found: ${filePath}`);
      }

      // Determine encoding
      const encoding = this.getEncoding(options.encoding);

      // Read file
      const content = fs.readFileSync(filePath, encoding);

      // Process lines
      let lines = content.split(/\r?\n/);

      // Apply options
      if (options.skipEmptyLines) {
        lines = lines.filter((l) => l.trim() !== '');
      }
      if (options.trimLines) {
        lines = lines.map((l) => l.trim());
      }
      if (options.maxLines && options.maxLines > 0) {
        lines = lines.slice(0, options.maxLines);
      }

      // Set variable as array of lines
      context.setVariable(options.into, lines);
      context.emitOutput(`Readfile: loaded ${lines.length} line(s) from ${filePath}`, 'Debug');

      return successResult();
    } catch (error) {
      return errorResult(`Failed to read file: ${(error as Error).message}`);
    }
  }

  private getEncoding(encoding?: string): BufferEncoding {
    switch (encoding?.toLowerCase()) {
      case 'ascii':
        return 'ascii';
      case 'utf-16':
      case 'utf16':
        return 'utf16le';
      case 'utf-32':
      case 'utf32':
        return 'utf8'; // Node doesn't support utf32 directly
      default:
        return 'utf8';
    }
  }
}
