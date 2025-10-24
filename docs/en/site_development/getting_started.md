# Getting Started

EpixNet allows you to publish static and dynamic websites on a distributed web platform.

In EpixNet there is no concept of servers. Thus, server-side languages like PHP or Ruby are not needed. Instead, one can create dynamic content using EpixNet's API (called EpixFrame), JavaScript (or CoffeeScript) and the SQL database provided to all websites.

## Useful Information

### EpixNet Debug mode

EpixNet comes with a `--debug` flag that will make site development easier.

To run EpixNet in debug mode use: `python epixnet.py --debug`

If you are using compiled/bundled version of EpixNet:

* On Windows: `lib\EpixNet.cmd --debug`
* On Linux: `./EpixNet.sh --debug`
* On Mac: `./EpixNet.app/Contents/MacOS/EpixNet --debug`

#### Debug mode features:

- Automatic [CoffeeScript](http://coffeescript.org/) -> JavaScript conversion (if a coffeescript compiler is installed)
- Debug messages will appear in the console
- Auto reload of some source files (UiRequest, UiWebsocket, FileRequest) on modification to prevent restarting (Requires [PyFilesystem](http://pyfilesystem.org/) on GNU/Linux)
- `http://127.0.0.1:42222/Debug` Traceback and interactive Python console at the last error position (using the wonderful Werkzeug debugger - Requires [Werkzeug](http://werkzeug.pocoo.org/))
- `http://127.0.0.1:42222/Console` Spawns an interactive Python console (Requires [Werkzeug](http://werkzeug.pocoo.org/))

### Writing in CoffeeScript

To aid in writing CoffeeScript-based EpixNet sites and to make use of EpixNet's
built-in CoffeeScript -> JavaScript converter, first enable debug mode as
described in [Debug](#epixnet-debug-mode). Additionally, ensure the site you
wish to work on is marked as one you own by enabling "This is my site" via
the site sidebar.

<!-- Is this right? -->
EpixNet will compile all CoffeeScript files it can find into a file called `all.js`, and deposit it in a `js/` folder at the top level of your site. This file will also include all your JavaScript code as well. Then you can simply import all your dynamic code into your HTML with the following before the `</body>` tag:

```html
<script type="text/javascript" src="js/all.js?lang={lang}"></script>
```

<!-- Why? -->
!!! info "Note"

    `{lang}` is a *placeholder variable*, and will be automatically replaced by the appropriate value by EpixNet when the site is loaded.


### Disable HTTP Browser Caching

In addition to Debug Mode, disabling HTTP Caching in the browser is an essential part of EpixNet site development. Modern web browsers attempt to cache web content whenever they can. As all EpixNet sites run in an iframe, web browsers cannot detect when a EpixNet site's content changes, and thus site changes are often not reflected if HTTP Caching is enabled.

To disable, open your browser's devtools, navigate to the devtools settings and check the option along the lines of 'Disable HTTP Cache (when toolbox is open)'. As the setting suggests, make sure to keep devtools open when testing new changes to your site!

### Extra features (works only for sites that you own)

 - Merged CSS files: All CSS files inside the site folder will be merged into one file called `all.css`. You can choose to include only this file to your site. If you want to keep the other CSS files to make the development easier, you can add them to the ignore key of your `content.json`. This way, they won't be published with your site. (eg: add to your `content.json` `"ignore": "(js|css)/(?!all.(js|css))"` this will ignore all CSS and JS files except `all.js` and `all.css`)
 - Merged JS files: All JS files inside the site folder will be merged into one file called `all.js`. If a CoffeeScript compiler is present (bundled for Windows) it will convert `.coffee` to `.js`.
 - Order in which files are merged into all.css/all.js: Files inside subdirectories of the css/js folder comes first; Files in the css/js folder will be merged according to file name ordering (01_a.css, 02_a.css, etc)

## Need Help?

EpixNet has a community who hang out in various spaces. If you would like to ask for help, advice or just want to hang out, feel free to join the discord https://discord.gg/bF2GKHgrfv