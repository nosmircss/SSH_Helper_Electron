import type { ScriptStep } from '../../../shared/models';
import type { ScriptContext } from '../ScriptContext';
import type { IScriptCommand, CommandResult } from './IScriptCommand';
import { successResult, errorResult } from './IScriptCommand';

/**
 * Input handler interface - to be implemented by the UI layer
 */
export interface InputHandler {
  promptForInput(prompt: string, defaultValue?: string, password?: boolean): Promise<string | null>;
}

/**
 * Prompt user for input
 * Ported from: Services/Scripting/Commands/InputCommand.cs
 */
export class InputCommand implements IScriptCommand {
  private inputHandler?: InputHandler;

  constructor(inputHandler?: InputHandler) {
    this.inputHandler = inputHandler;
  }

  async execute(step: ScriptStep, context: ScriptContext): Promise<CommandResult> {
    const options = step.input;
    if (!options) {
      return errorResult('Input options not specified');
    }

    if (!options.into) {
      return errorResult('Input requires "into" variable');
    }

    const prompt = context.substituteVariables(options.prompt || 'Enter value:');
    const defaultValue = options.default ? context.substituteVariables(options.default) : undefined;

    // If no input handler, use default value or empty
    if (!this.inputHandler) {
      context.emitOutput(`Input: no handler, using default value`, 'Debug');
      context.setVariable(options.into, defaultValue || '');
      return successResult();
    }

    // Prompt for input
    const input = await this.inputHandler.promptForInput(prompt, defaultValue, options.password);

    if (input === null) {
      // User cancelled
      return errorResult('Input cancelled by user');
    }

    // Validate if pattern provided
    if (options.validate) {
      try {
        const regex = new RegExp(options.validate);
        if (!regex.test(input)) {
          const errorMsg = options.validationError || `Input does not match pattern: ${options.validate}`;
          return errorResult(errorMsg);
        }
      } catch (e) {
        return errorResult(`Invalid validation pattern: ${(e as Error).message}`);
      }
    }

    context.setVariable(options.into, input);
    context.emitOutput(`Input: ${options.into} = "${options.password ? '***' : input}"`, 'Debug');

    return successResult();
  }
}
