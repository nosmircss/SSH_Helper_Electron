import type { ScriptStep } from '../../../shared/models';
import type { ScriptContext } from '../ScriptContext';
import type { IScriptCommand, CommandResult, ControlFlow } from './IScriptCommand';
import { successResult, errorResult } from './IScriptCommand';
import { ExpressionEvaluator } from '../ExpressionEvaluator';

/**
 * Executor interface for recursive step execution
 */
export interface StepExecutor {
  executeSteps(steps: ScriptStep[], context: ScriptContext): Promise<CommandResult>;
}

/**
 * Conditional execution (if/then/else)
 * Ported from: Services/Scripting/Commands/IfCommand.cs
 */
export class IfCommand implements IScriptCommand {
  private executor: StepExecutor;

  constructor(executor: StepExecutor) {
    this.executor = executor;
  }

  async execute(step: ScriptStep, context: ScriptContext): Promise<CommandResult> {
    if (!step.condition) {
      return errorResult('If requires a condition');
    }

    const evaluator = new ExpressionEvaluator(context);

    // Show original condition with variables
    context.emitOutput(`[IF] Evaluating: "${step.condition}"`, 'Debug');

    // Show resolved condition if variables were substituted
    const resolvedCondition = context.substituteVariables(step.condition);
    if (resolvedCondition !== step.condition) {
      context.emitOutput(`  Resolved: "${resolvedCondition}"`, 'Debug');
    }

    const conditionMet = evaluator.evaluate(step.condition);

    if (conditionMet) {
      if (step.then && step.then.length > 0) {
        context.emitOutput(`  Result: true -> taking THEN branch`, 'Debug');
        return this.executor.executeSteps(step.then, context);
      } else {
        context.emitOutput(`  Result: true (no THEN block)`, 'Debug');
      }
    } else {
      if (step.else && step.else.length > 0) {
        context.emitOutput(`  Result: false -> taking ELSE branch`, 'Debug');
        return this.executor.executeSteps(step.else, context);
      } else {
        context.emitOutput(`  Result: false (no ELSE branch, skipping)`, 'Debug');
      }
    }

    return successResult();
  }
}
