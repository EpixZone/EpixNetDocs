## What is EpixNet?

**EpixNet** is a decentralized peer-to-peer web platform that enables users to create, host, and access websites without relying on traditional centralized servers. Built on BitTorrent technology and cryptographic principles, EpixNet creates a censorship-resistant internet where content is distributed across a network of peers.

### Key Characteristics

- **Websites are distributed**: Each site is stored across multiple peers in the network
- **No central servers**: Sites remain online as long as at least one peer hosts them
- **Cryptographically secured**: All content is signed and verified using public-key cryptography
- **BitTorrent-powered**: Uses BitTorrent protocol for peer discovery and content distribution
- **Real-time updates**: Site owners can update content and changes propagate across the network
- **Privacy-focused**: Supports Tor integration for anonymous browsing and hosting

When a site is updated by its owner, all nodes serving that site (previous visitors) will receive only the incremental updates made to the site content.

EpixNet comes with a built-in SQL database. This makes content-heavy site development easy. The database is then synced to hosting nodes via incremental updates.


## Why?

* We believe in open, free, and uncensored communication.
* No censorship: After something is published there is no way to remove it.
* No single point of failure: Content remains online even if only one peer is serving it.
* Impossible to shut down: It's nowhere because it's everywhere. Content is served by any user who wishes to.
* Fast: EpixNet uses BitTorrent technology to deliver content faster than centralised servers.
* Works offline: You can access the site even if your internet is unavailable.
* Secure: Content ownership is secured using strong cryptographic signatures with secp256k1 elliptic curve cryptography.

[comment]: <> (I'm unsure about the following bit. Thoughts?)
[comment]: <> (# What problem is EpixNet solving?)

[comment]: <> (When Tim Berners-Lee created the internet, he meant for it to be free. Not surveilled nor censored. And [he is still fighting for that](http://edition.cnn.com/2014/03/12/tech/web/tim-berners-lee-web-freedom/).)

[comment]: <> (The internet is centralized mainly in two places: Content and Domain Names (URLs) are hosted and controlled by central servers. If you control the central servers (and if you are powerful enough you do) you control the network.)

[comment]: <> (**Decentralized content storage**)

[comment]: <> (EpixNet tackles the content storage problem by giving everyone the ability to store content. Site visitors can choose to store a website on their computers, and when they do this they also help to serve the site to other users. The site is online even if only one user is hosting it.)

[comment]: <> (**Shared DNS cache**)

[comment]: <> (Site addresses on EpixNet are cached by all network members. When you type a EpixNet site URL on your browser this will query other peers connected to you about the site. If one of these peers happen to have the site they will send it to you, if not, they will forward your query along.)

[comment]: <> (This architecture means that when a site URL is created, as long as one peer is serving it, there is no way to take the URL down.)


## Core Features

- **Decentralized hosting**: Sites are served by visitors, eliminating hosting costs
- **Cryptographic authentication**: Password-less authorization using EpixNet's secp256k1-based cryptographic system with bech32-encoded addresses
- **Real-time synchronization**: Live updates across all peers when content changes
- **Built-in database**: P2P synchronized SQLite database for dynamic content
- **Tor integration**: Full support for .onion hidden services (including onion-v3)
- **Offline capability**: Access cached sites even without internet connection
- **Clone protection**: One-click site cloning and forking
- **Multi-platform**: Works on Windows, macOS, Linux, and Android (via Termux)
- **TLS encrypted connections**: Secure communication between peers
- **Automatic port opening**: uPnP support for seamless network connectivity
- **Plugin architecture**: Extensible functionality for advanced use cases


## How Does It Work?

1. **Start EpixNet**: Run `python3 epixnet.py` to start the local server
2. **Access sites**: Visit `http://127.0.0.1:42222/{site_address}` in your browser
3. **Peer discovery**: When you visit a site, EpixNet finds peers using BitTorrent trackers
4. **Content verification**: All files are verified against cryptographic signatures
5. **Automatic serving**: Sites you visit are automatically shared with other peers
6. **Content updates**: Site owners sign and publish updates, which propagate through the network

Every site contains a list of all of its files, each entry containing a SHA512 hash and a signature generated using the site owner's private key. When the site owner modifies the site, they sign a new list and publish it to the peers. After the peers have verified the files list integrity using the signature, they download the modified files and publish the new content to other peers.

## Current Limitations

- No I2P integration
- Limited spam protection mechanisms
- No built-in encryption for local storage
- Requires local installation (no browser-only access)
