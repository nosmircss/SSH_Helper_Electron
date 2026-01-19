import type { ScriptContext } from './ScriptContext';

/**
 * Evaluates conditional expressions for if/while statements
 * Supports: ==, !=, >, >=, <, <=, matches, contains, startswith, endswith, is empty, is defined, and, or, not
 * Ported from: Services/Scripting/ExpressionEvaluator.cs
 */
export class ExpressionEvaluator {
  private context: ScriptContext;

  constructor(context: ScriptContext) {
    this.context = context;
  }

  /**
   * Evaluates a condition expression and returns true or false
   */
  evaluate(expression: string): boolean {
    if (!expression || !expression.trim()) {
      return false;
    }

    expression = expression.trim();

    // Handle logical operators (lowest precedence)
    const andIndex = this.findLogicalOperator(expression, ' and ');
    if (andIndex > 0) {
      const left = expression.substring(0, andIndex);
      const right = expression.substring(andIndex + 5);
      return this.evaluate(left) && this.evaluate(right);
    }

    const orIndex = this.findLogicalOperator(expression, ' or ');
    if (orIndex > 0) {
      const left = expression.substring(0, orIndex);
      const right = expression.substring(orIndex + 4);
      return this.evaluate(left) || this.evaluate(right);
    }

    // Handle "not " prefix
    if (expression.toLowerCase().startsWith('not ')) {
      return !this.evaluate(expression.substring(4));
    }

    // Handle parentheses
    if (expression.startsWith('(') && expression.endsWith(')')) {
      return this.evaluate(expression.substring(1, expression.length - 1));
    }

    // Now evaluate comparison operators
    return this.evaluateComparison(expression);
  }

  private evaluateComparison(expression: string): boolean {
    const lowerExpr = expression.toLowerCase();

    // Check for "is empty" / "is not empty"
    if (lowerExpr.endsWith(' is empty')) {
      const varName = expression.substring(0, expression.length - 9).trim();
      const value = this.resolveValue(varName);
      return !value || value.toString() === '';
    }

    if (lowerExpr.endsWith(' is not empty')) {
      const varName = expression.substring(0, expression.length - 13).trim();
      const value = this.resolveValue(varName);
      return !!value && value.toString() !== '';
    }

    // Check for "is defined" / "is not defined"
    if (lowerExpr.endsWith(' is defined')) {
      const varName = expression.substring(0, expression.length - 11).trim();
      return this.context.hasVariable(varName);
    }

    if (lowerExpr.endsWith(' is not defined')) {
      const varName = expression.substring(0, expression.length - 15).trim();
      return !this.context.hasVariable(varName);
    }

    // matches (regex)
    const matchesIndex = this.findOperator(expression, ' matches ');
    if (matchesIndex > 0) {
      const left = this.resolveValue(expression.substring(0, matchesIndex))?.toString() ?? '';
      const pattern = this.extractPattern(expression.substring(matchesIndex + 9).trim());
      try {
        return new RegExp(pattern, 'i').test(left);
      } catch {
        return false;
      }
    }

    // contains
    const containsIndex = this.findOperator(expression, ' contains ');
    if (containsIndex > 0) {
      const left = this.resolveValue(expression.substring(0, containsIndex))?.toString() ?? '';
      const right = this.resolveStringValue(expression.substring(containsIndex + 10).trim());
      return left.toLowerCase().includes(right.toLowerCase());
    }

    // startswith
    const startsWithIndex = this.findOperator(expression, ' startswith ');
    if (startsWithIndex > 0) {
      const left = this.resolveValue(expression.substring(0, startsWithIndex))?.toString() ?? '';
      const right = this.resolveStringValue(expression.substring(startsWithIndex + 12).trim());
      return left.toLowerCase().startsWith(right.toLowerCase());
    }

    // endswith
    const endsWithIndex = this.findOperator(expression, ' endswith ');
    if (endsWithIndex > 0) {
      const left = this.resolveValue(expression.substring(0, endsWithIndex))?.toString() ?? '';
      const right = this.resolveStringValue(expression.substring(endsWithIndex + 10).trim());
      return left.toLowerCase().endsWith(right.toLowerCase());
    }

    // != (not equals)
    const neIndex = this.findOperator(expression, ' != ');
    if (neIndex > 0) {
      const left = this.resolveValue(expression.substring(0, neIndex));
      const right = this.resolveValue(expression.substring(neIndex + 4));
      return !this.areEqual(left, right);
    }

    // == (equals)
    const eqIndex = this.findOperator(expression, ' == ');
    if (eqIndex > 0) {
      const left = this.resolveValue(expression.substring(0, eqIndex));
      const right = this.resolveValue(expression.substring(eqIndex + 4));
      return this.areEqual(left, right);
    }

    // >=
    const gteIndex = this.findOperator(expression, ' >= ');
    if (gteIndex > 0) {
      const left = this.resolveNumeric(expression.substring(0, gteIndex));
      const right = this.resolveNumeric(expression.substring(gteIndex + 4));
      return left >= right;
    }

    // <=
    const lteIndex = this.findOperator(expression, ' <= ');
    if (lteIndex > 0) {
      const left = this.resolveNumeric(expression.substring(0, lteIndex));
      const right = this.resolveNumeric(expression.substring(lteIndex + 4));
      return left <= right;
    }

    // >
    const gtIndex = this.findOperator(expression, ' > ');
    if (gtIndex > 0) {
      const left = this.resolveNumeric(expression.substring(0, gtIndex));
      const right = this.resolveNumeric(expression.substring(gtIndex + 3));
      return left > right;
    }

    // <
    const ltIndex = this.findOperator(expression, ' < ');
    if (ltIndex > 0) {
      const left = this.resolveNumeric(expression.substring(0, ltIndex));
      const right = this.resolveNumeric(expression.substring(ltIndex + 3));
      return left < right;
    }

    // If no operator found, treat as truthy check
    const value = this.resolveValue(expression);
    return this.isTruthy(value);
  }

