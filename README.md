# EpixNet documentation

Source for the official [EpixNet](https://github.com/EpixZone/EpixNet) documentation: running a node, building and publishing xites, the EpixFrame API, the libraries (EpixFrame, EpixKit and friends), Epix Chain integration, and developing xites with AI coding agents.

The docs are published as a xite on EpixNet itself, at `epix1readmehqfdxy4pzx7u72wwaerc4psx0gt6fety`. The same build is plain static HTML, so it can also be hosted on any web server.

## Repository layout

| Path | Contents |
| --- | --- |
| `mkdocs.yml` | Site configuration and navigation |
| `docs/en/` | The pages (Markdown), images and assets |
| `docs/overrides/` | Theme overrides, including the EpixNet wrapper bridge |
| `scripts/build-xite.sh` | Build and copy the site into a xite folder |

## Preview locally

Requires Python 3.9 or newer.

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
mkdocs serve
```

Open <http://127.0.0.1:8000/>. Run `mkdocs build --strict` before you open a pull request: it fails on broken internal links and anchors.

## Publish to the docs xite

```sh
scripts/build-xite.sh "<data folder>/data/epix1readmehqfdxy4pzx7u72wwaerc4psx0gt6fety"
```

Then open the xite in your node, review it, and choose **Sign & Publish** in the sidebar. Only a holder of the xite's owner key can publish. The script never touches `content.json`.

## Contributing

Read [Improve these docs](docs/en/contributing/docs.md) for the writing rules. The short version:

- Describe the current Rust node, and verify every command, parameter and default against the source before writing it down.
- Write "xite", not "site", outside literal command names.
- Embed nothing from other hosts. The xite build must work offline and over Tor.

## License

[MIT](LICENSE)
