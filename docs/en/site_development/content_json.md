# Structure of content.json

> **Note**: This documentation may contain references to legacy address formats. EpixNet currently uses bech32-encoded addresses with the "epix" prefix (e.g., `epix1...`). For current information about EpixNet's cryptographic system, see the [main documentation](../index.md).

Every EpixNet site has a `content.json` file. ([Example content.json file](https://github.com/EpixZone/EpixNet/blob/main/src/Content/content.json))

This file will carry, among other things, a list of all files on your site and a signature created with your private key. This is used to ensure authenticity of site files and avoid tampering (ie: only you, or people you trust, can update your site's content).

Here is a list of supported `content.json` keys:


---

## Generated automatically

_These keys are added automatically when the site is created or cloned._

### address

Your site address

**Example**: epix1xefvdg349ugav3hykgk0pcay63swst8z25q58j


---


### address_index

The site address's BIP32 sub-key index of your BIP32 seed. Auto-added when you clone a site. It allows recovery of the site's privatekey from your BIP32 seed.

**Example**: 30926910

---


### cloned_from

Only for cloned sites. The site address where the site is cloned from.

**Example**: epix1testdgp9g99kgd0ej5u8js99tlkrdju8znr8d2

---


### clone_root

Only for cloned sites. The sub-directory on the site which this was cloned from.

**Example**: template-new


---


### files

Size and sha512 hashes of automatically downloaded files contained in your site. Automatically added by the command `epixnet.py siteSign siteaddress privatekey`.

**Example**:
```python
    "css/all.css": {
      "sha512": "869b09328f07bac538c313c4702baa5276544346418378199fa5cef644c139e8",
      "size": 148208
    }
```


---


### files_optional

Size and sha512 hashes of optional files contained in your site. Automatically added by the command `epixnet.py siteSign siteaddress privatekey`.

**Example**:
```python
    "data/myvideo.mp4": {
      "sha512": "538c09328aa52765443464135cef644c144346418378199fa5cef61837819538",
      "size": 832103
    }
```



---


### modified

Time when the content.json was generated.

**Example**: 1425857522.076


---


### sign (deprecated)

ECDSA sign of the content.json file content. (keys sorted, without whitespace and the `sign` and `signers_sign` nodes). For backward compatibility, will be removed soon.

**Example**:
```python
  "sign": [
    43117356513690007125104018825100786623580298637039067305407092800990252156956,
    94139380599940414070721501960181245022427741524702752954181461080408625270000
  ],
```


---


### signers_sign

Possible signer addresses for the root content.json signed using the site address private key. Multiple entries are allowed here, allowing for site Multisig functionality.

**Format of the signed string**: [number_of_signers_required]:[signer address],[signer address]

*Example*:
```
signs_required: 1:epix1xsfrfteayvxf8q37kuxnll0j8wc36gnch4xy4x,epix1uszlnpday84gqkgk8mvhhvw7u8775yq7r9q6yg
signers_sign: MEUCIQDuz+CzOVvFkv1P2ra9i5E1p1G0/1cOGecm7GpLpMLhuwIgBIbCL0YHXD1S2+x48QS5VO/rISrkdLiUR+o+x1X0y1A=
```

The above signed message is signed using the address "epix1xsfrfteayvxf8q37kuxnll0j8wc36gnch4xy4x".

---


### signs

ECDSA signature for the content.json file content:

 - `sign`, `signs` JSON nodes removed
 - JSON dumped with keys sorted alphabetically, without whitespace
 - Signature generated on the dumped data, using Epix message signature format

**Example**:
```python
  "signs": {
    "epix1dashuu6pvsut7aw9dx44f543mv7xt9zlydsj9t": "G6/QXFKvACPQ7LhoZG4fgqmeOSK99vGM2arVWkm9pV/WPCfc2ulv6iuQnuzw4v5z82qWswcRq907VPdBsdb9VRo="
  },
```
**Code example**
```python
import json
import btctools

privatekey = "super_secret_private_key"
privatekey_address = "private_key_address"

with open('content.json') as f:
    new_content = json.load(f)

del(new_content["signs"])  # Delete old signs
sign_content = json.dumps(new_content, sort_keys=True)
sign = btctools.ecdsa_sign(sign_content, privatekey)
new_content["signs"] = {}
new_content["signs"][privatekey_address] = sign
```

----


### epixnet_version

The EpixNet version used to generate content.json file.

**Example**: 0.0.1

---

## Optional Settings

_These options can be added if the functionality is needed._


### background-color

Background color of the wrapper

**Example**: #F5F5F5


---


### cloneable

Allow to clone the site if **true**.

To make your site properly cloneable you have to have a separate folder of data
files for a clean start (e.g. without any blog posts).  To do this you have to
add the **-default** postfix to your data files and directories.  During the
cloning process, only directories with the **-default** postfix are
copied. The postfix is removed from the new site.



---


### description

Description of your site, displayed under the site title on EpixDash.

**Example**: Decentralized demo


---


### ignore

Do not sign files matching this pattern.

**Example**: `((js|css)/(?!all.(js|css))|data/users/.*)` (ignore all js and css files except all.js and all.css and don't add anything from the `data/users/` directory)

Note: [Some restrictions](#regular-expression-limitations) apply to regular expressions.

---


### includes

Include another content.json in the site. This is typically used for subsequent content.json files that are used to govern user data.

**Example**:

```python
"includes": {
  "data/users/content.json": {
    "signers": [  # Possible signers address for the file
      "epix1uszlnpday84gqkgk8mvhhvw7u8775yq7r9q6yg"
    ],
    "signers_required": 1 # The *number* of Valid signs required to accept the file (Multisig possibility),
    "files_allowed": "data.json", # Preg pattern for the allowed files in the include file
    "includes_allowed": false, # Whether nested includes are allowed
    "max_size": 10000, # Max allowed size of included content.json and files it signs (in bytes)
  }
}
```

### optional

Preg pattern of optional files.

**Example**: `(data/mp4/.*|updater/.*)` (everything in `data/mp4` and `updater` directory is optional)

Note: [Some restrictions](#regular-expression-limitations) apply to regular expressions.

---


### signs_required

The **number** of valid signs required to accept the file. Allows for Multisig functionality.


**Example**: 1

----


### translate

Files need be translated. (use language json files in the `languages` directory)

**Example**: ["index.html", "js/all.js"]


----


### favicon

The site's favicon. Replaces the default EpixNet logo with a site-specific icon. Can be a .ico, .png, .svg, etc.

**Example**: favicon.ico


----


### user_contents

Rules of allowed user content within the current directory.

Node                     | Description
                    ---  | ---
**archived**             | Delete the specified user content directory that is signed earlier than the specified timestamp (key: directory name, value: timestamp)
**archived_before**      | Delete all user content directory if that is signed earlier than the specified timestamp
**cert_signers**         | Accepted domains and valid signer addresses
**cert_signers_pattern** | Accepted cert signers regexp pattern
**permission_rules**     | Allowed file names and total directory size based on cert domain or authorization method
**permissions**          | Per-user permissions. (false = banned user)

**Example**:
```python
  "user_contents": {
    "archived": {
      "epix1uszlnpday84gqkgk8mvhhvw7u8775yq7r9q6yg": 1523088096
    },
    "archived_before": 1523088096,
    "cert_signers": {
      "xid.epix": [ "epix1uszlnpday84gqkgk8mvhhvw7u8775yq7r9q6yg" ]
    },
    "cert_signers_pattern": "epix1[0-9].*",
    "permission_rules": {
      ".*": {
        "files_allowed": "data.json",
        "files_allowed_optional" : "\\.(png|jpeg|jpg|gif|webm|mp4|ogg|mp3|pdf|epub|zip|tar\\.gz)(\\.piecemap\\.msgpack)",
        "max_size": 10000,
        "max_size_optional": 10000000
      },
      "bitid/.*@xid.epix": { "max_size": 40000 },
      "bitmsg/.*@xid.epix": { "max_size": 15000 }
    },
    "permissions": {
      "bad@xid.epix": false,
      "nofish@xid.epix": { "max_size": 100000 }
    }
  }
```

Note: [Some restrictions](#regular-expression-limitations) apply to regular expressions.

----


### viewport

Content for the viewport meta tag. (Used for mobile-friendly pages)

**Example**: width=device-width, initial-scale=1.0


----

## Regular expression limitations

To avoid the [ReDoS](https://en.wikipedia.org/wiki/ReDoS) algorithmic complexity attack, the following restrictions are applied to each pattern:

 - `.` character is mandatory before repetition characters of `*,+,{`
 - Maximum 9 repetitions are allowed in a single pattern
 - The maximum length of a pattern is 255 characters

### Examples:

 - `((?!json).)*$` not allowed, because of `)` before the `*` character. Possible fix: `.*(?!json)$`
 - `(.*.epub|.*.jpg|.*.jpeg|.*.png|data/.*.gif|.*.avi|.*.ogg|.*.webm|.*.mp4|.*.mp3|.*.mkv|.*.eot)` not allowed, because it has 12 `.*` repetition patterns. Possible fix: `.*(epub|jpg|jpeg|png|data/gif|avi|ogg|webm|mp4|mp3|mkv|eot)`
