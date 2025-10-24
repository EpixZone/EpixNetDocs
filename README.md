# EpixNet Documentation

This repository contains the official documentation for **EpixNet**, a decentralized peer-to-peer web platform that enables users to create, host, and access websites without relying on traditional centralized servers.

**Documentation available at:** https://epixnet.io/docs

## About EpixNet

EpixNet is a Python-based implementation of a decentralized web platform built on BitTorrent technology and cryptographic principles. It creates a censorship-resistant internet where content is distributed across a network of peers.

For more information about the EpixNet project, visit the [main repository](https://github.com/EpixZone/EpixNet).

## Building the Documentation

### Prerequisites

Install the following from pip:

* mkdocs
* mkdocs-material
* pymdown-extensions

### Building Locally

Run `mkdocs serve` to host a local version of the docs:

```bash
mkdocs serve
```

Or run `mkdocs build` to output a static version:

```bash
mkdocs build
```

## French doc

Serve:

`mkdocs serve -f mkdocs-fr.yml`

Build:
`mkdocs build -f mkdocs-fr.yml -d site-fr`

## Create a new translation

You will need to duplicate the `mkdocs.yml` file and rename it to add the language code according to ISO 639-1 (https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes) it is used for.
Example : `mkdocs-fr.yml`

Modify the default lang for lunr search :
```
plugins:
  - search:
      lang: ['fr']
```

Modify the language theme to fit the one you translate it for.
Example :
```
theme:
  language: 'de'
```

Translate the nav is willing language.

Now in `docs` duplicate the folder `en/` and rename it with appropriate language code.
Example : `fr/`

Now you can translate the documentation. Thank you.

## Generate all the doc files

```
mkdocs build -f mkdocs.yml & mkdocs build -f mkdocs-fr.yml
```