  private findLogicalOperator(expression: string, op: string): number {
    // Find operator outside of quotes
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < expression.length - op.length; i++) {
      const c = expression[i];

      if ((c === '"' || c === "'") && (i === 0 || expression[i - 1] !== '\\')) {
        if (!inQuote) {
          inQuote = true;
          quoteChar = c;
        } else if (c === quoteChar) {
          inQuote = false;
        }
      }

      if (!inQuote && expression.substring(i).toLowerCase().startsWith(op.toLowerCase())) {
        return i;
      }
    }

    return -1;
  }

  private findOperator(expression: string, op: string): number {
    return this.findLogicalOperator(expression, op);
  }

  private resolveValue(expr: string): unknown {
    expr = expr.trim();

    // Handle quoted strings
    if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
      return expr.substring(1, expr.length - 1);
    }

    // Handle variable substitution
    if (expr.includes('${')) {
      return this.context.substituteVariables(expr);
    }

    // Try variable lookup
    if (this.context.hasVariable(expr)) {
      return this.context.getVariable(expr);
    }

    // Try numeric
    const num = parseFloat(expr);
    if (!isNaN(num)) {
      return num;
    }

    // Return as literal
    return expr;
  }

  private resolveStringValue(expr: string): string {
    const value = this.resolveValue(expr);
    return value?.toString() ?? '';
  }

  private resolveNumeric(expr: string): number {
    const value = this.resolveValue(expr);
    if (typeof value === 'number') return value;
    const num = parseFloat(value?.toString() ?? '0');
    return isNaN(num) ? 0 : num;
  }

  private extractPattern(expr: string): string {
    expr = expr.trim();

    // Handle 'pattern' or "pattern" syntax
    if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
      return expr.substring(1, expr.length - 1);
    }

    // Handle /pattern/ syntax
    if (expr.startsWith('/') && expr.endsWith('/')) {
      return expr.substring(1, expr.length - 1);
    }

    return expr;
  }

  private areEqual(left: unknown, right: unknown): boolean {
    if (left === null && right === null) return true;
    if (left === null || right === null) return false;

    const leftStr = left?.toString() ?? '';
    const rightStr = right?.toString() ?? '';

    // Try numeric comparison
    const leftNum = parseFloat(leftStr);
    const rightNum = parseFloat(rightStr);
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      return Math.abs(leftNum - rightNum) < 0.0001;
    }

    // String comparison (case-insensitive)
    return leftStr.toLowerCase() === rightStr.toLowerCase();
  }

  private isTruthy(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      return value !== '' && value.toLowerCase() !== 'false';
    }
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }
}
