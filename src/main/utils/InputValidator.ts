/**
 * Input validation utilities
 * Ported from: Utilities/InputValidator.cs
 */
export class InputValidator {
  /**
   * Validate IP address with optional port
   * Accepts: "192.168.1.1" or "192.168.1.1:22"
   */
  static isValidIpAddress(ipWithPort: string): boolean {
    if (!ipWithPort) return false;

    const parts = ipWithPort.split(':');
    const ip = parts[0];

    // Validate IP
    const octets = ip.split('.');
    if (octets.length !== 4) return false;

    for (const octet of octets) {
      const num = parseInt(octet, 10);
      if (isNaN(num) || num < 0 || num > 255) return false;
    }

    // Validate port if present
    if (parts.length === 2) {
      return this.isValidPort(parts[1]);
    }

    return parts.length === 1;
  }

  /**
   * Validate port number (1-65535)
   */
  static isValidPort(port: string | number): boolean {
    const num = typeof port === 'string' ? parseInt(port, 10) : port;
    return !isNaN(num) && num >= 1 && num <= 65535;
  }

  /**
   * Validate timeout value (1-3600 seconds)
   */
  static isValidTimeout(seconds: number): boolean {
    return !isNaN(seconds) && seconds >= 1 && seconds <= 3600;
  }

  /**
   * Validate delay value (0-60000 ms)
   */
  static isValidDelay(ms: number): boolean {
    return !isNaN(ms) && ms >= 0 && ms <= 60000;
  }

  /**
   * Sanitize column name - replace spaces with underscores
   */
  static sanitizeColumnName(name: string): string {
    return name.trim().replace(/\s+/g, '_');
  }

  /**
   * Check if value is not empty
   */
  static isNotEmpty(value: string | null | undefined): boolean {
    return value !== null && value !== undefined && value.trim().length > 0;
  }

  /**
   * Parse integer with default fallback
   */
  static parseIntOrDefault(text: string, defaultValue: number): number {
    const parsed = parseInt(text, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Clamp value to range
   */
  static clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Parse IP:Port string
   */
  static parseHostPort(hostWithPort: string): { ip: string; port: number } {
    const parts = hostWithPort.split(':');
    return {
      ip: parts[0],
      port: parts.length > 1 ? parseInt(parts[1], 10) : 22,
    };
  }

  /**
   * Validate hostname (basic check)
   */
  static isValidHostname(hostname: string): boolean {
    if (!hostname) return false;

    // Basic hostname regex
    const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return hostnameRegex.test(hostname);
  }

  /**
   * Check if string is valid IP or hostname
   */
  static isValidHost(host: string): boolean {
    return this.isValidIpAddress(host) || this.isValidHostname(host);
  }
}
