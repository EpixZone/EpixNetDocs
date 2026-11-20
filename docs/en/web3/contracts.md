---
description: Read and write Epix Chain contracts from a xite with ethers v6. Read-only providers with failover, transactions with simulation, status and readable errors, fees, and the tipping, airdrop and verifiable randomness patterns used by the official xites.
---

# Read and write contracts

This page shows how a xite talks to smart contracts on Epix Chain: how to read state without a wallet, how to send a transaction with clear status and error messages, and how the official xites implement tipping, airdrop claims and verifiable randomness. It is for xite authors who have already [connected a wallet](wallet-connect.md). The examples use [ethers](https://docs.ethers.org/v6/) version 6 and plain JavaScript, with no build step.

The code here builds on two things from the wallet tutorial: `loadNetwork()` from `js/chain.js`, and the `DemoWallet` object from `js/wallet.js`.

## Two providers, two jobs

| | Read-only provider | Wallet signer |
| --- | --- | --- |
| Created from | An EVM RPC URL | The wallet's raw provider |
| Needs a wallet | No | Yes |
| Use for | Balances, contract views, gas estimates, simulations, block numbers | Sending transactions |
| Prompts the user | Never | For every transaction |

Do all reads through your own read-only provider. The page then works for visitors without a wallet, shows the right network's data whatever the wallet is set to, and gets revert reasons straight from the RPC endpoint instead of through a wallet that may swallow them.

## Reading with failover

The node gives your page a list of EVM endpoints (`chain_evm_rpc_urls` in `serverInfo`), not just one. Only the browser can see an EVM request fail, so moving to the next endpoint is your page's job. This helper is the pattern the xID manager uses.

```js title="js/rpc.js"
// Read-only access to the chain, with failover across the configured
// EVM endpoints. Call Rpc.init(net) with the result of loadNetwork().
window.Rpc = {
  urls: [],
  chainId: 0,
  index: 0,          // the endpoint that answered last
  providers: {},

  init: function (net) {
    this.urls = net.evmRpcs;
    this.chainId = net.id;
    this.index = 0;
    this.providers = {};
  },

  // One provider per endpoint, bound to the expected chain so a dead first
  // endpoint cannot stall the page on an eth_chainId round trip.
  provider: function (i) {
    if (!this.providers[i]) {
      var request = new ethers.FetchRequest(this.urls[i]);
      request.timeout = 15000;
      this.providers[i] = new ethers.JsonRpcProvider(
        request,
        { chainId: this.chainId, name: "epix" },
        { staticNetwork: true }
      );
    }
    return this.providers[i];
  },

  isNetworkError: function (err) {
    var code = err && err.code;
    return code === "NETWORK_ERROR" || code === "TIMEOUT" ||
      code === "SERVER_ERROR" || (err instanceof TypeError);
  },

  // Run fn(provider) against each endpoint in turn. Only network failures
  // move on to the next endpoint. A revert is an answer and is thrown as is.
  read: async function (fn) {
    var lastErr = null, start = this.index;
    for (var n = 0; n < this.urls.length; n++) {
      var i = (start + n) % this.urls.length;
      try {
        var result = await fn(this.provider(i));
        this.index = i;
        return result;
      } catch (err) {
        if (!this.isNetworkError(err)) throw err;
        lastErr = err;
      }
    }
    throw lastErr || new Error("No RPC endpoint reachable");
  }
};
```

Load it before `js/wallet.js`, and add `js/tx.js` (from [Sending a transaction](#sending-a-transaction)) after it:

```html title="index.html (script order)"
<script src="js/lib/epixframe.min.js"></script>
<script src="js/lib/epixkit.js"></script>
<script src="js/lib/ethers.umd.min.js"></script>
<script src="js/chain.js"></script>
<script src="js/rpc.js"></script>
<script src="js/wallet.js"></script>
<script src="js/tx.js"></script>
```

Initialize it in `start()` in `js/wallet.js`, right after the network is resolved:

```js title="js/wallet.js (inside start)"
net = await loadNetwork(NETWORK);
Rpc.init(net);
```

!!! note "Keep the ajax_key away from external endpoints"
    EpixFrame's `monkeyPatchAjax()` adds your xite's `ajax_key` to `XMLHttpRequest` URLs so the page can read its own files from an opaque origin (see [Fetching your own files](../build/sandbox.md#fetching-your-own-files)). The patch does not look at where a request is going. In a xite that also talks to RPC or REST endpoints, prefer `fileGet` for your own files over patching, so that key never travels to a third party.

A read then looks like this:

```js
var ABI = ["function getTipperCount(bytes32 contentHash) view returns (uint32)"];

var count = await Rpc.read(function (provider) {
  var contract = new ethers.Contract(TIPPING_ADDRESS, ABI, provider);
  return contract.getTipperCount(hash);
});
```

### ABIs

ethers accepts human-readable ABI fragments, which is what the official xites ship. List only the functions and events you call. A fragment is a string copied from the Solidity signature:

```js
var ABI = [
  "function tipByXid(bytes32 contentHash, string name, string tld) external payable",
  "function getTipperCountBatch(bytes32[] contentHashes) external view returns (uint32[])",
  "event Tipped(bytes32 indexed contentHash, address indexed tipper, address indexed recipient, uint256 amount)"
];
```

For a large contract you can ship the compiler's JSON ABI as a file in your xite instead. Either way the ABI is part of your signed files, so it loads offline.

### Values you get back

- Every integer comes back as a `bigint` in ethers 6, including small types such as `uint8` and `uint32`. Convert with `Number(value)` only when the value is small, such as a count or a timestamp.
- Amounts are in `aepix`. Use `ethers.formatEther(value)` for display and `ethers.parseEther("1.5")` for input. Never do arithmetic on the formatted string.
- Structs come back as objects you can read by field name (`info.totalAmount`) or by index.
- Addresses come back checksummed. Compare addresses after `ethers.getAddress()` or in lowercase.

### Keep reads cheap

Every read is a network request to an endpoint someone else operates. Batch where the contract allows it: the tipping contract's `getTipperCountBatch` loads the badge for every post on a page in one call instead of one call per post. When you write your own contract, add batch views for whatever a page lists.

## Sending a transaction

A transaction goes through four stages, and the user should always know which one they are in.

| Stage | What happens | What to show |
| --- | --- | --- |
| Simulating | Your page runs the call against the RPC endpoint with `eth_call` | "Checking..." |
| Wallet | The wallet shows its approval prompt | "Confirm in your wallet" |
| Confirming | The transaction was broadcast and has a hash | The hash, as a link to the explorer |
| Done | The receipt arrived with status `1` | The result, then refreshed data |

The helper below implements those stages. It simulates first, so a call that would revert shows its reason without the wallet ever opening.

```js title="js/tx.js"
// Send one contract call through the connected wallet.
//
//   sendContractTx({
//     address, abi, method, args,      // what to call
//     value,                           // optional bigint, in aepix
//     onStatus(stage, hash)            // "simulating" | "wallet" | "confirming" | "done"
//   })
//
// Resolves with the receipt. Rejects with the original error; pass it to
// txErrorMessage() to get text for the user.
window.sendContractTx = async function (opts) {
  var notify = opts.onStatus || function () {};
  var args = opts.args || [];
  var value = opts.value || 0n;
  var from = DemoWallet.address;
  if (!from) throw new Error("Connect your wallet first");

  // 1. Simulate against the RPC endpoint.
  notify("simulating");
  var data = new ethers.Interface(opts.abi).encodeFunctionData(opts.method, args);
  await Rpc.read(function (provider) {
    return provider.call({ from: from, to: opts.address, data: data, value: value });
  });

  // 2. Ask the wallet. The account must still be the one that was simulated.
  var signer = await DemoWallet.signer();
  if (DemoWallet.address !== from) {
    throw new Error("Your wallet changed. Review the details and try again.");
  }
  notify("wallet");
  var contract = new ethers.Contract(opts.address, opts.abi, signer);
  var overrides = value > 0n ? { value: value } : {};
  var tx = await contract[opts.method].apply(contract, args.concat([overrides]));

  // 3. Wait for the receipt.
  notify("confirming", tx.hash);
  var receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error("Transaction failed");

  notify("done", tx.hash);
  return receipt;
};

// Text for the user from an ethers or wallet error.
window.txErrorMessage = function (err) {
  if (!err || typeof err !== "object") return "Transaction failed";
  var rpcError = (err.info && err.info.error) || err.error;
  if (err.code === "ACTION_REJECTED" || err.code === 4001 ||
      (rpcError && rpcError.code === 4001)) {
    return "You cancelled the request. Nothing was sent.";
  }
  // Prefer the decoded revert reason, then the RPC message, then ethers'
  // short message. ethers appends a long request dump to err.message.
  var candidates = [err.reason, rpcError && rpcError.message, err.shortMessage, err.message];
  var message = candidates.find(function (v) { return typeof v === "string" && v.trim(); });
  if (!message) return "Transaction failed";
  if (/insufficient (?:funds|balance)/i.test(message)) {
    return "Not enough EPIX to cover the amount and the network fee.";
  }
  message = message.split(/\r?\n/)[0]
    .split(/\s+\((?:action|argument|error|transaction|payload|code)=/)[0].trim();
  return message.slice(0, 240) || "Transaction failed";
};
```

Using it:

```js
var statusEl = document.getElementById("status");
var linkEl = document.getElementById("tx-link");

try {
  await sendContractTx({
    address: AIRDROP_ADDRESS,
    abi: AIRDROP_ABI,
    method: "claim",
    onStatus: function (stage, hash) {
      statusEl.textContent = stage;
      if (hash) linkEl.href = DemoWallet.network.explorer + "/tx/" + hash;
    }
  });
} catch (err) {
  statusEl.textContent = txErrorMessage(err);
}
```

### Why simulate first

- **The reason is readable.** Wallets forward `eth_call` and can drop the revert data. A direct call to the RPC endpoint returns the contract's `require` message, which ethers exposes as `err.reason`.
- **The user is not asked to approve something that will fail.** A failed simulation never reaches the wallet.
- **It costs nothing.** `eth_call` is free and changes no state.

Simulation is a check against the state at that moment. State can change before the transaction is included, so a transaction can still fail after a clean simulation. Always check `receipt.status`.

### Guard against a wallet change

Between the simulation and the wallet prompt the user can switch account or network. `DemoWallet.signer()` refuses on the wrong network, and `sendContractTx` compares the account before it asks. The xID manager goes one step further and passes `from` and `chainId` in the transaction overrides, so a last-moment switch cannot reroute a request the user reviewed for another account.

### Gas and fees

Let the wallet set the fee. Wallets know their own fee logic and show it in the approval prompt. Do not hardcode `gasPrice` or `gasLimit`.

If you want to show an estimate before the prompt, compute it from the read-only provider and label it as an estimate:

```js
// An upper bound for the network fee of one call, in aepix.
async function estimateNetworkFee(address, abi, method, args, from, value) {
  var data = new ethers.Interface(abi).encodeFunctionData(method, args || []);
  return Rpc.read(async function (provider) {
    var results = await Promise.all([
      provider.estimateGas({ from: from, to: address, data: data, value: value || 0n }),
      provider.getFeeData()
    ]);
    var gas = results[0], fees = results[1] || {};
    var price = fees.maxFeePerGas == null ? fees.gasPrice : fees.maxFeePerGas;
    if (typeof gas !== "bigint" || typeof price !== "bigint") {
      throw new Error("The network fee estimate is unavailable.");
    }
    return gas * price;
  });
}
```

Fees are paid in EPIX from the sending account. When a call also transfers value, the account needs the value plus the fee. Check `balance >= value + fee` with `bigint` arithmetic before asking the wallet, and say which part is missing.

### Confirmations and explorer links

`tx.wait()` resolves when the transaction has been included in a block, which is what the official xites wait for. After that, read the new state from the chain instead of assuming the outcome, and refresh whatever the page shows.

Link the hash to the block explorer so the user can check it independently: `<explorer>/tx/<hash>`. The explorer base URL comes from `chain_block_explorer_url` in `serverInfo` (already resolved into `net.explorer` by `loadNetwork()`).

??? tip "Linking to the in-network explorer instead"
    A wallet returns an EVM transaction hash (`0x...`). The EVM block explorer accepts that directly. The Epix Explorer xite shows Cosmos transaction hashes, and every EVM transaction is wrapped in a Cosmos transaction with a different hash. The xID manager maps one to the other through the Cosmos REST API, so its links can stay inside EpixNet:

    ```js
    // The Cosmos transaction that wraps an EVM transaction, or null when the
    // chain has not indexed it yet. restBase is chain_rpc_url from serverInfo.
    async function cosmosTxHash(restBase, evmHash) {
      var query = encodeURIComponent("ethereum_tx.ethereumTxHash='" + evmHash + "'");
      var res = await fetch(restBase + "/cosmos/tx/v1beta1/txs?query=" + query + "&pagination.limit=1");
      if (!res.ok) return null;
      var rows = (await res.json()).tx_responses || [];
      return rows.length && rows[0].txhash ? String(rows[0].txhash) : null;
    }
    ```

### Events

Reading events is fine for history. Live subscriptions through a wallet's provider are less dependable: Epix Dice probes `eth_newFilter` before it attaches listeners and skips them when the provider rejects the call. Polling on a timer works with every wallet. The VRF Debugger polls the block number every three seconds while it waits for a reveal block.

## Pattern: tipping content

The [epix-tipping](https://github.com/EpixZone/epix-tipping) contract lets anyone tip a piece of content with native EPIX. Epix Talk uses it for the tip button on topics and comments.

| | |
| --- | --- |
| Mainnet | `0xD0793a2a11Fa3600Ec941115937FB8E259cfdbf1` |
| Testnet | `0x22c5622378fb8E9AB52EA0b00cAce94474829df3` |

How the contract behaves:

- **Content is identified by a hash**, not by an on-chain record you create first. The hash is `keccak256(abi.encode(xiteAddress, authorDirectory, postId))`, three strings.
- **The first tip binds the recipient.** The first tip to a content hash stores the recipient as that content's creator. Later tips must name the same recipient, or pass the zero address to use the stored one.
- **The whole tip goes to the creator.** The contract forwards the full value in the same transaction and keeps nothing.
- **Statistics are kept on chain for the UI**: the total, the number of unique tippers, the top three tippers and the three most recent tips, each with the tipper's xID name when they have one.
- **`tipByXid` resolves the recipient on chain** through the [xID precompile](xid.md#the-xid-precompile), so your page does not need the author's wallet address at all.

```js title="js/tipping.js"
var TIPPING = {
  address: "0x22c5622378fb8E9AB52EA0b00cAce94474829df3",   // testnet
  abi: [
    "function tip(bytes32 contentHash, address recipient) external payable",
    "function tipByXid(bytes32 contentHash, string name, string tld) external payable",
    "function getContentInfo(bytes32 contentHash) external view returns (tuple(address creator, uint256 totalAmount, uint32 uniqueTippers, uint8 topCount, uint8 recentCount, tuple(address tipper, uint96 amount, string xidName)[3] top3, tuple(address tipper, uint256 amount, uint64 timestamp, string xidName)[3] last3))",
    "function getTipperCount(bytes32 contentHash) external view returns (uint32)",
    "function getTipperCountBatch(bytes32[] contentHashes) external view returns (uint32[])",
    "event Tipped(bytes32 indexed contentHash, address indexed tipper, address indexed recipient, uint256 amount)"
  ]
};

function tippingContract(provider) {
  return new ethers.Contract(TIPPING.address, TIPPING.abi, provider);
}

// The id of one piece of content. xiteAddress is your xite's own address,
// authorDirectory is the author's user directory (their xID, "alice.epix"),
// postId is your own id for the post.
function contentHash(xiteAddress, authorDirectory, postId) {
  var coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(
    coder.encode(["string", "string", "string"], [xiteAddress, authorDirectory, String(postId)])
  );
}

// Tip counts for every post on the page, in one request.
async function loadTipCounts(hashes) {
  if (!hashes.length) return [];
  var counts = await Rpc.read(function (provider) {
    return tippingContract(provider).getTipperCountBatch(hashes);
  });
  return counts.map(Number);
}

// Full statistics for one post, for a tip dialog.
async function loadTipInfo(hash) {
  var info = await Rpc.read(function (provider) {
    return tippingContract(provider).getContentInfo(hash);
  });
  var top = [];
  for (var i = 0; i < Number(info.topCount); i++) {
    top.push({
      tipper: info.top3[i].tipper,
      name: info.top3[i].xidName,                 // "" when the tipper has no xID
      epix: ethers.formatEther(info.top3[i].amount)
    });
  }
  return {
    totalEpix: ethers.formatEther(info.totalAmount),
    uniqueTippers: Number(info.uniqueTippers),
    top: top
  };
}

// Tip the author of a post. amountEpix is a decimal string such as "2.5".
function sendTip(hash, authorDirectory, amountEpix, onStatus) {
  var parts = authorDirectory.split(".");         // "alice.epix" -> "alice", "epix"
  return sendContractTx({
    address: TIPPING.address,
    abi: TIPPING.abi,
    method: "tipByXid",
    args: [hash, parts[0], parts[1] || "epix"],
    value: ethers.parseEther(amountEpix),
    onStatus: onStatus
  });
}
```

Epix Talk builds its hashes the same way: the topic hash uses the topic's id, and a comment hash uses `"comment_" + comment_id` as the post id, both under the author's directory.

Things to get right:

- **Always name the recipient.** Because the first tip binds the creator, anyone can make the first tip to a content hash and name any address. If your page sent later tips with the zero address, they would go to whatever was stored. Passing the real recipient (or using `tipByXid`) makes a tip to a hijacked hash revert with `Recipient mismatch` instead of paying the wrong account.
- **A transferred name changes the answer.** `tipByXid` resolves the name's current owner. If a name changes owner after a post received its first tip, later `tipByXid` calls for that post revert with `Recipient mismatch`, because the stored creator is the earlier owner.
- **Validate the amount before the wallet opens.** The contract rejects a zero tip with `Tip must be > 0`.
- **Refresh from the chain.** After the receipt, reload the count and the statistics instead of adding one locally.
- **Tipper names are cached.** The contract stores a tipper's xID name the first time they tip. A tipper whose name changed can call `refreshXidName()` to update it.

Contract errors you can map to friendlier text: `Tip must be > 0`, `Recipient required on first tip`, `Recipient mismatch`, `xID: name not found`, `Transfer failed`.

## Pattern: airdrop claims

The [epix-airdrop](https://github.com/EpixZone/epix-airdrop) contract is a shared pool that anyone can fund and each address can claim from once. The Epix Airdrop xite is its front end.

| | |
| --- | --- |
| Mainnet | `0x3BDB4DB4B960b5679f22AA5122A31a4E9f38A86E` |
| Testnet | `0xCa9aDc8736d5fb1743939cA745824fB8fBd97793` |

The rules, all enforced by the contract:

| Parameter | Value |
| --- | --- |
| Base claim | 0.1% of the pool balance at claim time |
| With an xID | 10 times the base rate (1% of the pool) |
| Maximum claim | 1,000 EPIX, or 10,000 EPIX with an xID |
| Minimum claim | 1 EPIX. Below that the claim reverts with `Pool exhausted`. |
| Claims per address | One. A second attempt reverts with `Already claimed`. |
| Funding | A plain EPIX transfer to the contract address |

The xID boost is decided on chain: the contract asks the xID precompile whether the claiming address has a name. Your page cannot grant or fake it.

```js title="js/airdrop.js"
var AIRDROP = {
  address: "0xCa9aDc8736d5fb1743939cA745824fB8fBd97793",   // testnet
  abi: [
    "function claim() external",
    "function getPoolInfo() external view returns (tuple(uint256 balance, uint256 totalClaimed, uint32 totalClaimers, uint256 claimRateBps, uint256 maxClaim, uint256 maxClaimXid, uint256 minClaim, uint256 xidMultiplier))",
    "function estimateClaim(address claimer) external view returns (uint256 amount, bool xidBoosted)",
    "function getClaimerInfo(address claimer) external view returns (tuple(uint256 amountClaimed, uint64 claimTime, bool claimed, bool hasXid, string xidName))",
    "function getRecentClaims() external view returns (tuple(address claimer, uint256 amount, uint64 timestamp, bool xidBoosted, string xidName)[])",
    "event Claimed(address indexed claimer, uint256 amount, bool xidBoosted)",
    "event Funded(address indexed funder, uint256 amount)"
  ]
};

function airdropContract(provider) {
  return new ethers.Contract(AIRDROP.address, AIRDROP.abi, provider);
}

// What the connected account can do right now.
async function loadClaimState(address) {
  var info = await Rpc.read(function (p) { return airdropContract(p).getClaimerInfo(address); });
  if (info.claimed) {
    return {
      claimed: true,
      epix: ethers.formatEther(info.amountClaimed),
      xidName: info.hasXid ? info.xidName : ""
    };
  }
  var estimate = await Rpc.read(function (p) { return airdropContract(p).estimateClaim(address); });
  return {
    claimed: false,
    epix: ethers.formatEther(estimate.amount),     // "0.0" when the pool is exhausted
    xidBoosted: estimate.xidBoosted
  };
}

function claimAirdrop(onStatus) {
  return sendContractTx({
    address: AIRDROP.address,
    abi: AIRDROP.abi,
    method: "claim",
    onStatus: onStatus
  });
}

// Funding the pool is a plain transfer, not a contract call.
async function fundPool(amountEpix) {
  var signer = await DemoWallet.signer();
  var tx = await signer.sendTransaction({
    to: AIRDROP.address,
    value: ethers.parseEther(amountEpix)
  });
  await tx.wait();
  return tx.hash;
}
```

The page flow in the Airdrop xite is worth copying:

1. Before any wallet is connected, show the pool balance, total claimed and recent claims from the read-only provider.
2. On connect, call `getClaimerInfo`. If the account already claimed, show what it received and stop.
3. Otherwise call `estimateClaim` and show the amount. If `xidBoosted` is false, tell the user that registering an xID raises the claim, and link to the [xID manager](../start/xid.md).
4. On claim, show each transaction stage, then reload the pool and the claimer state from the chain.

!!! note "One claim per address is not one claim per person"
    Anyone can create more addresses. The contract's limits bound what a single address can take, and the pool shrinks by a percentage with every claim, but a contract like this does not identify people. Do not use it where that matters.

## Verifiable randomness

Epix Chain produces a random beacon in every block. A beacon is a 32-byte value that anyone can read and that is fixed once its block is produced. Applications turn it into dice rolls, shuffles or winners.

### How the beacon is made

At the end of every block the chain computes:

```text
beacon[N] = SHA256(beacon[N-1] || blockHash[N] || proposer[N] || blockTime[N] || dataHash[N])
```

`dataHash` is the Merkle root of the block's transactions, so the beacon depends on every transaction in the block. Three properties follow from this construction:

- **It is public and reproducible.** Anyone can read a beacon and recompute what an application derived from it.
- **It is stored at the end of its block.** The beacon for block N can be read from block N+1 onward, not from inside block N.
- **Old beacons are pruned.** The chain keeps a lookback window of recent beacons. The module's default window is 256 blocks. A beacon outside the window reads as zero.

!!! warning "Know what this randomness is"
    The beacon is a hash of public block data, not the output of a secret key that nobody controls. The proposer of a block decides what goes into that block and therefore has some influence over that block's beacon. Never derive an outcome from a beacon that already exists when the user commits. For anything valuable, commit first and use a beacon from a later block, and consider the multi-block beacon, which mixes several consecutive blocks so that more than one proposer contributes.

### Three ways to read a beacon

| From | How | Wallet needed |
| --- | --- | --- |
| A page, through the node | `vrfLatestBeacon`, `vrfGetBeacon`, `vrfMultiBlockBeacon` | No |
| A page, through EVM RPC | Call the VRF precompile with a read-only provider | No |
| A contract | Call the VRF precompile from Solidity | The user's transaction |

#### Through the node

The node fetches beacons from the configured chain REST endpoints and returns them to the page. It does not check them against validator signatures, and `vrfLatestBeacon` does not wait for finality: it reads the chain's latest height and returns the beacon stored for the block before it. Treat these answers as coming from the endpoint, and for anything valuable have a contract read the beacon from the precompile instead. These commands need no permission.

| Command | Parameters | Result |
| --- | --- | --- |
| `vrfLatestBeacon` | none | `{ height, beacon, proposer, timestamp }` for the block before the chain's latest height |
| `vrfGetBeacon` | `[height]` | The same shape for one block |
| `vrfMultiBlockBeacon` | `[end_height, blocks]` | `{ beacon }`, the SHA-256 of `blocks` consecutive beacons ending at `end_height`. `blocks` is 1 to 256. |
| `vrfDeriveRandom` | `[beacon, seed, count]` | An array of `count` hex strings derived from a beacon you pass in. No network call. |

Here `beacon` is a 64 character hex string without a `0x` prefix. On failure a command returns an object with an `error` field. In EpixFrame's promise style that surfaces as a rejection, so use `try` and `catch`.

```js title="Read the latest beacon and derive three values"
try {
  var latest = await epixFrame.cmd("vrfLatestBeacon", []);
  // { height: 123456, beacon: "9f2c...", proposer: "epixvalcons1...", timestamp: 1790000000 }

  var values = await epixFrame.cmd("vrfDeriveRandom", [latest.beacon, "my-raffle-2026", 3]);
  // ["...64 hex chars...", "...", "..."]
} catch (err) {
  console.log("Beacon unavailable:", err && err.error);
}
```

The derivation is fixed and easy to reproduce, so nobody has to trust the node for it:

```text
value[i] = SHA256(beacon_hex || seed || decimal(i))
```

The beacon is hashed as its hex text, not as decoded bytes, and the index as its decimal digits. In a page:

```js
function deriveRandom(beaconHex, seed, i) {
  return ethers.sha256(ethers.toUtf8Bytes(beaconHex + seed + String(i))).slice(2);
}
```

To turn a value into a number in a range, use `bigint` arithmetic on the whole value:

```js
function toRange(valueHex, min, max) {
  var span = BigInt(max - min + 1);
  return min + Number(BigInt("0x" + valueHex) % span);
}
```

#### Through the VRF precompile

The precompile lives at `0x0000000000000000000000000000000000000901` and is read-only.

```js title="Read the VRF precompile from a page"
var VRF = {
  address: "0x0000000000000000000000000000000000000901",
  abi: [
    "function getBeacon(uint64 blockHeight) view returns (bytes32 beacon)",
    "function latestBeacon() view returns (bytes32 beacon, uint64 blockHeight)",
    "function getMultiBlockBeacon(uint64 endHeight, uint64 blocks) view returns (bytes32 beacon)"
  ]
};

var latest = await Rpc.read(function (provider) {
  return new ethers.Contract(VRF.address, VRF.abi, provider).latestBeacon();
});
// latest.beacon is "0x..." (bytes32), latest.blockHeight is a bigint
```

`getBeacon` returns 32 zero bytes when the beacon does not exist, either because the block has not ended yet or because it is older than the lookback window. Treat zero as "not available", never as a random value.

In Solidity, copy `IVRF.sol` from [vrf-contracts](https://github.com/EpixZone/vrf-contracts):

```solidity title="IVRF.sol"
address constant IVRF_PRECOMPILE_ADDRESS = 0x0000000000000000000000000000000000000901;
IVRF constant IVRF_CONTRACT = IVRF(IVRF_PRECOMPILE_ADDRESS);

interface IVRF {
    /// The beacon at a block height (zero if not found).
    function getBeacon(uint64 blockHeight) external view returns (bytes32 beacon);

    /// The most recent beacon and its block height.
    function latestBeacon() external view returns (bytes32 beacon, uint64 blockHeight);

    /// SHA-256 of N consecutive beacons ending at endHeight (1 to 256 blocks).
    function getMultiBlockBeacon(uint64 endHeight, uint64 blocks) external view returns (bytes32 beacon);
}
```

### Commit and reveal

The safe way to use a beacon is to fix the question before the answer exists.

1. **Commit.** The user's transaction records their choice and a future block height, the reveal block.
2. **Wait.** The chain produces the reveal block. Its beacon did not exist when the user committed.
3. **Reveal.** A second transaction reads the beacon for the reveal block and settles the outcome.

`VRFCoinFlip` in vrf-contracts is a minimal example, an over or under guess on a number from 1 to 100. Its core is short:

```solidity title="VRFCoinFlip.sol (excerpt)"
function commit(bool guessOver, uint64 threshold) external {
    require(threshold >= 1 && threshold <= 99, "threshold must be 1-99");
    require(!_games[msg.sender].active, "game already active");
    uint64 commitBlock = uint64(block.number);
    uint64 revealBlock = commitBlock + 2;
    // ... store the game ...
}

function reveal(address player) external {
    Game memory game = _games[player];
    require(game.active, "no active game");
    require(block.number >= game.revealBlock, "too early");

    bytes32 beacon = IVRF_CONTRACT.getBeacon(game.revealBlock);
    require(beacon != bytes32(0), "beacon not available");

    // Derive result: 1-100
    uint256 raw = uint256(keccak256(abi.encodePacked(beacon, player, game.gameId)));
    uint64 result = uint64(1 + (raw % 100));
    // ... settle and store the result ...
}
```

The beacon is hashed together with the player address and the game id, so two players who commit in the same block do not share a result. The contract is deployed on mainnet at `0x9dA2082E0486A642864a7065dbcb0A9fca1E2B07`, and the VRF Debugger xite plays it. From a page:

```js title="js/coinflip.js"
var FLIP = {
  address: "0x9dA2082E0486A642864a7065dbcb0A9fca1E2B07",   // mainnet
  abi: [
    "function commit(bool guessOver, uint64 threshold)",
    "function reveal(address player)",
    "function gameCount(address player) view returns (uint256)",
    "function getGame(address player) view returns (tuple(bool active, bool guessOver, uint64 threshold, uint64 commitBlock, uint64 revealBlock, uint256 gameId))",
    "function getGameResult(address player, uint256 gameId) view returns (tuple(bool guessOver, uint64 threshold, uint64 result, bool won, bytes32 beacon, uint64 revealBlock))"
  ]
};

function flipContract(provider) {
  return new ethers.Contract(FLIP.address, FLIP.abi, provider);
}

// Resolve once the chain has reached a block height. Polls every 3 seconds.
function waitForBlock(target) {
  return new Promise(function (resolve) {
    var timer = setInterval(async function () {
      try {
        var current = await Rpc.read(function (p) { return p.getBlockNumber(); });
        if (current >= target) { clearInterval(timer); resolve(current); }
      } catch (err) { /* endpoint trouble: keep polling */ }
    }, 3000);
  });
}

async function playOverUnder(guessOver, threshold, onStatus) {
  var player = DemoWallet.address;

  // 1. Commit. The contract fixes the reveal block.
  await sendContractTx({
    address: FLIP.address, abi: FLIP.abi,
    method: "commit", args: [guessOver, threshold], onStatus: onStatus
  });

  // 2. Read the game back and wait until the reveal block exists. The chain
  //    stores that block's beacon at its end, so the reveal must land later.
  var game = await Rpc.read(function (p) { return flipContract(p).getGame(player); });
  await waitForBlock(Number(game.revealBlock));

  // 3. Reveal, then read the stored result.
  await sendContractTx({
    address: FLIP.address, abi: FLIP.abi,
    method: "reveal", args: [player], onStatus: onStatus
  });
  var count = await Rpc.read(function (p) { return flipContract(p).gameCount(player); });
  var result = await Rpc.read(function (p) { return flipContract(p).getGameResult(player, count); });

  return { roll: Number(result.result), won: result.won, beacon: result.beacon };
}
```

On page load, call `getGame` for the connected account first. If a game is already active, resume at step 2 instead of committing again: a reload in the middle of a game must not strand it.

### Design rules for randomness

The Epix Dice xite puts real value behind the same mechanism, and its contract documents the lessons:

- **The outcome is computable off chain as soon as the reveal block exists.** A player can work out the result before sending the reveal. If skipping the reveal were free, a player would reveal only wins. Epix Dice treats a bet that is never revealed as lost, so there is no reason to skip. `VRFCoinFlip` lets anyone call `reveal(player)`, so a third party can settle a game the player abandons.
- **Tie the expiry to the lookback window.** Once the reveal block's beacon is pruned, the game can no longer be settled from it. Epix Dice uses an expiry of 256 blocks, the same as the beacon window, and handles expired games explicitly.
- **Read parameters from the contract.** Epix Dice reads its commit delay (`blocksToWait`) and minimum bet from the contract instead of hardcoding them in the page, so the page cannot drift from the rules.
- **Mix in what makes each draw unique.** Both contracts hash the beacon together with the player address and a per-player game id.
- **Do not present a modulo result as perfectly uniform.** `raw % 100` over a 256-bit value has a negligible bias. `parseInt` on eight hex characters modulo a large range does not. Use the whole value.

A commitment that exists only in the page proves nothing to anyone else. When other people must be able to check that a draw was fixed in advance, record the commitment on chain.

## Combining chain actions with signed xite content

The strongest xites use each system for what it is good at. Content lives in signed files replicated by peers. Value and ownership live on chain. A small identifier connects them.

| Need | Keep it in | Why |
| --- | --- | --- |
| Posts, comments, media, profiles shown in lists | The xite, as [user content](../build/user-content.md) | Free to write, large, editable, available offline once replicated |
| Payments, balances, ownership, anything two parties could dispute | A contract | One ordered record everyone agrees on |
| Who someone is | [xID](xid.md) | The same name identifies the author directory in the xite and the account on chain |
| The link between a post and its on-chain record | A hash derived from stable ids | No on-chain write is needed to create a post |

Practical rules:

- **Derive identifiers, do not store them twice.** The tipping contract's content hash is computed from the xite address, the author's directory and the post id. Nothing has to be registered on chain when a post is created, and any peer can recompute the hash.
- **Use ids that never change.** If a post id changes on edit, its tips are orphaned. If your xite is cloned to a new address, the clone's hashes differ, which is usually what you want.
- **Treat xite data as claims and chain data as facts.** A JSON row that says "paid" is something its author wrote. If a page shows that a payment happened, read it from the chain at render time, as Epix Talk does for tip counts.
- **Never gate value on client-side checks.** A check in your JavaScript can be removed by anyone who runs a modified copy of the page. Rules that protect value belong in the contract. Rules that protect content belong in the xite's [permission rules](../build/user-content.md), which every node enforces.
- **Do not put secrets or personal data on chain.** Chain data is public and permanent. Put content in the xite, where its author can still edit or remove it.
- **Order the two writes deliberately.** When an action needs both a transaction and a content write, decide what the user sees if only one succeeds. Usually the chain transaction goes first, the content write second, and the page tolerates content that has no matching chain record yet.
- **Two keys sign two things.** The wallet signs the transaction. The node's identity key signs the content. A visitor can have one without the other, so check each one separately and ask for it only when it is needed.

## Deploying your own contract

The official kits are [Foundry](https://getfoundry.sh/) projects written for Solidity 0.8.24 (`pragma solidity ^0.8.24`). They share the same layout and commands:

```sh
forge build          # compile
forge test -vvv      # run the tests

cp .env.example .env # then set PRIVATE_KEY, RPC_URL and EXPLORER_URL
source .env          # puts RPC_URL in your shell for the next command
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
./verify.sh <contract_address> <ContractName>   # verify the source on Blockscout
```

The tipping kit's README adds `--legacy` to the deploy command, and the VRF kit's adds `--chain-id 1917` for testnet. The airdrop repository does not ship a `.env.example`, so create its `.env` with the same three variables. The tipping kit names both networks in `foundry.toml`:

```toml title="foundry.toml"
[rpc_endpoints]
epix_testnet = "https://evmrpc.testnet.epix.zone"
epix_mainnet = "https://evmrpc.epix.zone"
```

Deploy to testnet first, verify the source on the explorer, and exercise the contract from your xite before you deploy to mainnet.

!!! danger "Keep deployment keys out of your xite"
    Every file in a xite folder that is listed in `content.json` is signed and replicated to every visitor. Keep the contract project, and above all its `.env` file, outside the xite folder. Ship only what the page needs: the address and the ABI.

The kits, their tests and the example ERC-20, ERC-721 and ERC-1155 contracts are described in [Smart contract kits](../libraries/contracts.md).

## Checklist

- [ ] Reads go through a read-only provider, with failover across `chain_evm_rpc_urls`.
- [ ] Every write is simulated first and shows its stage: checking, wallet, confirming, done.
- [ ] A user rejection is not shown as an error.
- [ ] Revert reasons are shown in plain language, and `receipt.status` is checked.
- [ ] Amounts stay `bigint` until they are displayed.
- [ ] After every transaction the page reloads state from the chain.
- [ ] Contract addresses and ABIs sit next to the network preset they belong to.
- [ ] Randomness is taken from a block that did not exist when the user committed.
- [ ] Nothing of value depends on a check that only exists in the page.

## Related pages

- [Epix Chain for xite developers](index.md)
- [Connect a wallet](wallet-connect.md)
- [xID for developers](xid.md)
- [Smart contract kits](../libraries/contracts.md)
- [User content](../build/user-content.md)
- [Featured xites](../start/apps.md)
