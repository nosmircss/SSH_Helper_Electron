import type { ScriptStep } from '../../../shared/models';
import type { ScriptContext } from '../ScriptContext';
import type { IScriptCommand, CommandResult } from './IScriptCommand';
import { successResult, errorResult } from './IScriptCommand';

/**
 * Sets a variable value
 * Supports: variable = value, variable = variable + 1, etc.
 * Ported from: Services/Scripting/Commands/SetCommand.cs
 */
export class SetCommand implements IScriptCommand {
  async execute(step: ScriptStep, context: ScriptContext): Promise<CommandResult> {
    const expression = String(step.value || '');
    const eqIndex = expression.indexOf('=');

    if (eqIndex < 0) {
      return errorResult('Set requires format: variable = value');
    }

    const varName = expression.substring(0, eqIndex).trim();
    const valueExpr = expression.substring(eqIndex + 1).trim();

    if (!varName) {
      return errorResult('Variable name is required');
    }

    // Get old value for debug comparison
    const oldValue = context.getVariable(varName);

    // Evaluate the value expression
    const value = this.evaluateValue(valueExpr, context);

    context.setVariable(varName, value);

    // Enhanced debug output with before/after
    const formattedValue = this.formatValue(value);
    if (oldValue === undefined) {
      context.emitOutput(`[SET] ${varName} = ${formattedValue} (new)`, 'Debug');
    } else {
      const formattedOld = this.formatValue(oldValue);
      context.emitOutput(`[SET] ${varName} = ${formattedValue} (was: ${formattedOld})`, 'Debug');
    }

    return successResult();
  }

  private formatValue(value: unknown): string {
    if (value === undefined) return '<undefined>';
    if (value === null) return '<null>';
    if (Array.isArray(value)) {
      if (value.length <= 3) {
        return `[${value.map(v => `"${v}"`).join(', ')}]`;
      }
      return `[${value.slice(0, 3).map(v => `"${v}"`).join(', ')}, ... +${value.length - 3}]`;
    }
    if (typeof value === 'string') {
      if (value.length > 50) {
        return `"${value.substring(0, 47)}..."`;
      }
      return `"${value}"`;
    }
    return String(value);
  }

  private evaluateValue(expr: string, context: ScriptContext): unknown {
    expr = expr.trim();

    // Handle quoted strings
    if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
      const inner = expr.substring(1, expr.length - 1);
      return context.substituteVariables(inner);
    }

    // Handle array literals: [a, b, c]
    if (expr.startsWith('[') && expr.endsWith(']')) {
      const inner = expr.substring(1, expr.length - 1);
      const items = inner.split(',').map((s) => {
        const trimmed = s.trim();
        // Handle quoted items
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
          return trimmed.substring(1, trimmed.length - 1);
        }
        return context.substituteVariables(trimmed);
      });
      return items;
    }

    // Check for arithmetic operations
    const arithmeticMatch = expr.match(/^(\w+)\s*([+\-*/])\s*(\d+)$/);
    if (arithmeticMatch) {
      const varName = arithmeticMatch[1];
      const op = arithmeticMatch[2];
      const operand = parseFloat(arithmeticMatch[3]);

      const currentValue = parseFloat(context.getVariableString(varName)) || 0;

      switch (op) {
        case '+': return currentValue + operand;
        case '-': return currentValue - operand;
        case '*': return currentValue * operand;
        case '/': return operand !== 0 ? currentValue / operand : 0;
      }
    }

    // Check for variable + variable arithmetic
    const varArithmeticMatch = expr.match(/^(\w+)\s*([+\-*/])\s*(\w+)$/);
    if (varArithmeticMatch) {
      const leftVar = varArithmeticMatch[1];
      const op = varArithmeticMatch[2];
      const rightVar = varArithmeticMatch[3];

      const leftValue = parseFloat(context.getVariableString(leftVar)) || 0;
      const rightValue = parseFloat(context.getVariableString(rightVar)) || 0;

      switch (op) {
        case '+': return leftValue + rightValue;
        case '-': return leftValue - rightValue;
        case '*': return leftValue * rightValue;
        case '/': return rightValue !== 0 ? leftValue / rightValue : 0;
      }
    }

    // Substitute variables in the expression
    const substituted = context.substituteVariables(expr);

    // Try to parse as number
    const num = parseFloat(substituted);
    if (!isNaN(num) && substituted === String(num)) {
      return num;
    }

    // Try variable lookup
    if (context.hasVariable(expr)) {
      return context.getVariable(expr);
    }

    return substituted;
  }
}
