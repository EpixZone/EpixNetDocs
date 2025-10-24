# Create new EpixNet site

## Easy way: Using the web interface

 * Click on **⋮** > **"Create new, empty site"** menu item on the site [EpixDash](http://127.0.0.1:42222/epix1dashuu6pvsut7aw9dx44f543mv7xt9zlydsj9t).
 * You will be **redirected** to a completely new site that is only modifiable by you!
 * You can find and modify your site's content in **data/[yoursiteaddress]** directory
 * After the modifications open your site, drag the topright "0" button to left, then press **sign** and **publish** buttons on the bottom

## Manual way: Using the command line

> __Note:__
> If you are using pre-boundled EpixNet distribution, then in place of `epixnet.py` you need to use `./EpixNet.sh` (Linux), `lib/EpixNet.cmd` (Windows), `EpixNet.app/Contents/MacOS/EpixNet` (macOS)

### 1. Create site structure

* Shut down EpixNet if it is running
* Browse to the folder where EpixNet is installed and run:

```bash
$ epixnet.py siteCreate
...
- Site private key: 23DKQpzxhbVBrAtvLEc2uvk7DZweh4qL3fn3jpM3LgHDczMK2TtYUq
- Site address: epix1k26m8v0n39qlqucfxk78gq6ajmc2wpx9w2s9zl
...
- Site created!
$ epixnet.py
...
```

- This will create the initial files for your site inside ```data/epix1k26m8v0n39qlqucfxk78gq6ajmc2wpx9w2s9zl```.

### 2. Build/Modify site

* Update the site files located in ```data/[your site address key]``` (eg: epix1k26m8v0n39qlqucfxk78gq6ajmc2wpx9w2s9zl).
* When your site is ready run:

```bash
$ epixnet.py siteSign epix1k26m8v0n39qlqucfxk78gq6ajmc2wpx9w2s9zl
- Signing site: epix1k26m8v0n39qlqucfxk78gq6ajmc2wpx9w2s9zl...
Private key (input hidden):
```

* Enter the private key you got when you created the site. This will sign all files so peers can verify that the site owner is who made the changes.

### 3. Publish site changes

* In order to inform peers about the changes you made you need to run:

```bash
$ epixnet.py sitePublish epix1k26m8v0n39qlqucfxk78gq6ajmc2wpx9w2s9zl
...
Site:13DNDk..bhC2 Publishing to 3/10 peers...
Site:13DNDk..bhC2 Successfuly published to 3 peers
- Serving files....
```

* That's it! You've successfully signed and published your modifications.
* Your site will be accessible from: ```http://localhost:42222/epix1k26m8v0n39qlqucfxk78gq6ajmc2wpx9w2s9zl```


**Next steps:** [EpixNet Developer Documentation](../../site_development/getting_started/)
