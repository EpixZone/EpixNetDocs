---
description: What Epix Chain means for a xite author. Networks, chain IDs, endpoints, address formats, the architecture of a web3 xite, the Epix Wallet, the sandbox caveat for wallets, and a map of the web3 tutorials.
---

# Epix Chain for xite developers

This page is the starting point for adding on-chain features to a xite: payments, tips, claims, names, randomness, or your own contracts. It gives you the practical facts about Epix Chain (networks, endpoints, addresses), explains how a web3 xite is put together, and points to the tutorials. It assumes you can already build and publish a plain xite. If you cannot yet, start with the [quick start](../build/quickstart.md).

## What Epix Chain is, in practice

Epix Chain is an EVM compatible chain built with the Cosmos SDK. For a xite author that means three things:

- **You write ordinary EVM code.** Contracts are Solidity, wallets speak the standard browser provider interface (EIP-1193), and a page talks to the chain with a normal Ethereum library. The official xites use [ethers](https://docs.ethers.org/v6/) version 6.
- **The chain has native features exposed as precompiles.** A precompile is a contract address whose logic is implemented by the chain itself. Epix Chain has one for [xID](xid.md) (names and identity) and one for [verifiable randomness](contracts.md#verifiable-randomness).
- **The same account has two address spellings.** A `0x` address for EVM tools and an `epix1` address for Cosmos tools. See [Addresses](#addresses-epix1-and-0x).

EpixNet and Epix Chain are separate systems. EpixNet replicates signed files between peers and needs no chain to do that. The chain is used where a shared, ordered ledger is needed: who owns a name, who paid whom, what a contract's state is.

## Networks and endpoints

| | Mainnet | Testnet |
| --- | --- | --- |
| EVM chain ID | `1916` (`0x77C`) | `1917` (`0x77D`) |
| Cosmos chain ID | `epix_1916-1` | `epix_1917-1` |
| EVM JSON-RPC | `https://evmrpc.epix.zone` | `https://evmrpc.testnet.epix.zone` |
| Cosmos REST API | `https://api.epix.zone` | `https://api.testnet.epix.zone` |
| CometBFT RPC | `https://rpc.epix.zone` | `https://rpc.testnet.epix.zone` |
| EVM block explorer | `https://scan.epix.zone` | `https://testscan.epix.zone` |
| Native token | EPIX | EPIX |
| Decimals | 18 | 18 |
| Base denomination | `aepix` | `aepix` |

One EPIX is 10 to the power of 18 `aepix`, the same ratio as ether to wei, so `ethers.parseEther` and `ethers.formatEther` work unchanged.

The EVM block explorers run Blockscout. A transaction page is `<explorer>/tx/<0x hash>` and an account page is `<explorer>/address/<0x address>`. There is also an in-network explorer, the [Epix Explorer xite](../start/apps.md), which shows Cosmos transaction hashes and `epix1` accounts.

!!! note "Where these values come from"
    The EVM chain IDs and the testnet EVM RPC and explorer URLs are the ones in the [EpixKit README](https://github.com/EpixZone/epixkit) and the contract kit READMEs. The mainnet REST, EVM RPC and explorer URLs are the node's built-in defaults, and the official xites use the same ones. The Cosmos chain IDs, REST and CometBFT endpoints come from the chain configuration of the [Epix explorer](https://github.com/EpixZone/epix.explorer). That configuration also lists `https://rest.cosmos.directory/epix` and `https://rpc.cosmos.directory/epix` as alternative mainnet endpoints. Public endpoints change over time, so treat a hardcoded URL as a fallback, not as the source of truth. On mainnet, ask the node (next section).

### Ask the node for the endpoints

A user can change the chain endpoints on the node's [Config page](../start/dashboard.md), under **Epix Chain Config**, for example to use their own RPC server. The node hands the configured values to every xite through `serverInfo`:

| `serverInfo` field | Meaning | Built-in default |
| --- | --- | --- |
| `chain_evm_rpc_url` | First configured EVM JSON-RPC endpoint | `https://evmrpc.epix.zone` |
| `chain_evm_rpc_urls` | Every configured EVM JSON-RPC endpoint, in order of preference | One entry, the default |
| `chain_rpc_url` | The Cosmos REST endpoint the node's own chain traffic last confirmed working | `https://api.epix.zone` |
| `chain_rpc_urls` | Every configured Cosmos REST endpoint | One entry, the default |
| `chain_block_explorer_url` | EVM block explorer base URL | `https://scan.epix.zone` |

Two details are easy to get wrong:

- **`chain_rpc_url` is the Cosmos REST base, not an EVM endpoint.** Use `chain_evm_rpc_url` for ethers.
- **The node never calls the EVM endpoints itself.** EVM requests are made by the browser, so only your page can see one fail. The `_urls` lists exist so that your page can move to the next endpoint on a network error.

```js title="Read the chain endpoints from the node"
// epixFrame is the EpixFrame singleton (see ../libraries/epixframe.md).
const info = await epixFrame.serverInfo();

const evmRpcs = info.chain_evm_rpc_urls && info.chain_evm_rpc_urls.length
  ? info.chain_evm_rpc_urls
  : [info.chain_evm_rpc_url || "https://evmrpc.epix.zone"];
const explorer = (info.chain_block_explorer_url || "https://scan.epix.zone").replace(/\/+$/, "");

const readProvider = new ethers.JsonRpcProvider(evmRpcs[0]);
```

EpixFrame also has the shortcuts `chainEvmRpcUrl()`, `chainRpcUrl()` and `chainBlockExplorerUrl()`, which return the single-value fields.

!!! warning "The node's endpoints describe mainnet"
    The node's defaults, its name resolution and its xID verification all target mainnet. If your xite targets testnet, do not use the `serverInfo` endpoints. Use the testnet URLs from the table above.

## Addresses: epix1 and 0x

An Epix Chain account is identified by 20 bytes derived from its public key. Those bytes are written in two ways:

- **`0x` hex**, for example `0x1234...abcd`. Used by EVM wallets, ethers, contracts and the EVM block explorer.
- **`epix1` bech32**, the same 20 bytes encoded with the `epix` prefix. Used by Cosmos tools, the Cosmos REST API and the Epix Explorer xite.

They are the same account. Converting between them is a pure re-encoding and needs no network call. The chain uses coin type 60 and Ethereum style key derivation, so a wallet shows the same account under both spellings.

EpixNet uses the same derivation for its own addresses: the Keccak-256 hash of the public key, last 20 bytes, bech32 with the `epix` prefix. That is why a xite address, a node identity address and a wallet account all look like `epix1...`. They are still different keys with different jobs:

| Address | Whose key | Where the key lives | Used for |
| --- | --- | --- | --- |
| Wallet account (`0x` or `epix1`) | The user's chain account | The wallet | Holding EPIX, paying fees, owning `.epix` names, calling contracts |
| Xite address (`epix1`) | The xite owner | The owner's node | Signing the xite's `content.json` |
| Identity address, also called auth address (`epix1`) | The visitor's node identity | The visitor's node | Signing that visitor's user content |

!!! warning "A wallet does not sign xite content"
    Connecting a wallet gives your page a chain account. It does not give you the visitor's EpixNet identity, and the node's identity does not give you a wallet. [xID](xid.md) is the link between the two: a name owned by a wallet account, with one or more identity addresses linked to it.

For conversions in a page, you have three options:

- The xID precompile accepts both spellings: `reverseResolve(address)` takes a `0x` address and `reverseResolveBech32(string)` takes an `epix1` string.
- The xID manager xite carries a small dependency-free bech32 helper (`js/utils/Bech32.js` in the [EpixNet-xAuth repository](https://github.com/EpixZone/EpixNet-xAuth)) with `evmToBech32` and `bech32ToEvm`.
- Always normalize `0x` addresses with `ethers.getAddress()` before comparing them, or compare lowercase strings.

## Architecture of a web3 xite

A web3 xite has no backend server. It has up to four parts, and each one holds a different kind of state.

<figure class="epix-diagram-figure" markdown="0">
<div class="epix-diagram">
--8<-- "docs/en/img/diagrams/web3.svg"
</div>
<figcaption>The page talks to the wallet for anything that needs a signature, and reads the chain directly.</figcaption>
</figure>

| Part | Where it runs | What belongs there |
| --- | --- | --- |
| **Static files** | Signed by the owner, replicated by peers, served by the visitor's own node | HTML, CSS, JavaScript, vendored libraries, ABIs, contract addresses |
| **Wallet** | The visitor's browser | Keys, account selection, transaction approval |
| **Contracts** | Epix Chain | Balances, ownership, payments, anything several parties must agree on |
| **Xite database** (optional) | Built by each node from signed JSON files | Posts, comments, profiles, anything large, frequently edited, or free to write |

The flow for a typical action, such as tipping a forum post, is:

1. The visitor's node serves your signed files from local disk. Nothing is fetched from a web server.
2. Your page reads contract state directly from an EVM RPC endpoint with a read-only provider. No wallet is needed for reads.
3. When the visitor acts, your page asks a wallet to connect, then asks it to sign and send a transaction. The wallet shows its own approval prompt.
4. Your page waits for the receipt, then reads the new state and updates the page.
5. Any accompanying content (the post itself, a comment about the tip) is written as [user content](../build/user-content.md), signed by the visitor's node identity and replicated by peers.

Consequences worth designing for:

- **The page must load without the chain.** The files are local, but RPC calls need a network path to the endpoint. Render the off-chain content first and treat chain data as something that arrives later or not at all.
- **RPC endpoints see requests.** The operator of an endpoint can see the addresses and contracts your page queries, and the visitor's IP address unless the browser routes that traffic through Tor. In EpixNet Browser, ordinary web requests follow the **Route clearnet through Tor** setting (see [Browser and wallet](../start/browser-wallet.md)).
- **Everything in your files is public and replaceable by you.** A contract address in your JavaScript is trusted only as far as visitors trust you as the publisher. A valid xite signature proves who published a page. It does not prove the page is honest.
- **Vendor every library.** A xite should not load scripts from a CDN: it would break offline and it would hand control of your page to a third party. Copy EpixKit and ethers into your xite, as the official xites do. The [wallet tutorial](wallet-connect.md#step-1-vendor-the-libraries) shows how.

## What the node adds for a web3 page

You can build a web3 xite with nothing but a wallet and an RPC endpoint. The node adds a few things that are hard to do well in a page:

| Capability | Commands | Notes |
| --- | --- | --- |
| Chain endpoints chosen by the user | `serverInfo` | See [Ask the node for the endpoints](#ask-the-node-for-the-endpoints) |
| Verified name and identity lookups | `xidResolve`, `xidResolveBatch`, `xidResolveName` | Checked against a state digest signed by validators. See [xID for developers](xid.md) |
| The visitor's identity | `siteInfo`, `certXid` | See [User content](../build/user-content.md) |
| Random beacons without a wallet | `vrfLatestBeacon`, `vrfGetBeacon`, `vrfMultiBlockBeacon`, `vrfDeriveRandom` | See [Verifiable randomness](contracts.md#verifiable-randomness) |

The full command reference is in the [EpixFrame API overview](../api/index.md).

## The Epix Wallet

EpixNet Browser ships with the Epix Wallet, a fork of the Keplr wallet with Epix Chain built in. To your page it is an ordinary EVM wallet:

- It announces itself through [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) with the identifier `zone.epix.wallet`.
- [EpixKit](../libraries/epixkit.md), the official connection library, lists it first in the wallet picker.
- Your page receives the account address only after the user approves the connection, and every transaction needs its own approval. The page never sees a key.

Do not write a xite that works only with the Epix Wallet. EpixKit lists every installed EVM wallet it can detect, and a visitor using a regular browser may have MetaMask, Rabby or another wallet. Always handle the case where no wallet is installed.

Platform support differs. On desktop and Android the wallet is a browser extension inside the app. On iOS it runs as a web app served by the node, and wallet connections from pages are still being validated there. The user side of the wallet is described in [Browser and wallet](../start/browser-wallet.md#the-epix-wallet).

## The sandbox caveat for wallets

A xite page runs inside an iframe controlled by the node (the wrapper). Which origin that iframe gets depends on how the visitor reaches the node, and wallets care about origins.

| How the xite is opened | Page origin | Wallets |
| --- | --- | --- |
| EpixNet Browser | Its own `.epix` content host | Work. Account grants belong to that xite. |
| A regular browser on the same machine (`127.0.0.1` or `localhost`) | A per-xite `localhost` content host | Work. Account grants belong to that xite and that node port. |
| A LAN address or a public gateway | Opaque (`null`) | An installed wallet's message transport can be blocked. Requests may never be answered. |

EpixKit handles the third case by timing out the request and explaining the limitation to the user. It cannot make the wallet work there. Do not ask users to grant your xite `NOSANDBOX` to work around this. Tell them to open the xite on a local node or in EpixNet Browser.

The opaque origin also has no `localStorage`, so EpixKit cannot remember the last wallet used and silent reconnect does not happen. The details are in [Wallets inside sandboxed frames](../build/sandbox.md#wallets-inside-sandboxed-frames).

## Precompiles and official contracts

Precompiles exist at the same address on mainnet and testnet.

| Precompile | Address | Reference |
| --- | --- | --- |
| xID | `0x0000000000000000000000000000000000000900` | [xID for developers](xid.md#the-xid-precompile) |
| VRF | `0x0000000000000000000000000000000000000901` | [Verifiable randomness](contracts.md#verifiable-randomness) |

The official contract kits are deployed at these addresses:

| Contract | Mainnet | Testnet | Source |
| --- | --- | --- | --- |
| EpixTipping | `0xD0793a2a11Fa3600Ec941115937FB8E259cfdbf1` | `0x22c5622378fb8E9AB52EA0b00cAce94474829df3` | [epix-tipping](https://github.com/EpixZone/epix-tipping) |
| EpixAirdrop | `0x3BDB4DB4B960b5679f22AA5122A31a4E9f38A86E` | `0xCa9aDc8736d5fb1743939cA745824fB8fBd97793` | [epix-airdrop](https://github.com/EpixZone/epix-airdrop) |
| VRFCoinFlip | `0x9dA2082E0486A642864a7065dbcb0A9fca1E2B07` | Not recorded | [vrf-contracts](https://github.com/EpixZone/vrf-contracts) |

!!! warning "Verify an address before sending value"
    These addresses come from the deployment records in the source repositories and from the official xites that use them. Check a contract on the block explorer before you hardcode its address, and again before you send anything of value to it.

The kits themselves are described in [Smart contract kits](../libraries/contracts.md).

## Tutorials

<div class="grid cards" markdown>

-   :material-wallet-outline: **[Connect a wallet](wallet-connect.md)**

    ---

    Vendor EpixKit and ethers, add a connect button, handle reconnect, disconnect, account and network changes, show a balance, and deal with errors and timeouts.

-   :material-file-sign: **[Read and write contracts](contracts.md)**

    ---

    Read-only providers, transactions with clear status and error messages, and the patterns the official xites use: tipping, airdrop claims and verifiable randomness.

-   :material-card-account-details-outline: **[xID for developers](xid.md)**

    ---

    What is registered on chain, the xID precompile, verified lookups through the node, and how to attribute or gate content by name.

-   :material-package-variant-closed: **[Libraries and kits](../libraries/index.md)**

    ---

    EpixFrame, EpixKit, the React template, the contract kits and the UI kit, with guidance on when to use each.

</div>

## Before you ship

- [ ] Every script is vendored in the xite. No CDN, no remote fonts.
- [ ] The page renders its off-chain content when the RPC endpoint is unreachable.
- [ ] Mainnet endpoints come from `serverInfo`, with the public URLs as a fallback.
- [ ] Reads use a read-only provider. The wallet is asked only when the user acts.
- [ ] The no-wallet state and the wrong-network state both have a clear message.
- [ ] Contract addresses and chain ID match the network you intend. Testnet and mainnet values are never mixed.
- [ ] Amounts are handled as `bigint` values in `aepix`, and formatted only for display.
- [ ] You tested in EpixNet Browser and in a regular browser on `127.0.0.1`.

## Related pages

- [Connect a wallet](wallet-connect.md)
- [Read and write contracts](contracts.md)
- [xID for developers](xid.md)
- [EpixKit reference](../libraries/epixkit.md)
- [Smart contract kits](../libraries/contracts.md)
- [The wrapper sandbox](../build/sandbox.md)
- [Browser and wallet](../start/browser-wallet.md)
- [Glossary](../reference/glossary.md)
