import * as yaml from 'js-yaml';
import type {
  Script,
  ScriptStep,
  ExtractOptions,
  ReadFileOptions,
  WriteFileOptions,
  InputOptions,
  UpdateColumnOptions,
  StepType,
} from '../../shared/models';

/**
 * Script parser for YAML scripts
 * Ported from: Services/Scripting/ScriptParser.cs
 */
export class ScriptParser {
  /**
   * Detects if the given text is a YAML script (vs plain commands)
   */
  static isYamlScript(text: string): boolean {
    if (!text || !text.trim()) {
      return false;
    }

    const trimmed = text.trimStart();

    // Check for YAML document marker
    if (trimmed.startsWith('---')) {
      return true;
    }

    // Check for common script keywords at start of lines
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    for (const line of lines.slice(0, 10)) {
      const trimmedLine = line.trimStart();
      if (trimmedLine.startsWith('#')) continue; // Skip comments

      if (
        trimmedLine.startsWith('name:') ||
        trimmedLine.startsWith('description:') ||
        trimmedLine.startsWith('vars:') ||
        trimmedLine.startsWith('steps:') ||
        trimmedLine.startsWith('version:')
      ) {
        return true;
      }

      // Check for step syntax
      if (
        trimmedLine.startsWith('- send:') ||
        trimmedLine.startsWith('- print:') ||
        trimmedLine.startsWith('- wait:') ||
        trimmedLine.startsWith('- set:') ||
        trimmedLine.startsWith('- exit:') ||
        trimmedLine.startsWith('- extract:') ||
        trimmedLine.startsWith('- if:') ||
        trimmedLine.startsWith('- foreach:') ||
        trimmedLine.startsWith('- while:') ||
        trimmedLine.startsWith('- updatecolumn:') ||
        trimmedLine.startsWith('- readfile:') ||
        trimmedLine.startsWith('- writefile:') ||
        trimmedLine.startsWith('- input:')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Parses YAML text into a Script object
   */
  parse(yamlText: string): Script {
    try {
      const doc = yaml.load(yamlText) as Record<string, unknown>;

      if (!doc || typeof doc !== 'object') {
        return { steps: [] };
      }

      const script: Script = {
        name: this.getString(doc, 'name'),
        description: this.getString(doc, 'description'),
        version: this.getString(doc, 'version'),
        debug: this.getBool(doc, 'debug'),
        vars: this.parseVars(doc.vars),
        steps: this.parseSteps(doc.steps),
      };

      return script;
    } catch (error) {
      throw new ScriptParseError(`YAML parsing error: ${(error as Error).message}`);
    }
  }

  /**
   * Parses plain text commands (non-YAML) into a simple script
   */
  parseSimpleCommands(text: string): Script {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));

    const steps: ScriptStep[] = lines.map((line) => ({
      type: 'send' as StepType,
      value: line,
    }));

    return { steps };
  }

  /**
   * Parse and return appropriate script type
   */
  parseAuto(text: string): Script {
    if (ScriptParser.isYamlScript(text)) {
      return this.parse(text);
    } else {
      return this.parseSimpleCommands(text);
    }
  }

  private parseVars(vars: unknown): Record<string, unknown> | undefined {
    if (!vars || typeof vars !== 'object') {
      return undefined;
    }
    return vars as Record<string, unknown>;
  }

  private parseSteps(steps: unknown): ScriptStep[] {
    if (!Array.isArray(steps)) {
      return [];
    }

    return steps.map((step) => this.parseStep(step)).filter((s): s is ScriptStep => s !== null);
  }

  private parseStep(step: unknown): ScriptStep | null {
    if (!step || typeof step !== 'object') {
      return null;
    }

    const s = step as Record<string, unknown>;
    const result: ScriptStep = { type: 'send' };

    // Determine step type and value
    if ('send' in s) {
      result.type = 'send';
      result.value = String(s.send);
    } else if ('print' in s) {
      result.type = 'print';
      result.value = String(s.print);
    } else if ('wait' in s) {
      result.type = 'wait';
      result.value = Number(s.wait);
    } else if ('set' in s) {
      result.type = 'set';
      result.value = String(s.set);
    } else if ('exit' in s) {
      result.type = 'exit';
      result.value = String(s.exit);
    } else if ('if' in s) {
      result.type = 'if';
      result.condition = String(s.if);
    } else if ('foreach' in s) {
      result.type = 'foreach';
      const foreachStr = String(s.foreach);
      // Parse "item in collection" format
      const match = foreachStr.match(/(\w+)\s+in\s+(\w+)/);
      if (match) {
        result.variable = match[1];
        result.collection = match[2];
      }
    } else if ('while' in s) {
      result.type = 'while';
      result.condition = String(s.while);
    } else if ('extract' in s) {
      result.type = 'extract';
      result.extract = this.parseExtractOptions(s.extract);
    } else if ('readfile' in s) {
      result.type = 'readfile';
      result.readfile = this.parseReadfileOptions(s.readfile);
    } else if ('writefile' in s) {
      result.type = 'writefile';
      result.writefile = this.parseWritefileOptions(s.writefile);
    } else if ('input' in s) {
      result.type = 'input';
      result.input = this.parseInputOptions(s.input);
    } else if ('updatecolumn' in s) {
      result.type = 'updatecolumn';
      result.updatecolumn = this.parseUpdateColumnOptions(s.updatecolumn);
    }

    // Parse common options
    if ('capture' in s) result.capture = String(s.capture);
    if ('suppress' in s) result.suppress = this.toBool(s.suppress);
    if ('expect' in s) result.expect = String(s.expect);
    if ('timeout' in s) result.timeout = Number(s.timeout);
    if ('on_error' in s || 'onerror' in s) {
      result.onError = String(s.on_error || s.onerror) as 'continue' | 'stop';
    }
    if ('when' in s) result.when = String(s.when);

    // Parse control flow blocks
    if ('then' in s) result.then = this.parseSteps(s.then);
    if ('else' in s) result.else = this.parseSteps(s.else);
    if ('do' in s) result.do = this.parseSteps(s.do);

    return result;
  }

  private parseExtractOptions(opt: unknown): ExtractOptions | undefined {
    if (!opt || typeof opt !== 'object') return undefined;
    const o = opt as Record<string, unknown>;

    return {
      from: String(o.from || ''),
      pattern: String(o.pattern || ''),
      into: this.parseStringOrArray(o.into) || '',
      match: o.match as ExtractOptions['match'],
    };
  }

  private parseReadfileOptions(opt: unknown): ReadFileOptions | undefined {
    if (!opt || typeof opt !== 'object') return undefined;
    const o = opt as Record<string, unknown>;

    return {
      path: String(o.path || ''),
      into: String(o.into || ''),
      skipEmptyLines: this.toBool(o.skip_empty_lines || o.skipEmptyLines),
      trimLines: this.toBool(o.trim_lines || o.trimLines),
      maxLines: o.max_lines !== undefined || o.maxLines !== undefined
        ? Number(o.max_lines || o.maxLines)
        : undefined,
      encoding: o.encoding as ReadFileOptions['encoding'],
    };
  }

  private parseWritefileOptions(opt: unknown): WriteFileOptions | undefined {
    if (!opt || typeof opt !== 'object') return undefined;
    const o = opt as Record<string, unknown>;

    return {
      path: String(o.path || ''),
      content: String(o.content || ''),
      mode: o.mode as WriteFileOptions['mode'],
    };
  }

  private parseInputOptions(opt: unknown): InputOptions | undefined {
    if (!opt || typeof opt !== 'object') return undefined;
    const o = opt as Record<string, unknown>;

    return {
      prompt: String(o.prompt || ''),
      into: String(o.into || ''),
      default: o.default !== undefined ? String(o.default) : undefined,
      password: this.toBool(o.password),
      validate: o.validate !== undefined ? String(o.validate) : undefined,
      validationError: o.validation_error !== undefined || o.validationError !== undefined
        ? String(o.validation_error || o.validationError)
        : undefined,
    };
  }

  private parseUpdateColumnOptions(opt: unknown): UpdateColumnOptions | undefined {
    if (!opt || typeof opt !== 'object') return undefined;
    const o = opt as Record<string, unknown>;

    return {
      column: String(o.column || ''),
      value: String(o.value || ''),
    };
  }

  private parseStringOrArray(val: unknown): string | string[] | undefined {
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map((v) => String(v));
    return undefined;
  }

  private getString(obj: Record<string, unknown>, key: string): string | undefined {
    return obj[key] !== undefined ? String(obj[key]) : undefined;
  }

  private getBool(obj: Record<string, unknown>, key: string): boolean | undefined {
    const val = obj[key];
    if (val === undefined) return undefined;
    return this.toBool(val);
  }

  private toBool(val: unknown): boolean {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      return lower === 'true' || lower === 'yes' || lower === '1';
    }
    return Boolean(val);
  }

