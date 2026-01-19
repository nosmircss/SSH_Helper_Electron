/**
 * Terminal output processor for handling ANSI escape sequences
 * Ported from: Utilities/TerminalOutputProcessor.cs
 */
export class TerminalOutputProcessor {
  // ANSI escape sequence regex
  private static readonly ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

  // Pager detection regex - matches "--More--", "-- More --", and variations
  private static readonly PAGER_REGEX = /\r?(?:--\s*More\s*--|(?:-+\s*More\s*-+))[ ]?\r?/i;

  // Control characters
  private static readonly CR = '\r';
  private static readonly LF = '\n';
  private static readonly TAB = '\t';
  private static readonly BACKSPACE = '\x08';
  private static readonly BELL = '\x07';
  private static readonly ESC = '\x1b';

  /**
   * Normalize terminal output by processing control characters
   * Returns clean text with proper line breaks
   */
  static normalize(input: string): string {
    if (!input) return '';

    const result: string[] = [];
    let currentLine = '';
    let cursorPos = 0;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      switch (char) {
        case this.CR:
          // Carriage return - move cursor to beginning of line
          cursorPos = 0;
          break;

        case this.LF:
          // Line feed - add current line and start new one
          result.push(currentLine);
          currentLine = '';
          cursorPos = 0;
          break;

        case this.TAB:
          // Tab - expand to spaces (8-char tab stops)
          const spaces = 8 - (cursorPos % 8);
          for (let s = 0; s < spaces; s++) {
            if (cursorPos < currentLine.length) {
              currentLine = currentLine.slice(0, cursorPos) + ' ' + currentLine.slice(cursorPos + 1);
            } else {
              currentLine += ' ';
            }
            cursorPos++;
          }
          break;

        case this.BACKSPACE:
          // Backspace - move cursor back
          if (cursorPos > 0) {
            cursorPos--;
          }
          break;

        case this.BELL:
          // Bell - ignore
          break;

        case this.ESC:
          // Escape sequence - skip to end
          if (i + 1 < input.length && input[i + 1] === '[') {
            // CSI sequence
            let j = i + 2;
            while (j < input.length && !this.isEscapeTerminator(input[j])) {
              j++;
            }
            i = j; // Skip the sequence
          }
          break;

        default:
          // Regular character
          if (char >= ' ') {
            // Printable character
            if (cursorPos < currentLine.length) {
              // Overwrite existing character
              currentLine = currentLine.slice(0, cursorPos) + char + currentLine.slice(cursorPos + 1);
            } else {
              // Append
              currentLine += char;
            }
            cursorPos++;
          }
          break;
      }
    }

    // Add final line if not empty
    if (currentLine) {
      result.push(currentLine);
    }

    return result.join('\n');
  }

  /**
   * Sanitize output by removing all ANSI escape sequences
   */
  static sanitize(input: string): string {
    if (!input) return '';

    // Remove ANSI sequences
    let result = input.replace(this.ANSI_REGEX, '');

    // Remove other control characters except newline and tab
    result = result.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

    return result;
  }

  /**
   * Strip pager artifacts like "--More--" and detect if pager was present
   * Returns object with cleaned text and whether pager was detected
   */
  static stripPagerArtifacts(text: string): { text: string; sawPager: boolean } {
    let sawPager = false;

    // Check for pager prompt
    if (this.PAGER_REGEX.test(text)) {
      sawPager = true;
      text = text.replace(this.PAGER_REGEX, '');
    }

    // Also check for other common pager patterns
    const pagerPatterns = [
      /--More-- \(\d+%\)\s*/g,
      /<--- More --->\s*/g,
      /Press any key to continue\.\.\.\s*/g,
      /Press SPACE for more, Q to quit\.\.\.\s*/g,
    ];

    for (const pattern of pagerPatterns) {
      if (pattern.test(text)) {
        sawPager = true;
        text = text.replace(pattern, '');
      }
    }

    return { text, sawPager };
  }

  /**
   * Strip pager dismissal artifacts (carriage returns and spaces used to clear pager prompt)
   * After sending space to dismiss pager, devices send \r + spaces + \r to clear the prompt
   */
  static stripPagerDismissalArtifacts(text: string): string {
    if (!text) return text;
    // Pattern: \r followed by spaces followed by \r
    return text.replace(/^\r[ ]+\r/, '');
  }

  /**
   * Check if text contains a pager prompt
   */
  static containsPagerPrompt(text: string): boolean {
    return this.PAGER_REGEX.test(text);
  }

  /**
   * Check if character is an escape sequence terminator
   */
  private static isEscapeTerminator(char: string): boolean {
    const code = char.charCodeAt(0);
    // Letters (A-Z, a-z) terminate CSI sequences
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
  }

  /**
   * Extract visible text length (excluding ANSI codes)
   */
  static visibleLength(text: string): number {
    return this.sanitize(text).length;
  }
}
