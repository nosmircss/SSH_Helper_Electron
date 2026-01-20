/**
 * Parse host and port from input string in format "host:port" or just "host"
 * @param input - Input string in format "192.168.1.100:2222" or "192.168.1.100"
 * @returns Object containing host and port (default 22)
 */
export function parseHostAndPort(input: string): { host: string; port: number } {
  const parts = input.split(':');
  if (parts.length === 2) {
    const port = parseInt(parts[1], 10);
    if (!isNaN(port) && port > 0 && port <= 65535) {
      return { host: parts[0], port };
    }
  }
  return { host: input, port: 22 };
}

/**
 * Format host and port for display
 * @param host - Host IP or hostname
 * @param port - Port number
 * @returns Formatted string "host:port" or just "host" if port is 22
 */
export function formatHostAndPort(host: string, port: number): string {
  return port === 22 ? host : `${host}:${port}`;
}
