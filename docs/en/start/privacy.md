---
description: What EpixNet's Tor, I2P, local discovery, and mesh settings really do, what peers and services can see, and where the limits are.
---

# Privacy and routing

This page explains how your node and browser connect to the rest of the network, what each routing option changes, and what other parties can still observe. It is for anyone deciding how to configure EpixNet, especially people who need more than the defaults.

!!! warning "No setting here guarantees anonymity"
    EpixNet supports Tor and I2P, and both reduce what other parties learn about you. Neither makes you anonymous by itself. Direct peers and services can see your IP address, destinations may record requests, and what you publish is public. Read the limits on this page before you rely on any route.

## Three things that connect

Privacy on EpixNet is easier to reason about when you keep three sources of traffic apart. Each has its own controls.

| Source | What it does | Where you control it |
| --- | --- | --- |
| **The node** | Finds peers, downloads and shares xites (websites published on EpixNet), talks to trackers, and looks up `.epix` names on Epix Chain. | **Network** on the [Config page](dashboard.md#the-config-page) |
| **The browser** | Loads pages. A xite's page can also load content from ordinary web servers. | The wallet's routing switch in [EpixNet Browser](browser-wallet.md), or your own browser's settings |
| **The wallet** | Sends transactions and queries to Epix Chain endpoints. | The wallet itself |

The most common mistake is to change one and assume the others follow. Setting the node to route everything through Tor does not change how a system browser fetches an image that a page embeds from an ordinary website.

## What is public by design

Some information is public on EpixNet whatever route you use.

- **What you publish.** Posts, comments, votes, and profile data you write on a xite are signed with your identity for that xite and copied to every peer that holds the xite. Anyone can read them and they are hard to retract once others have a copy.
- **Your xID.** A `.epix` name, its profile, its records, and the identities linked to it are stored on Epix Chain, which is a public ledger. See [xID](xid.md).
- **Wallet activity.** Transactions are public and tied to your wallet address.
- **That a xite exists.** Anyone who knows a xite's address can ask the network for it.

Routing options protect your network address. They do not make public content private.

## Tor

EpixNet runs its own Tor client inside the node process. There is no separate Tor program to install or configure. The mode is set under **Network > Tor** on the Config page, or with the `EPIX_TOR` setting described in [Running EpixNet](running.md). A change takes effect after a restart.

| Mode | Config label | What the node does |
| --- | --- | --- |
| `disable` | Disable | Tor is off. Peers that are only reachable at `.onion` addresses cannot be reached, and you have no onion address. |
| `enable` (default) | Enable (clearnet peers see your IP) | Dials `.onion` peers through Tor and every other peer directly. Hosts an onion service so that Tor-only peers can reach you. |
| `always` | Always private (Tor/I2P only) | Sends every peer connection through Tor, including peers that have ordinary IP addresses. |

### Enable is not anonymity

The default mode exists so that you can exchange data with Tor-only peers. It does not hide you.

- Peers with ordinary IP addresses are dialed directly, so they see your IP address.
- Trackers are contacted directly and see your IP address.
- `.epix` name lookups go directly to the configured Epix Chain endpoints, which see your IP address and the names you look up.
- Your node also tells trackers how other peers can reach it, which can include its onion address alongside the IP address the request came from. Do not assume your onion address cannot be connected to you in this mode.

One thing the node does avoid in this mode: when it connects to a peer directly, it does not offer that peer its onion address.

### What Always changes

In `always` mode the node is built so that peer traffic never leaves directly:

- Every peer is dialed through Tor. Peers with IP addresses are reached through Tor exit relays.
- At startup, the loops that dial peers wait until Tor is ready. Nothing is sent directly while Tor is still connecting, and a failed Tor connection does not fall back to a direct one.
- The file server listens on a loopback address only, so nobody can connect to you directly. Other peers reach you through your onion service.
- The node does not ask your router to open a port, and it does not report a public address.
- `.epix` name lookups are sent through Tor, and are held back until Tor is ready.
- Direct incoming sessions from peers on your local network are not used.
- In builds with BitTorrent media support, the peer swarm does not run, and web seed downloads go through Tor.

Expect it to be slower. Connections through Tor take longer to build, and the node allows longer timeouts to match.

You can also switch it on from the Dashboard: open **Network health** and use **Route every connection through Tor (slower)**.

!!! warning "Always covers the node, not your browser"
    `always` governs the node's connections. Your browser is a separate program with its own routing. With a system browser, pages you open can still contact external sites directly. The Dashboard shows a "Check your browser's routing" warning in that situation. EpixNet Browser with **Route clearnet through Tor** switched on closes most of that gap, with the exceptions listed under [The browser](#the-browser).

### If Tor is blocked

Builds with bridge support offer **Use Tor bridges** under **Network**. It uses Snowflake, a transport designed for networks that block Tor, and it also switches on automatically when direct connections to Tor keep failing. In builds without bridge support the option is shown but disabled.

Using a bridge makes it harder to block Tor. It does not hide the fact that you are using a circumvention tool from someone watching your connection closely.

### Your onion address

Your onion address stays the same across restarts because its key is stored in the node's data folder. The [Backup and Restore](dashboard.md#backup-and-restore) wizard can include it, so that a moved node keeps its address. Never run two nodes with the same onion key at once.

## I2P

I2P is a second overlay network. With it enabled, your node can reach peers at `.b32.i2p` addresses and gets an I2P address of its own that other peers can dial. Set the mode under **Network > I2P**. A change takes effect after a restart.

| Mode | What it does |
| --- | --- |
| Disable | I2P is off. |
| Embedded router | Runs an I2P router inside the node process. No other software is needed. |
| External router | Uses an I2P router you already run, such as i2pd or Java I2P, through its SAM interface. The port defaults to `7656`. |

Things to know:

- The embedded router needs time. On a cold start it fetches an initial list of routers over HTTPS and builds tunnels in the background, which can take minutes. The node keeps working over its other connections in the meantime.
- Some builds switch the embedded router on the first time the node runs, if you have not made a choice yet. Check the I2P setting on the Config page to see what your node is doing, and choose **Disable** if you do not want it.
- Running an I2P router is visible. Your router takes part in the I2P network under your IP address. I2P hides who you are talking to, not that you use I2P.
- EpixNet Browser can open `.i2p` websites through the node's router when I2P is on.

The Dashboard's **Network health** drawer shows the I2P state and your I2P address once it is ready.

## The browser

How pages are fetched depends on which browser you use. The details are on the [EpixNet Browser](browser-wallet.md#how-the-browser-routes-traffic) page. In short:

**EpixNet Browser**

- `.epix` xites come from your own node.
- `.onion` sites always go through Tor, and `.i2p` sites through I2P.
- Ordinary websites go directly or through Tor, according to the wallet's **Route clearnet through Tor** switch. The switch is on by default when the node's Tor client is enabled.
- Requests to hosts under `epix.zone`, which are the Epix Chain endpoints the wallet depends on, always go directly. Those servers see your IP address even when the switch is on.
- Requests to loopback addresses never use Tor.

**A system browser**

- The node's routing settings do not apply to it at all.
- A xite's page is free to load content from ordinary web servers. When it does, your browser contacts that server however it is configured, usually directly.
- If you need such requests to go through Tor, you have to configure that in the browser yourself, or use EpixNet Browser.

!!! note "Xites can reach the ordinary web"
    A xite's files are not served with a rule that forbids external requests. A page may embed an image, font, or script from an ordinary website, and it may call ordinary HTTPS services. Xite pages run in a sandbox that keeps them away from your node's controls (see [The wrapper sandbox](../build/sandbox.md)), but the sandbox is not a network firewall.

## Local network discovery

Local discovery lets nodes on the same network find each other without the internet, a tracker, or DNS. It is off by default. Turn it on with **Find peers on the local network** under **Offline & Mesh**, then restart.

- It uses UDP broadcast on port `1544`, on IPv4 only.
- While it is on, your node answers discovery requests from anyone on that network with the identifiers of the xites it serves. On a network you do not control, that tells strangers what you hold.
- It only finds peers for xites that both devices already have or have asked for. It does not subscribe you to everything another device holds.
- It needs the **AnnounceLocal** feature to stay enabled on the Plugins page.
- Networks that isolate clients from each other, or block broadcast traffic, prevent it from working.

Use it on networks you trust, such as your home or an isolated LAN, and leave it off elsewhere.

## Reticulum mesh and working offline

EpixNet includes a Reticulum mesh transport written in Rust. It can carry xite traffic over links that need no internet: a LAN with no uplink, or radio links between nearby Android phones. It is disabled by default and is enabled with **Reticulum mesh** under **Offline & Mesh**.

- Switching the mesh on or off applies immediately. Changing the TCP interfaces to join, or the listen address, needs a restart.
- An enabled node can relay encrypted mesh traffic for other participants.
- Enabling the mesh does not download xites you did not ask for, and mesh announcements do not list the xites a node hosts.
- Mesh links are treated as untrusted carriers. The node still verifies peer identities and the signatures on xite content.

!!! warning "The mesh is not an anonymity layer"
    Mesh traffic does not travel through Tor. Radio discovery is visible to anyone nearby with a suitable receiver, and a mesh TCP listener is an ordinary network service. Do not expose a mesh listener to the internet just to connect nearby devices.

### Connect two nodes on a LAN

1. Get the xites you need onto at least one node while it still has a connection. Without internet access, use a xite's `epix1...` address instead of its `.epix` name, because names cannot be looked up.
2. On the node that hosts the xite, set **Reticulum mesh** to **Enable** and set **Mesh TCP listen address** to that computer's LAN address and an unused port, in the form `<LAN address>:<port>`. Restart, and allow the port through the computer's firewall.
3. On the other node, enable the mesh and enter the same `<LAN address>:<port>` under **Mesh TCP interfaces to join**. Leave its listen address empty and restart.
4. Open the xite's `epix1...` address on the second node. Discovery can take about 15 seconds.

If the xite does not arrive, open `/EpixNet-Internal/Status` on the hosting node, copy the `mesh_endpoints.reliable_v2` value including its `rns:` prefix, and paste it into the second node's [sidebar](dashboard.md#the-xite-sidebar) under **Peers > Add peer**. That value is a public endpoint, not a key.

### Nearby Android devices

On Android 10 or later, press and hold the Epix icon next to the address bar and open **Nearby mesh**. Bluetooth and Wi-Fi Aware are both optional and start switched off.

- Turn the radio on in Android's own settings first. The app does not enable system radios for you.
- Android asks for a nearby devices permission, and on some versions a location permission, because the system requires it for radio scanning. EpixNet does not read your position.
- Wi-Fi Aware needs compatible hardware. The panel says when a radio is unsupported or unavailable.
- Switching a radio on enables the mesh transport, with the relaying described above.
- Background operation is subject to Android's battery and process limits. After a reboot or a force stop, reopen the app to resume.

For chat without internet access, see Epix Mesh Chat in [Featured xites](apps.md).

### Offline mode is something else

**Offline mode** under **Network** disables network transfers altogether, including the mesh and local discovery. To work without internet access, leave Offline mode off and use a LAN or mesh link.

Being on a network without internet does not stop the node from trying its configured internet services. Clearing the tracker list restores the default trackers, so it is not a way to block internet access.

## What others can see

This table summarizes who learns what in each situation. "Your IP address" means the address your connection appears to come from, which is a VPN's address if you use one.

| Who | Tor `enable` (default) | Tor `always` |
| --- | --- | --- |
| A peer with an ordinary IP address | Your IP address, and which xites and files you exchange with it | A Tor exit relay's address, and which xites and files you exchange with it |
| A peer at an onion address | Your onion address, and what you exchange | The same |
| A tracker | Your IP address, the addresses you announce, and identifiers of the xites you ask about | A Tor exit's address, your onion address, and the same identifiers |
| Epix Chain endpoints used by the node | Your IP address and the names you look up | A Tor exit's address and the names you look up |
| Your internet provider | The peers, trackers, and services your node contacts directly, and that you use Tor | That you use Tor (and I2P if it is on), plus anything your browser or wallet sends directly |
| Anyone who holds a xite you posted on | Your public posts and the identity that signed them | The same |

Whatever the mode, a peer you exchange a xite with necessarily knows which xite it is. Peers also exchange the addresses of other peers they know for a xite, so an address you are reachable at can spread to other peers of that xite.

The peer map and the country list in the Dashboard are drawn by looking up peer addresses in a location database bundled with your node. Nothing is sent to a location service. The same works in reverse: a peer that sees your IP address can estimate your location from it.

## Other things to keep in mind

- **Your node asks your router for a port.** In the default mode, a desktop node tries to open its file server port on your home router with UPnP so that other peers can connect to it. Setting the file server port to `0` disables seeding. Phones never accept direct incoming connections.
- **Your node helps others find peers.** By default the node answers peer discovery requests from other nodes, acting as a small tracker. You can switch that off with **Act as a tracker** under **Network**.
- **Identities are per xite until you link them.** Without an xID, the node uses a different signing address on each xite. Selecting the same xID on several xites deliberately connects your activity across them. Browsing needs no identity at all. Only posting does.
- **Encrypted messaging depends on the node.** Apps such as Epix Mail ask the node to encrypt and decrypt for them. Use a node you control. See [Channels and local profiles](../build/messaging.md).
- **The node's interface is local.** By default the Dashboard listens on a loopback address, reachable only from your own machine. Making it reachable from a network exposes your node's controls. If you do that, protect it. See [Running EpixNet](running.md).
- **A signature is not a safety check.** Signatures prove who published a xite. They say nothing about whether its content is safe, honest, or lawful.

## Practical setups

=== "Everyday use"

    Leave Tor on **Enable**. You can reach Tor-only peers, and you understand that ordinary peers and trackers see your IP address. Use EpixNet Browser so that xites get separate secure origins.

=== "Hiding your IP address from peers"

    1. Set **Tor** to **Always private** and restart.
    2. Use EpixNet Browser and keep **Route clearnet through Tor** on.
    3. Keep **Find peers on the local network** and **Reticulum mesh** off.
    4. Remember that wallet requests to `epix.zone` endpoints still go directly, and that anything you publish is public.
    5. Use a separate xID, registered from a wallet that is not connected to your other activity, if you do not want your posts tied to an existing identity.

=== "Censored network"

    Turn on **Use Tor bridges** if your build offers it. Expect slow startup. Consider enabling I2P as a second route.

=== "No internet"

    Enable local discovery or the Reticulum mesh on a network you trust, and use `epix1...` addresses. Install the xites you need beforehand.

## Limits, stated plainly

- Tor and I2P support does not guarantee anonymity. Both can be weakened by what you do: logging in, reusing a name, or publishing identifying details.
- A powerful observer who can watch both ends of a connection may still correlate traffic. EpixNet does not defend against that.
- The default configuration is not private with respect to your IP address.
- Content availability depends on reachable peers. Stricter routing reduces the set of peers you can reach and slows everything down.
- These protections assume your own device is trustworthy. They do not help against malware, a compromised browser, or someone with access to your user account.

## Related pages

- [EpixNet Browser and Epix Wallet](browser-wallet.md): the browser's routing rules in detail.
- [Dashboard, sidebar, and node settings](dashboard.md): where the settings on this page live.
- [Running EpixNet](running.md): environment settings, ports, and binding the interface to another address.
- [Peer protocol and discovery](../internals/protocol.md): how peers and trackers talk to each other.
- [Frequently asked questions](../faq.md)
