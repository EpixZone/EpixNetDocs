/* EpixNet wrapper bridge for the docs.
 *
 * The same build is served three ways: from a normal web server, from an
 * EpixNet node that gives each xite a real content origin (loopback access
 * and .epix hosts in EpixNet Browser), and from a node in the opaque-origin
 * fallback (LAN addresses and public gateways). This script makes the last
 * two behave like the first:
 *
 *  - It introduces the page to the wrapper (innerReady, ping/pong), sets the
 *    tab title, and mirrors the current page and #fragment into the address
 *    bar, so a reload or a copied link opens the same place.
 *  - In the opaque fallback it supplies in-memory localStorage and
 *    sessionStorage (the theme reads them at startup and they throw there),
 *    adds the xite's ajax_key to same-host XHR and fetch requests (the
 *    search index), starts workers from a blob (an opaque origin cannot load
 *    a worker URL), and loads the fonts with the key when the plain request
 *    is refused.
 *
 * Outside a wrapper it does nothing. It is inlined into <head> so it runs
 * before any theme script. Keep it free of template delimiters.
 */
(function () {
  "use strict";
  if (window.parent === window) return;
  var opaque = window.origin === "null";

  /* ---- Storage for the opaque fallback (must not depend on the wrapper) ---- */
  var seedLocal = null;
  var onLocalWrite = null;
  if (opaque) {
    var makeStorage = function (isLocal) {
      var data = {};
      if (isLocal) seedLocal = function (key, value) { if (!(key in data)) data[key] = value; };
      return {
        getItem: function (key) {
          return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
        },
        setItem: function (key, value) {
          data[key] = String(value);
          if (isLocal && onLocalWrite) onLocalWrite(key, data[key]);
        },
        removeItem: function (key) { delete data[key]; },
        clear: function () { data = {}; },
        key: function (index) { return Object.keys(data)[index] || null; },
        get length() { return Object.keys(data).length; }
      };
    };
    var usable = function (name) {
      try { return !!window[name]; } catch (error) { return false; }
    };
    ["localStorage", "sessionStorage"].forEach(function (name) {
      if (usable(name)) return;
      try {
        Object.defineProperty(window, name, { configurable: true, value: makeStorage(name === "localStorage") });
      } catch (error) { /* keep the native accessor */ }
    });
  }

  /* ---- Wrapper nonce ----
     The wrapper loads the first document with a wrapper_nonce and rejects
     messages that do not carry it. A link followed inside the frame has no
     nonce in its URL, so remember it for the life of the frame: in
     sessionStorage where the page has a real origin, and in window.name,
     which survives navigation inside a frame, where it does not. */
  var NONCE_KEY = "epixnet.docs.wrapper_nonce";
  var NAME_PREFIX = "epixnet-docs-nonce:";
  var fromUrl = /[?&]wrapper_nonce=([A-Za-z0-9]+)/.exec(window.location.href);
  var nonce = fromUrl ? fromUrl[1] : null;
  if (nonce) {
    try { window.sessionStorage.setItem(NONCE_KEY, nonce); } catch (error) { /* ignore */ }
    try { window.name = NAME_PREFIX + nonce; } catch (error) { /* ignore */ }
  } else {
    try { nonce = window.sessionStorage.getItem(NONCE_KEY); } catch (error) { /* ignore */ }
    if (!nonce && typeof window.name === "string" && window.name.indexOf(NAME_PREFIX) === 0) {
      nonce = window.name.slice(NAME_PREFIX.length);
    }
    if (nonce && !/^[A-Za-z0-9]+$/.test(nonce)) nonce = null;
  }
  if (!nonce) return;

  document.documentElement.classList.add("in-epixnet");

  /* ---- Messaging ---- */
  var nextId = 1;
  var waiting = {};

  function post(message) {
    message.wrapper_nonce = nonce;
    window.parent.postMessage(message, "*");
  }

  function cmd(name, params, cb) {
    var id = nextId++;
    if (cb) waiting[id] = cb;
    post({ cmd: name, params: params === undefined ? {} : params, id: id });
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var message = event.data;
    if (!message || typeof message !== "object") return;
    if (message.cmd === "response") {
      var cb = waiting[message.to];
      if (cb) {
        delete waiting[message.to];
        cb(message.result);
      }
    } else if (message.cmd === "ping") {
      post({ cmd: "response", to: message.id, result: "pong" });
    } else if (message.cmd === "wrapperReady") {
      cmd("innerReady");
    }
  });

  cmd("innerReady");

  var docsRoot = function () {
    return new URL(window.__docs_base || ".", window.location.href);
  };

  /* ---- Opaque-origin fallback: theme choice, ajax_key, workers, fonts ---- */
  if (opaque) {
    /* Keep the reader's light or dark choice across pages through the
       wrapper's per-xite storage. */
    var stored = {};
    onLocalWrite = function (key, value) {
      if (!/__palette$/.test(key)) return;
      stored.palette = value;
      cmd("wrapperSetLocalStorage", stored);
    };
    var applyPalette = function (raw) {
      var palette;
      try { palette = JSON.parse(raw); } catch (error) { return; }
      if (!palette || !palette.color) return;
      var apply = function () {
        var body = document.body;
        if (!body) return;
        ["media", "scheme", "primary", "accent"].forEach(function (key) {
          if (palette.color[key]) body.setAttribute("data-md-color-" + key, palette.color[key]);
        });
        var input = document.getElementById("__palette_" + palette.index);
        if (input) input.checked = true;
      };
      apply();
      document.addEventListener("DOMContentLoaded", apply);
    };
    cmd("wrapperGetLocalStorage", [], function (result) {
      if (!result || typeof result !== "object" || typeof result.palette !== "string" || !seedLocal) return;
      stored = result;
      /* The theme keys its storage by the path of the docs root. */
      seedLocal(docsRoot().pathname + ".__palette", result.palette);
      applyPalette(result.palette);
    });

    /* Same-host XHR and fetch need the xite's ajax_key to be readable. */
    var ajaxKey = null;
    var keySettled = false;
    var keyWaiters = [];
    var whenKey = function (run) {
      if (keySettled) run();
      else keyWaiters.push(run);
    };
    var settleKey = function (key) {
      if (keySettled) return;
      keySettled = true;
      ajaxKey = typeof key === "string" && key ? key : null;
      keyWaiters.splice(0).forEach(function (run) { run(); });
    };
    cmd("wrapperGetAjaxKey", [], settleKey);
    window.setTimeout(function () { settleKey(null); }, 4000);

    var withKey = function (url) {
      if (!ajaxKey) return url;
      try {
        var parsed = new URL(url, window.location.href);
        if (parsed.host !== window.location.host) return url;
        if (!parsed.searchParams.has("ajax_key")) parsed.searchParams.set("ajax_key", ajaxKey);
        return parsed.toString();
      } catch (error) {
        return url;
      }
    };

    var nativeFetch = window.fetch;
    if (typeof nativeFetch === "function") {
      window.fetch = function (input, init) {
        return new Promise(function (resolve) { whenKey(resolve); }).then(function () {
          if (typeof input === "string" || input instanceof URL) {
            return nativeFetch.call(window, withKey(String(input)), init);
          }
          return nativeFetch.call(window, new Request(withKey(input.url), input), init);
        });
      };
    }

    /* XHR: open() must stay synchronous, so an open made before the key
       arrives is recorded and replayed with the keyed URL at send(). */
    var XHR = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (XHR) {
      var nativeOpen = XHR.open;
      var nativeSend = XHR.send;
      var nativeSetHeader = XHR.setRequestHeader;
      XHR.open = function (method, url) {
        var rest = Array.prototype.slice.call(arguments, 2);
        if (keySettled) {
          this.__epixDeferred = null;
          return nativeOpen.apply(this, [method, withKey(String(url))].concat(rest));
        }
        this.__epixDeferred = { method: method, url: String(url), rest: rest, headers: [] };
        return nativeOpen.apply(this, [method, String(url)].concat(rest));
      };
      XHR.setRequestHeader = function (name, value) {
        if (this.__epixDeferred) this.__epixDeferred.headers.push([name, value]);
        return nativeSetHeader.call(this, name, value);
      };
      XHR.send = function (body) {
        var xhr = this;
        var deferred = xhr.__epixDeferred;
        if (!deferred) return nativeSend.call(xhr, body);
        xhr.__epixDeferred = null;
        whenKey(function () {
          nativeOpen.apply(xhr, [deferred.method, withKey(deferred.url)].concat(deferred.rest));
          deferred.headers.forEach(function (header) { nativeSetHeader.call(xhr, header[0], header[1]); });
          nativeSend.call(xhr, body);
        });
      };
    }

    /* Workers cannot be created from a URL in an opaque origin. Fetch the
       script and start it from a blob; queue messages until it is running. */
    var NativeWorker = window.Worker;
    if (typeof NativeWorker === "function" && typeof nativeFetch === "function") {
      window.Worker = function (url, options) {
        var target = document.createDocumentFragment();
        var proxy = this;
        var real = null;
        var queue = [];
        var dead = false;
        proxy.onmessage = null;
        proxy.onerror = null;
        proxy.addEventListener = target.addEventListener.bind(target);
        proxy.removeEventListener = target.removeEventListener.bind(target);
        proxy.dispatchEvent = target.dispatchEvent.bind(target);
        proxy.postMessage = function (data, transfer) {
          if (real) real.postMessage(data, transfer);
          else if (queue) queue.push([data, transfer]);
        };
        proxy.terminate = function () {
          dead = true;
          queue = null;
          if (real) real.terminate();
        };
        var fail = function (error) {
          var event = new Event("error");
          event.message = String(error && error.message ? error.message : error);
          target.dispatchEvent(event);
          if (typeof proxy.onerror === "function") proxy.onerror(event);
        };
        window.fetch(String(url)).then(function (response) {
          if (!response.ok) throw new Error("worker script " + response.status);
          return response.text();
        }).then(function (source) {
          if (dead) return;
          var blob = new Blob([source], { type: "text/javascript" });
          real = new NativeWorker(URL.createObjectURL(blob), options);
          real.onmessage = function (event) {
            var copy = new MessageEvent("message", { data: event.data });
            target.dispatchEvent(copy);
            if (typeof proxy.onmessage === "function") proxy.onmessage(copy);
          };
          real.onerror = fail;
          var pending = queue || [];
          queue = null;
          pending.forEach(function (entry) { real.postMessage(entry[0], entry[1]); });
        }).catch(fail);
      };
    }

    /* Fonts load without the key when the browser sends fetch metadata. On
       plain-HTTP LAN addresses it does not, so retry them with the key. */
    whenKey(function () {
      if (!ajaxKey || !window.FontFace || !document.fonts) return;
      var base = docsRoot();
      var faces = [
        ["Inter", "inter-latin.woff2", { weight: "100 900" }],
        ["IBM Plex Mono", "IBMPlexMono-Regular.woff2", { weight: "400" }],
        ["IBM Plex Mono", "IBMPlexMono-Medium.woff2", { weight: "500 700" }]
      ];
      var loadMissing = function () {
        faces.forEach(function (entry) {
          if (document.fonts.check("16px \"" + entry[0] + "\"")) return;
          var url = withKey(new URL("assets/fonts/" + entry[1], base).toString());
          var face = new window.FontFace(entry[0], "url(" + JSON.stringify(url) + ") format(\"woff2\")", entry[2]);
          face.load().then(function (loaded) { document.fonts.add(loaded); }).catch(function () { /* keep the fallback font */ });
        });
      };
      if (document.fonts.ready) document.fonts.ready.then(loadMissing);
      else loadMissing();
    });
  }

  /* ---- Title, address bar and deep links ----
     Links navigate the frame only, so without help the address bar would
     stay on the first page. In path mode (the node address plus the xite
     address as the first path segment) mirror the current page into it.
     On .epix content hosts only the #fragment is mirrored. */
  var pathMode = opaque || /^epix-[a-z0-9]+\.localhost$/.test(window.location.hostname);
  var syncAddress = function () {
    if (document.title) cmd("wrapperSetTitle", document.title);
    if (pathMode) {
      var relative = window.location.pathname.slice(docsRoot().pathname.length);
      if (relative === "index.html") relative = "";
      cmd("wrapperReplaceState", [null, document.title, "/" + relative + window.location.hash]);
    } else if (window.location.hash) {
      cmd("wrapperReplaceState", [null, document.title, window.location.hash]);
    }
  };

  var ready = function () {
    /* Lets the wrapper pass a #fragment from the address bar to this frame. */
    if (fromUrl && !window.location.hash) cmd("innerLoaded");
    syncAddress();
    window.addEventListener("hashchange", syncAddress);
    window.addEventListener("pageshow", function (event) {
      if (event.persisted) syncAddress();
    });
    /* External links open in a new tab instead of inside the sandboxed frame. */
    document.addEventListener("click", function (event) {
      var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (!link || link.target) return;
      var href = link.getAttribute("href") || "";
      if (/^(https?:)?\/\//i.test(href) && link.host !== window.location.host) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
    }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();
