import type { Config } from '../config.js'
import type { Db } from '../db/open.js'
import type { Statements } from '../db/statements.js'
import type { TxLogsStrategy } from '../fetch/txLogs.js'
import type { Logger } from '../logger.js'
import type { Rpc } from '../rpc/client.js'

/** Everything a command needs, built once in `cli.ts` and passed down explicitly. */
export interface AppContext {
  config: Config
  log: Logger
  rpc: Rpc
  db: Db
  stmts: Statements
  strategy: TxLogsStrategy
}
