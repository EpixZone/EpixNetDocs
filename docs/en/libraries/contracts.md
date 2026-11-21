---
description: What each official smart contract kit contains (epix-tipping, epix-airdrop, vrf-contracts, contract_examples), which addresses are published, and how a xite calls a contract.
---

# Smart contract kits

This page describes the four official Solidity repositories for Epix Chain: what is in each one, which deployed addresses are published, and how a xite uses a contract from the browser. It is for developers who want on-chain features such as payments, rewards or randomness in a xite. For step-by-step walkthroughs, see [Reading and writing contracts](../web3/contracts.md).

Epix Chain runs an EVM, so contracts are ordinary Solidity and you call them with ordinary EVM tooling. What is specific to Epix Chain are two **precompiles**, contracts built into the chain at fixed addresses, which the kits show how to use:

| Precompile | Address | Purpose | Interface file |
| --- | --- | --- | --- |
| xID | `0x0000000000000000000000000000000000000900` | Resolve `.epix` names to addresses and back, from inside a contract | `IXID.sol` in epix-tipping and epix-airdrop |
| VRF | `0x0000000000000000000000000000000000000901` | Read the chain's per-block random beacon from inside a contract | `IVRF.sol` in vrf-contracts |

xID is the chain's name and identity system; see [xID for developers](../web3/xid.md). For networks, chain IDs and endpoints, see [Epix Chain for xite developers](../web3/index.md).

## At a glance

