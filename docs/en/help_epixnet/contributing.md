# Contributing to EpixNet

Thank you for using EpixNet. EpixNet is a collaborative effort of decentralization enthusiasts just like you. We appreciate all users that catch bugs, improve documentation and have good ideas of designing new protocols. Here are a few guidelines we ask you to follow to get started with making your contribution.

### You don’t have to contribute source code

In fact, a majority of contributors do not submit source code. Even if you like to write programs, other types of contribution are also welcomed.

### Do you like to write?

- Write about EpixNet.
- Write tutorials to help people set things up.
- Help translate EpixNet.
- Improve this documentation. This documentation is a written by many community members all over the world.

### Do you like helping people?

- Subscribe to our [issue tracker on GitHub](https://github.com/EpixZone/EpixNet/issues) and help people solve problems.
- Join us on [Discord](https://discord.gg/bF2GKHgrfv) and help answer questions.
- Set up a seed box and help make the network faster.

### Do you like to make websites?

- Create new EpixNet sites. Go ahead and make your own blog on EpixNet. [It is easy and costs little.](../using_epixnet/create_new_site.md)
- The network is worth nothing without content, so we need You to make it succeed.

### Do you like to do research?

- Help us investigate our [hard issues](https://github.com//EpixNet/labels/help%20wanted).
- Join our discussion of designing new features and protocols, such as [I2P support](https://github.com/EpixZone/EpixNet/issues/45) and [DHT support](https://github.com/EpixZone/EpixNet/issues/57).
- Do you own a [Raspberry Pi](https://github.com/EpixZone/EpixNet#linux-terminal), a [C.H.I.P.](http://127.0.0.1:42222/Blog.EpixNetwork.epix/?Post:94:Running+EpixNet+on+a+$9%C2%A0computer) or an [open router](https://github.com/EpixZone/EpixNet/issues/783)? Try running EpixNet on it and tell us how well EpixNet works on your device.

### Do you like to write code?

- If you know Python, you can pick a task from our [issue tracker on GitHub](https://github.com/EpixZone/EpixNet/issues).
- You are also welcomed develop your own ideas. Before you start, please [open a new discussion](https://github.com/EpixZone/EpixNet/issues/new) to let the community know, so you can make sure we can share our ideas to make the best out of it.
- Keep your coding style consistent. We ask you to follow our coding convention below.


## Coding convention

- Follow [PEP8](https://www.python.org/dev/peps/pep-0008/)
- Simple is better than complex
- Premature optimization is the root of all evil

### Naming
- ClassNames: Capitalized, CamelCased
- functionNames: starts with lowercase, camelCased
- variable_names: lowercased, under_scored

### Variables
- file_path: File path relative to working dir (data/epix17lzwytj4kddedrx9qyvt5743ug74e5q7l6qpkq/css/all.css)
- inner_path: File relative to site dir (css/all.css)
- file_name: all.css
- file: Python file object
- privatekey: Private key for the site (without `_`)

### Source files directories and naming
- One class per file is preferred
- Source file name and directory comes from ClassName: WorkerManager class = Worker/WorkerManager.py
