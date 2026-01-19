import type { ScriptStep } from '../../../shared/models';
import type { ScriptContext } from '../ScriptContext';
import type { IScriptCommand, CommandResult } from './IScriptCommand';
import { successResult, errorResult } from './IScriptCommand';
import { SshExecutionService } from '../../services/SshExecutionService';

/**
 * Executes an SSH command
 * Ported from: Services/Scripting/Commands/SendCommand.cs
 */
export class SendCommand implements IScriptCommand {
  private sshService: SshExecutionService;

  constructor(sshService: SshExecutionService) {
    this.sshService = sshService;
  }

  async execute(step: ScriptStep, context: ScriptContext): Promise<CommandResult> {
    const rawCommand = String(step.value || '');
    const command = context.substituteVariables(rawCommand);

    if (!command.trim()) {
      return errorResult('Send command is empty');
    }

    // Debug: show variable substitution if different
    if (rawCommand !== command) {
      context.emitOutput(`[SEND] Raw: "${rawCommand}"`, 'Debug');
      context.emitOutput(`  Resolved: "${command}"`, 'Debug');
    }

    // Show command unless suppressed
    if (!step.suppress) {
      context.emitOutput(`$ ${command}`, 'Command');
    }

    try {
      // Execute via SSH service
      if (!context.hostId) {
        return errorResult('No host connection');
      }

      const timeout = step.timeout ? step.timeout * 1000 : 30000;
      const result = await this.sshService.execute(context.hostId, command, timeout);

      // Record output
      context.recordCommandOutput(result.output, step.capture);

      // Show output unless suppressed
      if (!step.suppress && result.output) {
        context.emitOutput(result.output, 'CommandOutput');
      }

      // Debug: show capture info
      if (step.capture) {
        const outputLen = result.output?.length || 0;
        const preview = outputLen > 60 ? result.output.substring(0, 57) + '...' : result.output;
        context.emitOutput(`  Captured to '${step.capture}' (${outputLen} chars): "${preview}"`, 'Debug');
      }

      if (!result.success) {
        if (step.onError === 'continue') {
          context.emitOutput(`Command failed: ${result.errorMessage}`, 'Warning');
          return successResult();
        }
        return errorResult(result.errorMessage || 'Command failed');
      }

      return successResult();
    } catch (error) {
      const message = (error as Error).message;
      if (step.onError === 'continue') {
        context.emitOutput(`Command error: ${message}`, 'Warning');
        return successResult();
      }
      return errorResult(message);
    }
  }
}