| Repository | Contracts | Toolchain | Demonstrates | Used by |
| --- | --- | --- | --- | --- |
| [epix-tipping](https://github.com/EpixZone/epix-tipping) | `EpixTipping` | Foundry, Solidity 0.8.24 | Native EPIX payments keyed by content, on-chain stats, xID lookups in both directions | Epix Talk |
| [epix-airdrop](https://github.com/EpixZone/epix-airdrop) | `EpixAirdrop` | Foundry | A shared pool with one claim per address and a boost for xID holders | Epix Airdrop xite |
| [vrf-contracts](https://github.com/EpixZone/vrf-contracts) | `VRFCoinFlip` | Foundry, Solidity 0.8.24 | Commit and reveal against the random beacon | VRF Debugger xite |
| [contract_examples](https://github.com/EpixZone/contract_examples) | `YogiToken`, `YogiNFTCollection`, `YogiMultiToken` | Hardhat, Solidity 0.8.18, OpenZeppelin 4.9 | ERC-20, ERC-721 and ERC-1155 deployments | An example only |

!!! warning "Examples, not audited products"
    These repositories are published as examples and starting points. None of them includes an audit report. Read the code, run the tests and decide for yourself before you send real funds through a contract or deploy a copy of one. A transaction on a public chain is visible to everyone and cannot be undone.

## epix-tipping

Tips content creators in native EPIX. The whole amount of each tip is forwarded to the creator; the contract takes no fee and has no owner or pause function.

### What is in the repository

| Path | Content |
| --- | --- |
| `src/EpixTipping.sol` | The contract |
| `src/IEpixTipping.sol` | The interface, with structs, events and documentation comments. Read this first |
| `src/IXID.sol` | The xID precompile interface (the three methods this contract needs) |
| `script/Deploy.s.sol` | Foundry deployment script |
| `test/EpixTipping.t.sol`, `test/mocks/MockXID.sol` | Tests, with a mock xID precompile |
| `verify.sh` | Source verification on the block explorer |
| `broadcast/Deploy.s.sol/1917/` | The recorded testnet deployment |

### How it works

Each piece of content (a forum post, a comment, a blog entry) is identified by a 32-byte content hash:

```text
contentHash = keccak256(abi.encode(xiteAddress, authorDirectory, postId))
```

The first tip to a content hash permanently binds it to the recipient. Later tips to the same hash go to that creator, and a different recipient is rejected. The contract keeps statistics that a page can read for free: the total tipped, the number of unique tippers, the three largest tippers and the three most recent tips, each with the tipper's xID name where one exists.

| Function | Kind | Purpose |
| --- | --- | --- |
| `tip(bytes32 contentHash, address recipient)` | payable | Tip by address. After the first tip, `address(0)` means "the stored creator" |
| `tipByXid(bytes32 contentHash, string name, string tld)` | payable | Tip by xID name. The contract resolves the name through the precompile and reverts with `xID: name not found` if it does not exist |
| `refreshXidName()` | write | Update the caller's cached xID name after it changed |
| `getTipperCount(bytes32)` and `getTipperCountBatch(bytes32[])` | view | Unique tipper counts, for badges. The batch form covers a whole page in one call |
| `getContentSummary(bytes32)` and `getContentSummaryBatch(bytes32[])` | view | Creator, total amount and unique tippers |
| `getContentInfo(bytes32)` | view | Everything, including the top three and last three |
| `getTipperAmount(bytes32, address)` | view | What one tipper has sent to one content hash |
| `computeContentHash(string, string, string)` | pure | The hash formula, for checking your client-side computation |

Events: `Tipped(contentHash, tipper, recipient, amount)` and `ContentRegistered(contentHash, creator)`.

### Published addresses

| Network | Address | Source |
| --- | --- | --- |
| Testnet (chain ID 1917) | `0x22c5622378fb8E9AB52EA0b00cAce94474829df3` | The repository README and its recorded deployment |
| Mainnet (chain ID 1916) | `0xD0793a2a11Fa3600Ec941115937FB8E259cfdbf1` | The address Epix Talk uses (`js/utils/Tipping.js` in [EpixTalk-Xite](https://github.com/EpixZone/EpixTalk-Xite)). The contract repository's README still lists mainnet as to be decided |

## epix-airdrop

A pool that anyone can fund and from which each address can claim once. Addresses with an xID receive ten times the base rate.

### What is in the repository

| Path | Content |
| --- | --- |
| `src/EpixAirdrop.sol` | The contract |
| `src/IEpixAirdrop.sol` | The interface, with structs and events |
| `src/IXID.sol` | The xID precompile interface |
| `script/Deploy.s.sol` | Foundry deployment script |
| `test/EpixAirdrop.t.sol`, `test/mocks/MockXID.sol` | Tests, with a mock xID precompile |
| `verify.sh` | Source verification on the block explorer |
| `broadcast/Deploy.s.sol/1917/` | The recorded testnet deployment |

### How it works

1. Anyone funds the pool by sending EPIX to the contract with a plain transfer.
2. An address calls `claim()` once.
3. The claim is a fraction of the current pool balance, so the pool shrinks with every claim but is never emptied by one.

| Parameter | Value |
| --- | --- |
| Base rate | 0.1% of the pool (10 basis points) |
| xID boost | 10 times (1% of the pool) |
| Maximum claim without xID | 1,000 EPIX |
| Maximum claim with xID | 10,000 EPIX |
| Minimum claim | 1 EPIX. Below that, `claim()` reverts with `Pool exhausted` |
| Claims per address | One. A second call reverts with `Already claimed` |

| Function | Kind | Purpose |
| --- | --- | --- |
| `claim()` | write | Claim once |
| `estimateClaim(address)` | view | The amount an address would receive now, and whether the xID boost applies |
| `getPoolInfo()` | view | Balance, total claimed, number of claimers and the parameters above |
| `getClaimerInfo(address)` | view | Whether and when an address claimed, how much, and its xID name |
| `getRecentClaims()` | view | The last five claims, most recent first |

Events: `Claimed(claimer, amount, xidBoosted)` and `Funded(funder, amount)`.

### Published addresses

| Network | Address | Source |
| --- | --- | --- |
| Testnet (chain ID 1917) | `0xca9adc8736d5fb1743939ca745824fb8fbd97793` | The repository's recorded deployment |
| Mainnet (chain ID 1916) | `0x3BDB4DB4B960b5679f22AA5122A31a4E9f38A86E` | The address the Epix Airdrop xite uses (`index.html` in [epix-airdrop-xite](https://github.com/EpixZone/epix-airdrop-xite)) |

## vrf-contracts

Shows how a contract consumes the chain's verifiable random beacon. The chain's VRF module produces one 32-byte beacon value per block.

### What is in the repository

| Path | Content |
| --- | --- |
| `src/IVRF.sol` | The VRF precompile interface |
| `src/VRFCoinFlip.sol` | An over or under guessing game that uses it |
| `script/Deploy.s.sol` | Foundry deployment script |
| `test/VRFCoinFlip.t.sol` | Tests |
| `verify.sh` | Source verification on the block explorer |

The repository itself records no deployed address. The [VRF Debugger](https://github.com/EpixZone/vrf-debugger) xite plays a mainnet deployment:

| Network | Address | Source |
| --- | --- | --- |
| Mainnet (chain ID 1916) | `0x9dA2082E0486A642864a7065dbcb0A9fca1E2B07` | The address the published VRF Debugger xite uses (`index.html`) |

Deploy your own copy to experiment on testnet.

### The precompile interface

| Method | Returns |
| --- | --- |
| `getBeacon(uint64 blockHeight)` | The beacon for one block, or zero if there is none |
| `latestBeacon()` | The most recent beacon and its block height |
| `getMultiBlockBeacon(uint64 endHeight, uint64 blocks)` | One value combined from 1 to 256 consecutive blocks ending at `endHeight` |

### The pattern it teaches

Randomness that is already public is useless for a game, because a player can look before choosing. `VRFCoinFlip` avoids that with a commit and a delayed reveal:

1. **Commit.** The player calls `commit(guessOver, threshold)` with a threshold from 1 to 99. The contract records the current block and sets the reveal block two blocks later.
2. **Wait.** The beacon for the reveal block does not exist yet when the player commits.
3. **Reveal.** Anyone calls `reveal(player)`. The contract reads the reveal block's beacon from the precompile and derives a number from 1 to 100 from the beacon, the player's address and the game number. A result equal to the threshold counts as a loss.

The chain stores a block's beacon at the end of that block, so a `reveal` included in the reveal block itself reverts with `beacon not available`; it succeeds from the following block on. The chain also prunes beacons older than its lookback window (256 blocks by default), after which `getBeacon` returns zero for that height. `VRFCoinFlip` has no way to cancel a game, so a game that is not revealed within that window stays active and blocks the player's next `commit`. Reveal promptly, or add a cancel path in your own contract.

Use the same shape for anything where a participant could profit from knowing the random value in advance: fix the choice first, and read a beacon from a block that had not been produced at that time.

A xite can also read beacons without a contract through the node, using the `vrf...` commands (see [Randomness beacon](epixframe.md#randomness-beacon-vrf)). The [VRF Debugger](https://github.com/EpixZone/vrf-debugger) xite is a page for exploring them, except for its derive panel, which passes a block height where `vrfDeriveRandom` expects a beacon value and so fails with `vrfDeriveRandom: beacon required`.

## contract_examples

Three token contracts built on OpenZeppelin, with Hardhat deployment scripts and tests. This is the oldest of the four repositories (May 2025) and the only one that uses Hardhat.

| Contract | Standard | Features |
| --- | --- | --- |
| `YogiToken` | ERC-20 | 18 decimals, capped supply of 1,000,000,000, 10% minted to the deployer, burnable, owner can mint |
| `YogiNFTCollection` | ERC-721 | Up to 1,000 tokens, enumerable, configurable base URI, paid public mint, owner withdrawal |
| `YogiMultiToken` | ERC-1155 | Fungible, semi-fungible and unique token types in one contract, batch mint and transfer |

| Path | Content |
| --- | --- |
| `contracts/tokens/` | The three contracts |
| `scripts/deploy_yogi_*.js` | One deployment script per contract |
| `scripts/update_*_uri.js` | Scripts that update token metadata URIs |
| `test/` | Hardhat tests for `YogiToken` and `YogiNFTCollection` (there is no test file for `YogiMultiToken`) |
| `metadata/` | Example token metadata and images |
| `hardhat.config.js` | Network definitions for testnet and mainnet |

Addresses published in its README, all on testnet (chain ID 1917):

| Contract | Address |
| --- | --- |
| `YogiToken` | `0xA84D7bfC3Be1b5B709d4a564933B4A6080D5b583` |
| `YogiNFTCollection` | `0x5434b91C0a104319B68e66399C1f4d53CEFc0Aa3` |
| `YogiMultiToken` | `0xE04461FD106aA44fB55980C97BAc3f07b9c1286d` |

!!! note "Check these points before you reuse this repository"
    - `hardhat.config.js` defines the mainnet network with chain ID `1915` and a comment saying the value is an assumption. Epix mainnet is chain ID `1916`. Correct it before deploying to mainnet.
    - The README says Epix does not support Solidity 0.8.20 and above, and the contracts are pinned to 0.8.18. The newer Foundry kits on this page are compiled with 0.8.24 and deployed, so treat the pin as a property of this repository.
    - The example token metadata points at files hosted on GitHub. A xite that displays token images should not depend on an external host; see [Vendoring](index.md#vendoring-ship-local-copies).

## Use a contract from a xite

A xite talks to a contract from the visitor's browser. There are two separate paths, and most pages need both:

- **Reading** needs no wallet. The page sends `eth_call` requests to an EVM JSON-RPC endpoint.
- **Writing** needs a wallet. The page asks the visitor's wallet to sign and send a transaction, and the visitor approves it in the wallet.

The official xites use [EpixFrame](epixframe.md) to find the RPC endpoint, [EpixKit](epixkit.md) to connect the wallet, and a vendored copy of ethers v6 to encode calls. The fragments below are taken from Epix Talk's tipping code and trimmed.

### 1. Describe the contract

You do not need a build step or a JSON ABI file. List the functions you call as human-readable signatures, copied from the interface file:

```js title="js/tipping.js"
var TIPPING_CONTRACT = "0xD0793a2a11Fa3600Ec941115937FB8E259cfdbf1";
var TIPPING_ABI = [
  "function tipByXid(bytes32 contentHash, string name, string tld) external payable",
  "function getTipperCount(bytes32 contentHash) external view returns (uint32)",
  "function getTipperCountBatch(bytes32[] contentHashes) external view returns (uint32[])",
  "event Tipped(bytes32 indexed contentHash, address indexed tipper, address indexed recipient, uint256 amount)"
];
```

### 2. Read without a wallet

Ask the node which endpoint to use, with a public fallback, and create a read-only contract object. Configure EpixKit at the same time, so that connecting later also switches the wallet to Epix mainnet (without a `chainId` in `EpixKit.init`, EpixKit leaves the wallet on whatever network it is using):

```js
var readContract = null;

async function initTipping() {
  var rpcUrl = (await epixFrame.chainEvmRpcUrl()) || "https://evmrpc.epix.zone";
  var readProvider = new ethers.JsonRpcProvider(rpcUrl);
  readContract = new ethers.Contract(TIPPING_CONTRACT, TIPPING_ABI, readProvider);

  EpixKit.init({
    chainId: "0x77C",
    chainName: "Epix",
    nativeCurrency: { name: "EPIX", symbol: "EPIX", decimals: 18 },
    rpcUrls: [rpcUrl]
  });
}
```

Compute content hashes in the page with the same formula the contract uses:

```js
function computeContentHash(xiteAddress, authorDirectory, postId) {
  var coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(
    coder.encode(["string", "string", "string"], [xiteAddress, authorDirectory, String(postId)])
  );
}
```

Load a whole page of counts with one request, not one per post:

```js
async function loadTipCounts(hashes) {
  var counts = await readContract.getTipperCountBatch(hashes);
  var result = [];
  for (var i = 0; i < counts.length; i++) {
    result.push(Number(counts[i]));
  }
  return result;
}
```

### 3. Write through the wallet

Connect on demand, wrap the wallet's provider, and send the transaction with a value:

```js
var wallet = { signer: null, contract: null };

async function setupWallet(result) {
  var provider = new ethers.BrowserProvider(result.provider);
  wallet.signer = await provider.getSigner();
  wallet.contract = new ethers.Contract(TIPPING_CONTRACT, TIPPING_ABI, wallet.signer);
}

async function sendTip(contentHash, xidName, xidTld, amountEpix) {
  if (!wallet.signer) {
    await setupWallet(await EpixKit.connect());
  }
  var tx = await wallet.contract.tipByXid(contentHash, xidName, xidTld, {
    value: ethers.parseEther(amountEpix)
  });
  await tx.wait();
  return tx.hash;
}
```

### 4. Report errors plainly

Wallet and RPC errors are verbose. Epix Talk reduces them to one line: a rejection in the wallet (error code `4001`, or `ACTION_REJECTED` from ethers) becomes "cancelled", a message that mentions insufficient funds becomes a note about balance and fees, and anything else shows the contract's revert reason or the first line of the message.

### What belongs where

- **In the xite:** the contract address, the function signatures you call, and vendored copies of the libraries. All of this is public.
- **Never in the xite:** a private key, a seed phrase or a deployer `.env` file. Everything in a xite is distributed to every visitor.
- **On chain:** value transfers and the facts that must be the same for everyone, such as who tipped what.
- **In xite files:** the content itself. The contract kits identify content by hash and never store it.

Requests to an RPC endpoint leave the EpixNet network and are made by the visitor's browser. They reveal the visitor's address queries to that endpoint, and they fail when the visitor is offline. Keep the rest of the page working when chain data is unavailable. See [Privacy and routing](../start/privacy.md).

## Build, test and deploy a kit

The three Foundry repositories share the same workflow. You need [Foundry](https://getfoundry.sh/) installed.

```sh
git clone --recurse-submodules https://github.com/EpixZone/epix-tipping.git
cd epix-tipping
forge build
forge test -vvv
```

To deploy your own copy, create a `.env` file with three values and run the deployment script:

```sh title=".env"
PRIVATE_KEY=0x_YOUR_PRIVATE_KEY_HERE
RPC_URL=https://evmrpc.testnet.epix.zone/
EXPLORER_URL=https://testscan.epix.zone/
```

```sh
source .env
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

The repositories differ slightly in the flags their READMEs use: epix-tipping adds `--legacy`, and vrf-contracts adds `--chain-id 1917`. epix-tipping and vrf-contracts include a `.env.example` to copy; epix-airdrop's README refers to one, but the file is not in the repository, so create `.env` by hand.

Then verify the source on the block explorer, so that others can read what you deployed:

```sh
./verify.sh <contract_address> EpixTipping
```

`verify.sh` builds the project, produces the standard JSON input and submits it to the block explorer named by `EXPLORER_URL`. Set that variable explicitly: the scripts do not all default to the same network.

!!! danger "Protect the deployer key"
    The `.env` file holds a private key. It is listed in each repository's `.gitignore`; keep it that way, use a key that holds only what the deployment needs, and never copy it into a xite folder.

### Testing against the precompiles

A local test chain has no xID or VRF precompile. The tipping and airdrop tests handle that by deploying a mock (`test/mocks/MockXID.sol`) and placing its code at the precompile address with Foundry's `vm.etch`. Copy that approach for your own tests.

The tipping and airdrop contracts also wrap every xID precompile call in `try`/`catch`, so that a missing precompile or an unknown name returns an empty answer instead of reverting the whole transaction. Keep that habit in your own contracts.

```solidity
function _tryReverseResolve(address addr) private view returns (string memory name, string memory tld) {
    try XID.reverseResolve(addr) returns (string memory n, string memory t) {
        return (n, t);
    } catch {
        return ("", "");
    }
}
```

## Next steps

- [Connect a wallet](../web3/wallet-connect.md) builds the wallet half of the flow.
- [Reading and writing contracts](../web3/contracts.md) walks through tipping, airdrop claims and randomness in full.
- [xID for developers](../web3/xid.md) covers the precompile and how the node verifies names.
