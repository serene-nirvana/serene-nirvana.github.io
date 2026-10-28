/* Serene Nirvana website: small, private helpers that run in the visitor's browser.
   - "This week": highlights today and says what's next (the channel's time zone, and the visitor's own time).
   - Live lists (only when the site has a YouTube API key): the playlist tiles, Newest and Most popular are read from
     YouTube's public data, so they match the channel right now. The list is kept in this browser for a few hours,
     but read again after each posting time. A new video the bot hasn't added to its playlist yet already gets its
     playlist's colour and place, from the categories the site was told in advance (matched by title).
     If YouTube can't be reached, the lists built into the page stay as they are.
   No cookies, no tracking: nothing about the visitor is stored anywhere but their own browser. */
(function () {
  "use strict";
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var el = document.getElementById("sn-data");
  if (!el) return;
  var cfg;
  try { cfg = JSON.parse(el.textContent); } catch (e) { return; }
  document.documentElement.className += " js";

  // ── time helpers ──
  function partsIn(tz, t) {
    var f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric",
      day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" });
    var o = {};
    f.formatToParts(new Date(t)).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, mo: +o.month, d: +o.day, h: (+o.hour) % 24, mi: +o.minute, wd: DAYS.indexOf(o.weekday) };
  }
  function zonedToUtc(y, mo, d, h, mi, tz) {        // the instant when the clock in tz shows this date and time
    var guess = Date.UTC(y, mo - 1, d, h, mi);
    function offset(t) { var p = partsIn(tz, t); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - t; }
    var t = guess - offset(guess);
    return guess - offset(t);
  }
  function clock(h, mi) {
    var s = (h % 12 || 12) + (mi ? ":" + (mi < 10 ? "0" : "") + mi : "");
    return s + (h < 12 ? " AM" : " PM");
  }

  // ── This week: today + next up ──
  function week(now) {
    var tz = cfg.tz || "America/New_York";
    var p = partsIn(tz, now);
    var cells = document.querySelectorAll(".day[data-day]");
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      c.classList.remove("today");
      var lab = c.querySelector(".d");
      lab.textContent = c.getAttribute("data-day");
      if (c.getAttribute("data-day") === DAYS[p.wd]) {
        c.classList.add("today"); lab.textContent += " · today";
        var strip = c.parentNode;                      // (phones: the strip scrolls sideways - bring today into view)
        if (strip.scrollWidth > strip.clientWidth) strip.scrollLeft = Math.max(0, c.offsetLeft - 8);
      }
    }
    var slots = cfg.slots || [], nowMin = p.h * 60 + p.mi, hit = null;
    for (var k = 0; k < 8 && !hit; k++) {
      var day = DAYS[(p.wd + k) % 7];
      for (var j = 0; j < slots.length; j++) {
        var s = slots[j], hm = String(s.hm || "").split(":");
        if (s.day !== day || hm.length !== 2) continue;
        var mins = (+hm[0]) * 60 + (+hm[1]);
        if (k === 0 && mins <= nowMin) continue;
        if (!hit || mins < hit.mins) hit = { k: k, mins: mins, s: s, h: +hm[0], mi: +hm[1] };
      }
    }
    var box = document.getElementById("next-up");
    if (!hit || !box) return;
    var base = new Date(Date.UTC(p.y, p.mo - 1, p.d + hit.k));
    var at = zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), hit.h, hit.mi, tz);
    var abbr = { "America/New_York": "ET", "America/Chicago": "CT", "America/Denver": "MT", "America/Los_Angeles": "PT" }[tz] || tz;
    var text = hit.s.label + " · " + (hit.k === 0 ? "today" : hit.k === 1 ? "tomorrow" : hit.s.day) + " " + clock(hit.h, hit.mi) + " " + abbr;
    var mine = "";
    try { mine = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    var local = "";
    if (mine && mine !== tz) {
      var q = partsIn(mine, at);
      if (q.h !== hit.h || q.mi !== hit.mi || q.wd !== (p.wd + hit.k) % 7) local = " (" + DAYS[q.wd] + " " + clock(q.h, q.mi) + " your time)";
    }
    box.textContent = "";
    box.appendChild(document.createTextNode("Next up: "));
    var b = document.createElement("b");
    b.textContent = text;
    box.appendChild(b);
    box.appendChild(document.createTextNode(local));
    box.hidden = false;
  }

  // ── Newest / Most popular tabs ──
  function tabs() {
    var bar = document.querySelector(".tabs");
    var n = document.getElementById("newest"), pop = document.getElementById("popular");
    if (!bar || !n || !pop) return;
    var bs = bar.querySelectorAll("button");
    function show(which) {
      for (var i = 0; i < bs.length; i++) bs[i].setAttribute("aria-selected", bs[i].getAttribute("data-tab") === which ? "true" : "false");
      n.hidden = which !== "newest" || n.getAttribute("data-empty") === "1";
      pop.hidden = which !== "popular" || pop.getAttribute("data-empty") === "1";
    }
    for (var i = 0; i < bs.length; i++) bs[i].onclick = function () { show(this.getAttribute("data-tab")); };
    function refresh() {
      var hasN = n.querySelector(".vcard") !== null, hasP = pop.querySelector(".vcard") !== null;
      n.setAttribute("data-empty", hasN ? "0" : "1");
      pop.setAttribute("data-empty", hasP ? "0" : "1");
      bar.hidden = !(hasN && hasP);
      var sec = document.getElementById("videos");
      sec.hidden = !(hasN || hasP);
      sec.classList.toggle("single", !(hasN && hasP));     // one list only: no tabs, so show its heading
      var cur = bar.querySelector('[aria-selected="true"]');
      var want = cur ? cur.getAttribute("data-tab") : "newest";
      if ((want === "popular" && !hasP) || (want === "newest" && !hasN)) want = hasN ? "newest" : "popular";
      show(want);
    }
    refresh();
    return refresh;
  }

  // ── live lists from YouTube (optional) ──
  function seconds(d) {
    var m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d || "");
    return m ? (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0)) : 0;
  }
  function length(sec) {
    var h = Math.round(sec / 3600);
    return sec >= 3600 ? h + " hour" + (h !== 1 ? "s" : "") : Math.round(sec / 60) + " minutes";
  }
  function api(path, params) {
    var q = [];
    for (var k in params) q.push(k + "=" + encodeURIComponent(params[k]));
    q.push("key=" + encodeURIComponent(cfg.key));
    return fetch("https://www.googleapis.com/youtube/v3/" + path + "?" + q.join("&"), { credentials: "omit" })
      .then(function (r) {
        if (!r.ok) { var e = new Error("YouTube said " + r.status); e.status = r.status; throw e; }
        return r.json();
      });
  }
  function members(pid) {
    return api("playlistItems", { part: "contentDetails", maxResults: 50, playlistId: pid }).then(function (j) {
      return (j.items || []).map(function (it) { return (it.contentDetails || {}).videoId; }).filter(Boolean);
    }, function (e) { if (e.status === 404) return []; throw e; });    // a deleted playlist: an empty tile
  }
  function load() {
    var cats = Object.keys(cfg.playlists || {});
    var jobs = cats.map(function (c) { return members(cfg.playlists[c]); });
    if (cfg.uploads) jobs.push(members(cfg.uploads));
    return Promise.all(jobs).then(function (lists) {
      var ids = [], seen = {};
      lists.forEach(function (l) { l.forEach(function (v) { if (!seen[v]) { seen[v] = 1; ids.push(v); } }); });
      ids = ids.slice(0, 200);
      var chunks = [];
      for (var i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
      return Promise.all(chunks.map(function (c) {
        return api("videos", { part: "snippet,contentDetails,statistics,status", id: c.join(",") });
      })).then(function (rs) {
        var vids = {};
        rs.forEach(function (r) {
          (r.items || []).forEach(function (v) {
            var sec = seconds((v.contentDetails || {}).duration);
            if ((v.status || {}).privacyStatus !== "public" || sec < (cfg.minLong || 240)) return;   // no Shorts, nothing private
            vids[v.id] = { id: v.id, title: (v.snippet || {}).title || "", sec: sec,
              views: +((v.statistics || {}).viewCount || 0), published: (v.snippet || {}).publishedAt || "" };
          });
        });
        var m = {};
        cats.forEach(function (c, i) { m[c] = lists[i]; });
        return { vids: vids, members: m };
      });
    });
  }
  function byNew(a, b) { return a.published < b.published ? 1 : a.published > b.published ? -1 : 0; }
  function card(v) {
    var a = document.createElement("a");
    a.className = "vcard"; a.href = "https://youtu.be/" + encodeURIComponent(v.id); a.rel = "noopener";
    var th = document.createElement("div"); th.className = "th";
    var img = document.createElement("img"); img.src = "https://i.ytimg.com/vi/" + encodeURIComponent(v.id) + "/hqdefault.jpg";
    img.alt = ""; img.loading = "lazy";
    var len = document.createElement("span"); len.className = "len"; len.textContent = length(v.sec);
    th.appendChild(img); th.appendChild(len);
    var t = document.createElement("span"); t.textContent = v.title;
    a.appendChild(th); a.appendChild(t);
    return a;
  }
  function fill(id, list) {
    var box = document.getElementById(id);
    if (!box) return;
    var grid = box.querySelector(".vgrid");
    grid.textContent = "";
    if (list.length >= (cfg.min || 3)) list.slice(0, 6).forEach(function (v) { grid.appendChild(card(v)); });
  }
  function render(d, refreshTabs) {
    var all = Object.keys(d.vids).map(function (k) { return d.vids[k]; });
    var newest = all.slice().sort(byNew);
    var popular = all.filter(function (v) { return v.views > 0; }).sort(function (a, b) { return b.views - a.views || byNew(a, b); });
    fill("newest", newest);
    fill("popular", popular);
    if (refreshTabs) refreshTabs();
    var badge = document.getElementById("live-new"), play = document.getElementById("play-newest");
    var early = {};                                   // public videos not in a playlist yet, whose category the site was
    Object.keys(d.vids).forEach(function (id) {       // told in advance (by title): counted in their playlist straight away
      var inAny = Object.keys(d.members).some(function (c) { return d.members[c].indexOf(id) >= 0; });
      var c = inAny ? "" : upcomingCat(d.vids[id].title);
      if (c) (early[c] = early[c] || []).push(id);
    });
    if (newest.length && badge) {                     // the caption (plain text) and the one button that plays it
      var cat = "";                                   // its dot: the colour of the playlist it's in
      Object.keys(d.members).forEach(function (c) { if (!cat && d.members[c].indexOf(newest[0].id) >= 0) cat = c; });
      if (!cat) cat = upcomingCat(newest[0].title);   // …or will be in (the bot adds it on its next run)
      if (!cat && badge.getAttribute("data-id") === newest[0].id) cat = badge.getAttribute("data-cat") || "";
      badge.setAttribute("data-cat", /^(sleep|focus|meditation|morning)$/.test(cat) ? cat : "");
      badge.setAttribute("data-id", newest[0].id);
      badge.setAttribute("data-published", newest[0].published || "");
      badge.querySelector(".ttl").textContent = newest[0].title;
      newLabel();
      badge.hidden = false;
      if (play) { play.href = "https://youtu.be/" + encodeURIComponent(newest[0].id);
                  play.textContent = "\u25b6\u00a0 Play the latest video"; }
      hero(newest[0].title);
    }
    Object.keys(d.members).forEach(function (c) {
      var tile = document.querySelector('.mood[data-cat="' + c + '"]');
      if (!tile) return;
      var inside = d.members[c].concat(early[c] || []).filter(function (v) { return d.vids[v]; })
        .map(function (v) { return d.vids[v]; }).sort(byNew);
      var pic = tile.querySelector(".pic"), badgeEl = tile.querySelector(".count"), playEl = tile.querySelector(".play");
      if (!inside.length) return;                       // (keep what the page was built with)
      var link = tile;
      if (tile.tagName !== "A") {                       // first public video in this playlist: the tile becomes a link
        link = document.createElement("a");
        link.className = tile.className; link.setAttribute("data-cat", c);
        while (tile.firstChild) link.appendChild(tile.firstChild);
        tile.parentNode.replaceChild(link, tile);
      }
      link.href = "https://www.youtube.com/playlist?list=" + encodeURIComponent(cfg.playlists[c]);
      link.rel = "noopener";
      pic.style.backgroundImage = "url(https://i.ytimg.com/vi/" + encodeURIComponent(inside[0].id) + "/hqdefault.jpg)";
      badgeEl.textContent = inside.length + " video" + (inside.length === 1 ? "" : "s");
      playEl.textContent = "▶ Play all";
    });
  }
  // the header: when the newest public video is one the site was told about in advance (made but not out yet when the
  // site was built), show that video's scene - matched by its title, so it only changes once the video is really out
  function norm(t) { return String(t || "").toLowerCase().replace(/\s+/g, " ").trim(); }
  function upcomingCat(title) {                     // the category of a video the site was told about in advance
    var k = norm(title), us = cfg.upcoming || [];
    for (var i = 0; i < us.length; i++) {
      if (norm(us[i].t) === k && /^(sleep|focus|meditation|morning)$/.test(us[i].cat)) return us[i].cat;
    }
    return "";
  }
  // the most recent posting time (the channel's own clock) at or before t, or 0
  function lastRelease(t) {
    var tz = cfg.tz || "America/New_York", p = partsIn(tz, t), slots = cfg.slots || [], best = 0;
    for (var k = 0; k < 8; k++) {
      var base = new Date(Date.UTC(p.y, p.mo - 1, p.d - k)), day = DAYS[(p.wd - k + 70) % 7];
      for (var j = 0; j < slots.length; j++) {
        var s = slots[j], hm = String(s.hm || "").split(":");
        if (s.day !== day || hm.length !== 2) continue;
        var at = zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), +hm[0], +hm[1], tz);
        if (at <= t && at > best) best = at;
      }
    }
    return best;
  }
  function hero(title) {
    var k = norm(title), hs = cfg.heroes || [], sc = document.querySelector(".hero .scene");
    if (!sc || !k) return;
    for (var i = 0; i < hs.length; i++) {
      if (norm(hs[i].t) === k) { sc.className = "scene photo"; sc.style.backgroundImage = "url(" + hs[i].img + ")"; return; }
    }
  }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }

  week(Date.now());
  window.__snWeek = week;                             // (for tests: run the week strip at a chosen moment)
  // "New this week:" only while the newest video is under 7 days old (checked on the visitor's own clock)
  function newLabel() {
    var b = document.getElementById("live-new");
    if (!b) return;
    var t = Date.parse(b.getAttribute("data-published") || ""), age = Date.now() - t;
    b.querySelector(".lbl").textContent = (!isNaN(t) && age >= 0 && age < 7 * 864e5) ? "New this week:" : "Latest:";
  }
  newLabel();
  var refreshTabs = tabs();
  if (!cfg.key) return;
  var ck = "sn-live-1:" + (cfg.uploads || "") + ":" + Object.keys(cfg.playlists || {}).map(function (c) { return cfg.playlists[c]; }).join(",");
  var cached = store(ck);
  var rel = lastRelease(Date.now());                // read before a posting time (or just after it, while YouTube may not
  var before = rel && cached && cached.t < rel + (cfg.settle || 900) * 1000;   // show it yet): read again now
  if (cached && cached.d && !before && Date.now() - cached.t < (cfg.ttl || 10800) * 1000) { render(cached.d, refreshTabs); return; }
  if (cached && cached.d) render(cached.d, refreshTabs);
  load().then(function (d) {
    store(ck, { t: Date.now(), d: d });
    render(d, refreshTabs);
  }, function () { /* YouTube not reachable (or the day's quota is used): the lists built into the page stay */ });
})();