  /**
   * Validates a script and returns any errors found
   */
  validate(script: Script): string[] {
    const errors: string[] = [];

    if (!script.steps || script.steps.length === 0) {
      errors.push('Script has no steps defined');
      return errors;
    }

    this.validateSteps(script.steps, errors, '');
    return errors;
  }

  private validateSteps(steps: ScriptStep[], errors: string[], prefix: string): void {
    for (const step of steps) {
      // Validate specific step types
      switch (step.type) {
        case 'extract':
          if (!step.extract?.from) {
            errors.push(`${prefix}Extract requires 'from' variable`);
          }
          if (!step.extract?.pattern) {
            errors.push(`${prefix}Extract requires 'pattern'`);
          }
          if (!step.extract?.into) {
            errors.push(`${prefix}Extract requires 'into' variable`);
          }
          break;

        case 'if':
          if (!step.then || step.then.length === 0) {
            errors.push(`${prefix}If requires 'then' block`);
          }
          if (step.then) this.validateSteps(step.then, errors, prefix + '  ');
          if (step.else) this.validateSteps(step.else, errors, prefix + '  ');
          break;

        case 'foreach':
          if (!step.do || step.do.length === 0) {
            errors.push(`${prefix}Foreach requires 'do' block`);
          }
          if (step.do) this.validateSteps(step.do, errors, prefix + '  ');
          break;

        case 'while':
          if (!step.do || step.do.length === 0) {
            errors.push(`${prefix}While requires 'do' block`);
          }
          if (step.do) this.validateSteps(step.do, errors, prefix + '  ');
          break;

        case 'set':
          if (!step.value || !String(step.value).includes('=')) {
            errors.push(`${prefix}Set requires 'variable = value' format`);
          }
          break;

        case 'updatecolumn':
          if (!step.updatecolumn?.column) {
            errors.push(`${prefix}UpdateColumn requires 'column' name`);
          }
          if (step.updatecolumn?.value === undefined) {
            errors.push(`${prefix}UpdateColumn requires 'value'`);
          }
          break;

        case 'readfile':
          if (!step.readfile?.path) {
            errors.push(`${prefix}Readfile requires 'path'`);
          }
          if (!step.readfile?.into) {
            errors.push(`${prefix}Readfile requires 'into' variable`);
          }
          break;

        case 'writefile':
          if (!step.writefile?.path) {
            errors.push(`${prefix}Writefile requires 'path'`);
          }
          break;

        case 'input':
          if (!step.input?.into) {
            errors.push(`${prefix}Input requires 'into' variable`);
          }
          break;
      }
    }
  }
}

/**
 * Exception thrown when script parsing fails
 */
export class ScriptParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScriptParseError';
  }
}
