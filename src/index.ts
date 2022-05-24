import 'setimmediate'

import chalk from 'chalk'
import hre from 'hardhat'
import { TASK_NODE, TASK_NODE_GET_PROVIDER, TASK_NODE_SERVER_READY } from 'hardhat/builtin-tasks/task-names'
import { HardhatNetworkAccountsConfig, JsonRpcServer } from 'hardhat/types'

import { toExternallyOwnedAccounts } from './accounts'
import { Hardhat } from './hardhat'

const start = Date.now()

if (!hre.config.networks.hardhat.forking) {
  throw new Error(
    '`forking` must be specified to use hardhat-plugin-jest.\nSee https://hardhat.org/hardhat-network/guides/mainnet-forking.html#mainnet-forking.'
  )
}

// Test accounts break programmatic usage. Instead, configure the test accounts after the network starts.
const accounts = hre.network.config.accounts as HardhatNetworkAccountsConfig
hre.network.config.accounts = []

// TODO: parse url and add (WORKER_ID - 1)
const url = hre.config.networks.localhost.url

// Override the GET_PROVIDER task to avoid unnecessary time-intensive evm calls.
hre.tasks[TASK_NODE_GET_PROVIDER].setAction(async () => hre.network.provider)
const serverReady = new Promise<JsonRpcServer>((resolve) =>
  hre.tasks[TASK_NODE_SERVER_READY].setAction(async ({ server }) => resolve(server))
)
hre.run(TASK_NODE)

// Address normalization is computation intensive, so do it while waiting for the server to be ready.
const wallets = toExternallyOwnedAccounts(accounts)
if (wallets.length > 4) {
  process.stderr.write(chalk.yellow(`${wallets.length} hardhat accounts specified - consider specifying fewer.\n`))
  process.stderr.write('Specifying multiple hardhat accounts will noticeably slow your test startup time.\n\n')
}

beforeAll(async () => {
  // Waits for the node server to be ready.
  await serverReady

  // Enables hardhat logging if --verbose was passed.
  if (hre.config.networks.hardhat.loggingEnabled || process.argv.includes('--verbose')) {
    await hre.network.provider.send('hardhat_setLoggingEnabled', [true])
  }

  globalThis.hardhat = new Hardhat(url, wallets)

  const elapsedMs = Date.now() - start
  process.stdout.write(`Initialized hardhat network in ${(elapsedMs / 1000).toFixed(3)} s\n\n`)
})

afterAll(async () => {
  // Waits for the node server to shut down.
  const server = await serverReady
  await server.close()
})