/**
 * Prompt detection utilities for SSH shell sessions
 * Ported from: Utilities/PromptDetector.cs
 */
export class PromptDetector {
  // Common shell prompt terminators
  private static readonly PROMPT_TERMINATORS = ['#', '>', '$', '%'];

  /**
   * Build a regex that matches a prompt, allowing for mode changes
   * Example: "router#" also matches "router(config)#"
   */
  static buildPromptRegex(promptLiteral: string): RegExp {
    // Find the terminator
    let terminator = '';
    for (const term of this.PROMPT_TERMINATORS) {
      if (promptLiteral.endsWith(term)) {
        terminator = term;
        break;
      }
    }

    if (!terminator) {
      // No known terminator, use literal match
      return new RegExp(this.escapeRegex(promptLiteral) + '\\s*$');
    }

    // Get the base part (hostname)
    const basePart = promptLiteral.slice(0, -terminator.length).trim();

    // Build regex that allows mode changes like "(config)", "(config-if)", etc.
    const escapedBase = this.escapeRegex(basePart);
    const escapedTerminator = this.escapeRegex(terminator);

    // Match: hostname + optional mode in parens + terminator + optional space
    return new RegExp(`${escapedBase}(?:\\([^)]*\\))?${escapedTerminator}\\s*$`);
  }

  /**
   * Try to detect a prompt from buffer content
   */
  static tryDetectPrompt(buffer: string): string | null {
    const lines = buffer.split('\n');

    // Look at the last few lines
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
      const line = lines[i].trim();
      if (this.isLikelyPrompt(line)) {
        return line;
      }
    }

    return null;
  }

  /**
   * Try to detect prompt from the tail of a buffer (optimized for large buffers)
   */
  static tryDetectPromptFromTail(buffer: string): string | null {
    // Only look at last 500 chars
    const tail = buffer.slice(-500);
    return this.tryDetectPrompt(tail);
  }

  /**
   * Check if buffer ends with a known prompt
   */
  static bufferEndsWithPrompt(buffer: string, promptRegex: RegExp): boolean {
    // Check last 200 chars
    const tail = buffer.slice(-200);
    return promptRegex.test(tail);
  }

  /**
   * Try to detect if prompt changed (mode change)
   */
  static tryDetectDifferentPrompt(buffer: string, currentPromptRegex: RegExp): string | null {
    const lines = buffer.split('\n');

    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
      const line = lines[i].trim();
      if (this.isLikelyPrompt(line) && !currentPromptRegex.test(line)) {
        return line;
      }
    }

    return null;
  }

  /**
   * Check if a line looks like a shell prompt
   */
  static isLikelyPrompt(line: string): boolean {
    if (!line || line.length === 0 || line.length > 100) {
      return false;
    }

    // Must end with a prompt terminator
    const lastChar = line[line.length - 1];
    if (!this.PROMPT_TERMINATORS.includes(lastChar)) {
      return false;
    }

    // Should not contain certain characters that indicate it's output
    if (line.includes('\t') || line.includes('  ')) {
      return false;
    }

    // Should be relatively short (prompts are usually under 50 chars)
    if (line.length > 50) {
      return false;
    }

    return true;
  }

  /**
   * Escape special regex characters
   */
  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
