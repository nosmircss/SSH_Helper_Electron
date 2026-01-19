import type { ScriptStep } from '../../../shared/models';
import type { ScriptContext } from '../ScriptContext';
import type { IScriptCommand, CommandResult } from './IScriptCommand';
import { successResult, errorResult } from './IScriptCommand';

/**
 * Extract values using regex from a variable
 * Ported from: Services/Scripting/Commands/ExtractCommand.cs
 */
export class ExtractCommand implements IScriptCommand {
  async execute(step: ScriptStep, context: ScriptContext): Promise<CommandResult> {
    const extract = step.extract;
    if (!extract) {
      return errorResult('Extract options not specified');
    }

    if (!extract.from) {
      return errorResult('Extract requires "from" variable');
    }
    if (!extract.pattern) {
      return errorResult('Extract requires "pattern"');
    }
    if (!extract.into) {
      return errorResult('Extract requires "into" variable');
    }

    const intoVars = Array.isArray(extract.into) ? extract.into : [extract.into];
    context.emitOutput(`[EXTRACT] from: ${extract.from}, pattern: /${extract.pattern}/`, 'Debug');
    context.emitOutput(`  Into variables: [${intoVars.join(', ')}]`, 'Debug');

    // Get source value
    const source = context.getVariableString(extract.from);
    if (!source) {
      context.emitOutput(`  Source is empty, setting empty results`, 'Debug');
      this.setEmptyResults(extract.into, context);
      return successResult();
    }

    // Show source preview
    const sourcePreview = source.length > 80 ? source.substring(0, 77) + '...' : source;
    context.emitOutput(`  Source (${source.length} chars): "${sourcePreview}"`, 'Debug');

    // Build regex
    let regex: RegExp;
    try {
      regex = new RegExp(extract.pattern, 'gm');
    } catch (e) {
      return errorResult(`Invalid regex pattern: ${(e as Error).message}`);
    }

    // Find matches
    const matches: string[][] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(source)) !== null) {
      // match[0] is full match, match[1..n] are capture groups
      matches.push(match.slice(1).length > 0 ? match.slice(1) : [match[0]]);
    }

    context.emitOutput(`  Found ${matches.length} match(es)`, 'Debug');

    if (matches.length === 0) {
      context.emitOutput(`  No matches, setting empty results`, 'Debug');
      this.setEmptyResults(extract.into, context);
      return successResult();
    }

    // Show first few matches for debugging
    const previewCount = Math.min(matches.length, 3);
    for (let i = 0; i < previewCount; i++) {
      const groups = matches[i].map((g, idx) => `group${idx + 1}="${g}"`).join(', ');
      context.emitOutput(`  Match[${i}]: ${groups}`, 'Debug');
    }
    if (matches.length > 3) {
      context.emitOutput(`  ... and ${matches.length - 3} more matches`, 'Debug');
    }

    // Determine which matches to use based on 'match' option
    const matchOption = extract.match || 'first';
    let selectedMatches: string[][];

    if (matchOption === 'first') {
      selectedMatches = [matches[0]];
      context.emitOutput(`  Using: first match`, 'Debug');
    } else if (matchOption === 'last') {
      selectedMatches = [matches[matches.length - 1]];
      context.emitOutput(`  Using: last match`, 'Debug');
    } else if (matchOption === 'all') {
      selectedMatches = matches;
      context.emitOutput(`  Using: all ${matches.length} matches`, 'Debug');
    } else {
      // Numeric index
      const index = parseInt(String(matchOption), 10);
      if (!isNaN(index) && index >= 0 && index < matches.length) {
        selectedMatches = [matches[index]];
        context.emitOutput(`  Using: match at index ${index}`, 'Debug');
      } else {
        selectedMatches = [matches[0]];
        context.emitOutput(`  Using: first match (invalid index ${matchOption})`, 'Debug');
      }
    }

    // Set variables
    if (matchOption === 'all') {
      // For 'all', create arrays
      for (let i = 0; i < intoVars.length; i++) {
        const varName = intoVars[i];
        const values = selectedMatches.map((m) => m[i] || '');
        context.setVariable(varName, values);
        const preview = values.length <= 3 ? values.map(v => `"${v}"`).join(', ') : `"${values[0]}", "${values[1]}", ... +${values.length - 2}`;
        context.emitOutput(`  Result: ${varName} = [${preview}]`, 'Debug');
      }
    } else {
      // For single match, set individual values
      const matchGroups = selectedMatches[0];
      for (let i = 0; i < intoVars.length; i++) {
        const varName = intoVars[i];
        const value = matchGroups[i] || '';
        context.setVariable(varName, value);
        context.emitOutput(`  Result: ${varName} = "${value}"`, 'Debug');
      }
    }

    return successResult();
  }

  private setEmptyResults(into: string | string[], context: ScriptContext): void {
    const intoVars = Array.isArray(into) ? into : [into];
    for (const varName of intoVars) {
      context.setVariable(varName, '');
    }
  }
}
