import type { ScriptStep } from '../../../shared/models';
import type { ScriptContext } from '../ScriptContext';
import type { IScriptCommand, CommandResult } from './IScriptCommand';
import { successResult, errorResult } from './IScriptCommand';
import { ExpressionEvaluator } from '../ExpressionEvaluator';
import type { StepExecutor } from './IfCommand';

/**
 * While loop - executes while condition is true
 * Ported from: Services/Scripting/Commands/WhileCommand.cs
 */
export class WhileCommand implements IScriptCommand {
  private executor: StepExecutor;
  private maxIterations: number;

  constructor(executor: StepExecutor, maxIterations: number = 10000) {
    this.executor = executor;
    this.maxIterations = maxIterations;
  }

  async execute(step: ScriptStep, context: ScriptContext): Promise<CommandResult> {
    if (!step.condition) {
      return errorResult('While requires a condition');
    }

    if (!step.do || step.do.length === 0) {
      return errorResult('While requires a "do" block');
    }

    const evaluator = new ExpressionEvaluator(context);
    let iterations = 0;

    context.emitOutput(`[WHILE] Condition: "${step.condition}"`, 'Debug');

    while (iterations < this.maxIterations) {
      // Evaluate condition with variable substitution
      const resolvedCondition = context.substituteVariables(step.condition);
      const conditionMet = evaluator.evaluate(resolvedCondition);

      // Show condition check with resolved values
      if (resolvedCondition !== step.condition) {
        context.emitOutput(`  Check #${iterations + 1}: "${resolvedCondition}" -> ${conditionMet}`, 'Debug');
      } else {
        context.emitOutput(`  Check #${iterations + 1}: ${conditionMet}`, 'Debug');
      }

      if (!conditionMet) {
        context.emitOutput(`  Condition false, exiting loop after ${iterations} iterations`, 'Debug');
        break;
      }

      // Execute do block
      const result = await this.executor.executeSteps(step.do, context);

      // Handle control flow
      if (result.controlFlow === 'break') {
        context.emitOutput(`  Break encountered at iteration ${iterations + 1}, exiting loop`, 'Debug');
        break;
      }
      if (result.controlFlow === 'exit') {
        context.emitOutput(`  Exit encountered at iteration ${iterations + 1}`, 'Debug');
        return result;
      }
      if (!result.success && step.onError !== 'continue') {
        return result;
      }

      iterations++;
    }

    if (iterations >= this.maxIterations) {
      context.emitOutput(`While loop reached max iterations (${this.maxIterations})`, 'Warning');
    }

    return successResult();
  }
}
