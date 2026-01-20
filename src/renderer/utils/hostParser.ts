/**
 * Parse host and port from input string in format "host:port" or just "host"
 * Supports IPv4 addresses, hostnames, and IPv6 addresses in bracket notation
 * @param input - Input string in format "192.168.1.100:2222", "[::1]:2222", or "192.168.1.100"
 * @returns Object containing host and port (default 22)
 */
export function parseHostAndPort(input: string): { host: string; port: number } {
  const trimmedInput = input.trim();
  
  // Handle IPv6 addresses in bracket notation [host]:port
  if (trimmedInput.startsWith('[')) {
    const bracketEnd = trimmedInput.indexOf(']');
    if (bracketEnd !== -1) {
      const host = trimmedInput.substring(1, bracketEnd);
      const remainder = trimmedInput.substring(bracketEnd + 1);
      
      if (remainder.startsWith(':')) {
        const port = parseInt(remainder.substring(1), 10);
        if (!isNaN(port) && port > 0 && port <= 65535) {
          return { host, port };
        }
      }
      return { host, port: 22 };
    }
  }
  
  // Count colons to detect potential IPv6 address without brackets
  const colonCount = (trimmedInput.match(/:/g) || []).length;
  
  // If there are multiple colons, assume it's an IPv6 address without port
  // IPv6 addresses must be specified in bracket notation when using a port
  if (colonCount > 1) {
    return { host: trimmedInput, port: 22 };
  }
  
  // Handle regular host:port format
  const lastColonIndex = trimmedInput.lastIndexOf(':');
  if (lastColonIndex !== -1) {
    const possibleHost = trimmedInput.substring(0, lastColonIndex);
    const possiblePort = trimmedInput.substring(lastColonIndex + 1);
    const port = parseInt(possiblePort, 10);
    
    if (!isNaN(port) && port > 0 && port <= 65535) {
      return { host: possibleHost, port };
    }
  }
  
  // No port specified or invalid port, return input as host with default port
  return { host: trimmedInput, port: 22 };
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
