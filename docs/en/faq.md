# Frequently asked questions


#### Do I need to have a port opened?

This is __optional__, you can browse and use EpixNet sites without an open port.
If you want to create a new site it's highly recommended to have an open port.

At startup EpixNet tries to open a port for you on your router using
[UPnP](https://wikipedia.org/wiki/Universal_Plug_and_Play), if this fails you have to do it manually:

- Try to access your router's web interface using [http://192.168.1.1](http://192.168.1.1)
or [http://192.168.0.1](http://192.168.0.1)
- Look for an "Enable UPnP support" or similar option then restart EpixNet.

If it still doesn't work then try to find a 'port forwarding' section of your router page. This is different for every router. [Here is a tutorial on YouTube.](https://www.youtube.com/watch?v=aQXJ7sLSz14) The port to forward is 15441.


---


#### Is EpixNet anonymous?

It's no more anonymous than BitTorrent, but privacy (the possibility to find out who is the owner of the comment/site) will increase as the network and the sites gains more peers.

EpixNet is made to work with anonymity networks: you can easily hide your IP using the Tor network.


---


#### How to use EpixNet with the Tor browser?

In Tor mode it is recommended to use EpixNet from within the Tor Browser:

- Start the Tor Browser
- Go to address `about:config` & accept risk warning
- Search `no_proxies_on`
- Double click the preference entry
- Enter `127.0.0.1` & press OK
- Open [http://127.0.0.1:42222](http://127.0.0.1:42222) in the browser

If you still see a blank page:

 - Click on NoScript's button (first on the toolbar)
 - Choose "Temporary allow all this page"
 - Reload the page

---


#### How to use EpixNet with Tor?

If you want to hide your IP address, you can enable Tor support when running EpixNet:

```bash
python3 epixnet.py --tor always
```

Or configure it in your `epixnet.conf` file:

```
[global]
tor = always
```

For Windows with Tor Browser:

```cmd
python epixnet.py --tor_proxy 127.0.0.1:9150 --tor_controller 127.0.0.1:9151 --tor always
```

> __Tip:__ You can verify your IP address using EpixNet's [Stats](http://127.0.0.1:42222/Stats) page.

> __Tip:__ If you get connection errors, make sure you have the latest version of Tor installed.


---


#### How to make EpixNet work with Tor under Linux/MacOS?

 - Install Tor for your OS following Tor's official guidelines: [Linux](https://www.torproject.org/docs/tor-doc-unix.html.en) [Mac](https://www.torproject.org/docs/tor-doc-osx.html.en).
 - `sudo nano /etc/tor/torrc`
 - Remove the `#` character from lines `ControlPort 9051` and `CookieAuthentication 1` (line ~57)
 - Restart tor
 - Add permission for yourself to read the auth cookie. With Debian Linux, the command is `sudo usermod -a -G debian-tor [yourlinuxuser]`<br>(if you are not on Debian check the file's user group by `ls -al /var/run/tor/control.authcookie`)
 - Logout/Login with your user to apply group changes

> __Tip:__ Use the `ls -ld /var/run/tor` command to make sure it has the correct `drwxr-sr-x` permission bits. (fix it with `chmod g+sx /var/run/tor/` if necessary)

> __Tip:__ You can verify if your Tor setup is running correctly using `echo 'PROTOCOLINFO' | nc 127.0.0.1 9051`

> __Tip:__ It's also possible to use Tor without modifying torrc (or to use older versions of Tor clients), by running `epixnet.py --tor disable --proxy 127.0.0.1:9050 --disable_udp`, but then you will lose ability to talk with other .onion addresses.


---


#### How to configure Nginx reverse proxy for EpixNet?

 - Example configuration for `/etc/nginx/sites-enabled/epixnet`:

```
server {

    server_name yourhost.name;

    location / {
        proxy_pass http://127.0.0.1:42222;
        proxy_set_header Host $host;
        proxy_http_version 1.1;
        proxy_read_timeout 1h;  # for long live websocket connetion
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    listen 80;
}

```

 - Create `epixnet.conf` file next to where your EpixNet.sh / epixnet.py file is:

```
[global]
ui_host = yourhost.name
```

 - Replace `yourhost.name` in the configuration files with a domain name that points to your server
 - Start EpixNet

> __Tip:__ For public proxies enable the Multiuser plugin by renaming `plugins/disabled-Multiuser` to `plugins/Multiuser`


----


#### Is it possible to use a configuration file?

Any command line configuration flag can also be used as a configuration option. Place these options line-by-line into a file called `epixnet.conf` in your top-level epixnet directory (the one with epixnet.py). Example:

```
[global]
data_dir = my-data-dir
log_dir = my-log-dir
ui_restrict =
 1.2.3.4
 2.3.4.5
```

To list possible options, use the `epixnet.py --help` command

---


#### How to make Tor work if my ISP or goverment blocks it?

EpixNet does not include [Tor pluggable transports](https://www.torproject.org/docs/pluggable-transports.html.en) yet. The easiest way to make Tor work in a censored network is to start the Tor browser, configure it to connect to the Tor network with working pluggable transports, and modify EpixNet's config to use Tor browser's proxy and control port by starting EpixNet with `--tor_controller 127.0.0.1:9151 --tor_proxy 127.0.0.1:9150` or by adding these parameters to `epixnet.conf`.

```
[global]
tor_controller = 127.0.0.1:9151
tor_proxy = 127.0.0.1:9150
```


---


#### Can I use the same username on multiple machines?

Yes, simply copy the `data/users.json` file to your new machine.


---


#### How to create a "fancy" (non .bit) site address?

Use [EpixVanity](https://github.com/EpixZone/EpixVanity) to generate one. Once you get your keys, create `data/epix1dash...543mv7xt9zlydsj9t` directory. Put some files there.

Then navigate to [http://127.0.0.1:42222/epix1dash...543mv7xt9zlydsj9t/](http://127.0.0.1:42222/epix1dash...543mv7xt9zlydsj9t/). Drag the `EpixLogo` button to the left and use the sidebar to sign your site.

---

#### How to create a custom site address?

EpixNet site addresses are automatically generated when you create a new site. Each address is a unique bech32-encoded identifier with the "epix" prefix (e.g., `epix1...`).

To create a site:

1. Visit the EpixNet dashboard at `http://127.0.0.1:42222/`
2. Click **⋮** > **"Create new, empty site"**
3. You'll be redirected to your new site that only you can modify
4. Find your site files in the `data/[your_site_address]` directory
5. Edit your content, then drag the "0" button left and click **"Sign and publish"**

Your site address is derived from your public key and cannot be customized, but you can use Epix Name Service to register a .epix domain name that points to your site.


---


#### How can I register a .epix domain?

You can register & manage .epix domains using [Epix Name Service](http://127.0.0.1:42222/epix1xauthduuyn63k6kj54jzgp4l8nnjlhrsyaku8c/).

After the registration is done you have to add a xID idenity to the Epix Name Service.

---


#### What is an EpixNet site address?

EpixNet site addresses are unique identifiers generated using secp256k1 elliptic curve cryptography and encoded in bech32 format with the "epix" prefix (e.g., `epix1...`). Each site address is derived from a public key, and only the holder of the corresponding private key can modify the site's content.

> __Tip:__ Keep your private key secure! You need it to sign and publish updates to your site. Store it safely and never share it with anyone.


---


#### What happens when someone hosts malicious content?

The EpixNet sites are sandboxed, they have the same privileges as any other website you visit over the Internet.
You are in full control of what you are hosting. If you find suspicious content you can stop hosting the site at any time.


---


#### Is it possible to install EpixNet to a remote machine?

Yes, you have to enable the UiPassword plugin by renaming the __plugins/disabled-UiPassword__ directory to __plugins/UiPassword__,
then start EpixNet on the remote machine using <br>`epixnet.py --ui_ip "*" --ui_password anypassword`.
This will bind the EpixNet UI webserver to all interfaces, but to keep it secure you can only access it by entering the given password.

> __Tip:__ You can also restrict the interface based on ip address by using `--ui_restrict ip1 ip2`.

> __Tip:__ You can specify the password in the config file by creating a `epixnet.conf` file and adding `[global]` and `ui_password = anypassword` lines to it.


---


#### Is there any way to track the bandwidth EpixNet is using?

The sent/received bytes are displayed at EpixNet's sidebar.<br>(open it by dragging the topright `EpixLogo` button to left)

> __Tip:__ Per connection statistics page: [http://127.0.0.1:42222/Stats](http://127.0.0.1:42222/Stats)


---


#### What happens if two people use the same keys to modify a site?

Every content.json file is timestamped, the clients always accept the newest one with a valid signature.


---


#### Does EpixNet use the Epix blockchain?

EpixNet will use the Epix blockchain for any data that needs to be imutable, such as p2p transactions. EpixNet uses its own cryptographic system based on the secp256k1 elliptic curve for site addresses and content signing/verification. EpixNet addresses are unique to EpixNet and are encoded in bech32 format with the "epix" prefix.

Optionally, Epix blockchain can be used for domain registrations (.epix domains) by using the Epix Name Service, however clients do not download the blockchain. Blockchain metadata is instead passed over the EpixNet network.


---


#### Does EpixNet only support HTML, CSS websites?

EpixNet is built for dynamic, real-time updated websites, but you can serve any kind of files using it, such as (VCS repositories, your own thin-client, database, etc.


---


#### How can I create a new EpixNet site?

[Follow these instructions.](../using_epixnet/create_new_site/)

---


#### What happens when I access a site?

- When you want to open a new site it asks for visitor's IP addresses from BitTorrent trackers.
- Initially, a file named __content.json__ is downloaded, which holds all other filenames,
  __hashes__ and the site owner's cryptographic signature.
- The downloaded content.json file is __verified__ using the site's __address__ and the site owner's __signature__ from the file.
- Other files (html, css, js...) are then __downloaded__ and verified using their size and SHA512 hash from content.json.
- Each visited site then becomes __also served by you__.
- If the site owner (who has the private key for the site address) __modifies__ the site, then he/she signs
  the new content.json and __publishes it to peers__. After the peers have verified the file's
  integrity (using the signature), they __download the modified files__ and serve the new content to other peers.

More info:
 [EpixNet sample sites](../using_epixnet/sample_sites/)
