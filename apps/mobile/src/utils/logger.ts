/**
 * Logger utility that suppresses debug/info logs in production builds.
 * Uses React Native's __DEV__ flag to determine environment.
 *
 * - debug/info: Only logged in development console
 * - warn/error: Always logged to console
 *
 * All levels are always captured in a ring buffer for export
 * via the Activity Log screen.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR"

export const LOG_LEVELS: readonly LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR"]

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
}

const MAX_BUFFER_SIZE = 2000
const logBuffer: LogEntry[] = []
const isTestEnvironment = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV === "test"

function shouldWriteConsole(method: (...args: unknown[]) => void): boolean {
  // Keep logger unit tests observable while preventing late async logs from failing Jest.
  return !isTestEnvironment || Boolean((method as unknown as { _isMockFunction?: boolean })._isMockFunction)
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) return arg.message
      if (typeof arg === "object" && arg !== null) {
        try {
          return JSON.stringify(arg)
        } catch {
          return String(arg)
        }
      }
      return String(arg)
    })
    .join(" ")
}

function pushEntry(level: LogLevel, args: unknown[]): void {
  if (logBuffer.length >= MAX_BUFFER_SIZE) {
    logBuffer.splice(0, logBuffer.length - MAX_BUFFER_SIZE + 1)
  }
  logBuffer.push({
    timestamp: new Date().toISOString(),
    level,
    message: formatArgs(args)
  })
}

export function getLogEntries(): readonly LogEntry[] {
  return logBuffer
}

export const logger = {
  debug: (...args: unknown[]) => {
    pushEntry("DEBUG", args)
    if (__DEV__ && shouldWriteConsole(console.log)) console.log(...args)
  },
  info: (...args: unknown[]) => {
    pushEntry("INFO", args)
    if (__DEV__ && shouldWriteConsole(console.log)) console.log(...args)
  },
  warn: (...args: unknown[]) => {
    pushEntry("WARN", args)
    if (shouldWriteConsole(console.warn)) console.warn(...args)
  },
  error: (...args: unknown[]) => {
    pushEntry("ERROR", args)
    if (shouldWriteConsole(console.error)) console.error(...args)
  }
}
