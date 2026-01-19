import type { ScriptStep } from '../../../shared/models';
import type { ScriptContext } from '../ScriptContext';
import type { IScriptCommand, CommandResult } from './IScriptCommand';
import { successResult, errorResult } from './IScriptCommand';
import { ExpressionEvaluator } from '../ExpressionEvaluator';
import type { StepExecutor } from './IfCommand';

/**
 * Loop over a collection
 * Syntax: foreach: item in collection
 * Ported from: Services/Scripting/Commands/ForeachCommand.cs
 */
export class ForeachCommand implements IScriptCommand {
  private executor: StepExecutor;

  constructor(executor: StepExecutor) {
    this.executor = executor;
  }

  async execute(step: ScriptStep, context: ScriptContext): Promise<CommandResult> {
    if (!step.variable || !step.collection) {
      return errorResult('Foreach requires "item in collection" format');
    }

    if (!step.do || step.do.length === 0) {
      return errorResult('Foreach requires a "do" block');
    }

    const itemVar = step.variable;
    const collectionName = step.collection;

    // Get the collection
    const collection = context.getVariableList(collectionName);

    // Show loop info
    context.emitOutput(`[FOREACH] ${itemVar} in ${collectionName} (${collection.length} items)`, 'Debug');

    if (collection.length === 0) {
      context.emitOutput(`  Collection is empty, skipping loop`, 'Debug');
      return successResult();
    }

    // Preview collection contents (up to 5 items)
    if (collection.length <= 5) {
      context.emitOutput(`  Values: [${collection.map(v => `"${v}"`).join(', ')}]`, 'Debug');
    } else {
      const preview = collection.slice(0, 3).map(v => `"${v}"`).join(', ');
      context.emitOutput(`  Values: [${preview}, ... +${collection.length - 3} more]`, 'Debug');
    }

    // Optional when filter
    const evaluator = step.when ? new ExpressionEvaluator(context) : null;

    let index = 0;
    let skippedCount = 0;
    for (const item of collection) {
      // Set loop variables
      context.setVariable(itemVar, item);
      context.setVariable(`${itemVar}_index`, index);

      // Check when condition
      if (evaluator && step.when) {
        const whenCondition = context.substituteVariables(step.when);
        if (!evaluator.evaluate(whenCondition)) {
          skippedCount++;
          context.emitOutput(`  [${index + 1}/${collection.length}] ${itemVar} = "${item}" (skipped: when condition false)`, 'Debug');
          index++;
          continue;
        }
      }

      context.emitOutput(`  [${index + 1}/${collection.length}] ${itemVar} = "${item}"`, 'Debug');

      // Execute do block
      const result = await this.executor.executeSteps(step.do, context);

      // Handle control flow
      if (result.controlFlow === 'break') {
        context.emitOutput(`  Break encountered at iteration ${index + 1}, exiting loop`, 'Debug');
        break;
      }
      if (result.controlFlow === 'exit') {
        context.emitOutput(`  Exit encountered at iteration ${index + 1}`, 'Debug');
        return result;
      }
      if (!result.success && step.onError !== 'continue') {
        return result;
      }

      index++;
    }

    const completedMsg = skippedCount > 0
      ? `  Loop complete (${index - skippedCount} executed, ${skippedCount} skipped)`
      : `  Loop complete (${index} iterations)`;
    context.emitOutput(completedMsg, 'Debug');

    return successResult();
  }
}
