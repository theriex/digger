/*global app, jt */
/*jslint browser, white, long, for, unordered */

//Deck display interface and actions
app.deck = (function () {
    "use strict";

    var mgrs = {};  //general container for managers 
    function mdfs (mgrfname, ...args) {  //module dispatch function string
        return app.dfs("deck", mgrfname, args);
    }


    //Song dupe tracker handles persisting songs with possible copies
    mgrs.sdt =  (function () {
        var sbp = {};  //all songs by path
        function simplifiedMatch (str) {
            var sm = str;
            //See related appdat.py standardized_colloquial_match used for
            //equivalence matching during collaboration.
            sm = sm.replace(/featuring.*/ig, "");
            sm = sm.replace(/\(.*\)/g, "");
            sm = sm.replace(/\[.*\]/g, "");
            if(!sm) {
                jt.log("simplifiedMatch reduced to nothing: " + str);
                sm = str; }
            return sm; }
        function findDupesForSong (song, markplayed) {
            var res = [];
            const mti = simplifiedMatch(song.ti).toLowerCase();
            const mar = simplifiedMatch(song.ar).toLowerCase();
            Object.entries(sbp).forEach(function ([p, s]) {
                if(p !== song.path &&  //original song is not a dupe
                   s.ti.toLowerCase().startsWith(mti) &&
                   s.ar.toLowerCase().startsWith(mar)) {
                    if(markplayed) {
                        //not updating s.pc/fq since not actually played
                        if(!s.lp || s.lp < song.lp) {
                            s.lp = song.lp; } }
                    res.push(s); } });
            return res; }
        function findAllDupes (songs, markplayed) {
            var swd = songs;
            songs.forEach(function (song) {
                swd = swd.concat(findDupesForSong(song, markplayed)); });
            return swd; }
    return {
        setSongsDict: function (sd) { sbp = sd; },
        getSongsDict: function () { return sbp; },
        getSongDupes: function (song) { return findDupesForSong(song); },
        saveSongs: function (songs, trackdupes, contf, errf) {
            if(!Array.isArray(songs)) {
                songs = [songs]; }
            if(trackdupes) {
                songs = songs.concat(findAllDupes(songs, true)); }
            app.svc.saveSongs(songs,
                function (res) {
                    var merged = [];
                        res.forEach(function (updsong) {
                            var path = updsong.path;
                            if(!sbp[path]) {  //non-local absolute path
                                path = "/" + path; }
                            app.copyUpdatedSongData(sbp[path], updsong);
                            merged.push(sbp[path]); });
                        jt.out("modindspan", "");  //turn off "mod" indicator
                        app.top.dispatch("srs", "syncToHub");  //sched sync
                        if(contf) {
                            contf(merged); } },
                errf); }
    };  //end mgrs.sdt returned functions
    }());


    //Working Set manager handles rebuild of eligible songs 
    mgrs.ws = (function () {
        const mxkp = 20;  //max keep for state. notes 28dec22
        const mxdw = 1000;  //max deck working size for computation
        var wrk = {tmo:null, stat:"", resched:false, songs:[], fcs:[],
                   prs:[], wait:50};  //first wait is quick since starting up
        function mostRecentlyPlayedSongs () {
            const thresh = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000))
                  .toISOString();
            var mrps = Object.values(app.svc.songs());
            mrps = mrps.filter((s) => s.lp && s.lp > thresh);
            mrps.sort(function (a, b) {  //most recent song first
                return b.lp.localeCompare(a.lp); });
            return mrps; }
        function initRecentlyPlayedArtists () {
            wrk.rpas = [];
            mostRecentlyPlayedSongs().forEach(function (s) {
                if(wrk.rpas.indexOf(s.ar) < 0) {
                    wrk.rpas.push(s.ar); } });
            wrk.rpas.reverse();   //highest index: most recently played artist
            jt.log("wrk.rpas: ..." + wrk.rpas.slice(-10).join(", ")); }
        function initRecentlyPlayedAlbums () {
            wrk.rpbs = [];
            mostRecentlyPlayedSongs().forEach(function (s) {
                if(wrk.rpbs.indexOf(s.ab) < 0) {
                    wrk.rpbs.push(s.ab); } });
            wrk.rpbs.reverse();   //highest index: most recently played album
            jt.log("wrk.rpbs: ..." + wrk.rpbs.slice(-10).join(", ")); }
        function recentFirst (a, b) {
            if(a.lp && !b.lp) { return -1; }  //unplayed last, thx first
            if(!a.lp && b.lp) { return 1; }
            if(a.lp && b.lp) { return b.lp.localeCompare(a.lp); }
            return 0; }
        function oldestFirst (a, b) {
            if(a.lp && !b.lp) { return 1; }  //unplayed before played
            if(!a.lp && b.lp) { return -1; }
            if(a.lp && b.lp) { return a.lp.localeCompare(b.lp); }
            return 0; }
        function compareOwnership (a, b) {  //fan rec songs first so visible
            const aid = a.dsId || "";
            const bid = b.dsId || "";
            if(aid.startsWith("fr") && !bid.startsWith("fr")) { return 1; }
            if(!aid.startsWith("fr") && bid.startsWith("fr")) { return -1; }
            if(aid.startsWith("fr") && bid.startsWith("fr")) {
                return recentFirst(a, b); }
            return 0; }
        function compareDeckRecent (fld, a, b) {
            const adi = wrk.prs.findIndex((s) => s[fld] === a[fld]);
            const bdi = wrk.prs.findIndex((s) => s[fld] === b[fld]);
            if(adi >= 0 || bdi >= 0) {  //at least one found in deck state
                if(adi < bdi) { return -1; }
                if(adi > bdi) { return 1; } }
            return 0; }
        function compareRecent (fld, recents, a, b) {
            if(wrk.prs.length) {  //use preserved deck state rather than all
                return compareDeckRecent(fld, a, b); }
            const arpi = recents.indexOf(a[fld]);
            const brpi = recents.indexOf(b[fld]);
            if(arpi >= 0 || brpi >= 0) {  //at least one found in recents
                if(arpi < brpi) { return -1; }  //higher idx songs last
                if(arpi > brpi) { return 1; } }
            return 0; }
        function comparePresentation (a, b) {
            return (compareOwnership(a, b) ||
                    compareRecent("ar", wrk.rpas, a, b) ||
                    compareRecent("ab", wrk.rpbs, a, b) ||
                    oldestFirst(a, b)); }
        function filterByFilters (runcounts) {
            if(app.filter.filteringPanelState() === "off") {
                return; }
            app.filter.filters("active").forEach(function (ftr) {
                wrk.songs = wrk.songs.filter((song) => ftr.match(song));
                if(runcounts) {
                    mgrs.ws.appendInfoCount(ftr.actname || ftr.pn); } });
            if(runcounts) {
                wrk.availcount = wrk.songs.length; } }
    return {
        appendInfoCount: function (phasename, count) {
            count = count || wrk.songs.length;
            wrk.fcs.push({filter:phasename, sc:count});
            jt.out("deckfresdiv", jt.tac2html(wrk.fcs.map((fc) =>
                ["div", {cla:"dinfrecdiv"},
                 [["span", {cla:"dinfrectspan"}, fc.filter + ": "],
                  ["span", {cla:"dinfrecnspan"}, String(fc.sc)]]]))); },
        filterSongs: function () {
            if(app.svc.okToPlay) {  //have plat/situation song filtering func
                wrk.songs = wrk.songs.filter((s) => app.svc.okToPlay(s)); }
            wrk.fcs = [];  //clear filter control status messages
            mgrs.ws.appendInfoCount("Readable songs");
            filterByFilters(true); },
        findSongIndex: function (song, songs) {
            return songs.findIndex((s) => 
                ((s.dsId && s.dsId === song.dsId) ||
                 (s.path && s.path === song.path))); },
        refreshDeckSongRefs: function (sbyp) {  //songs by path
            var decksongs = mgrs.dk.songs();  var di;
            for(di = 0; di < decksongs.length && di < mxkp; di += 1) {
                if(sbyp[decksongs[di].path]) {  //use stale if no longer avail
                    decksongs[di] = sbyp[decksongs[di].path]; } } },
        preserveExistingDeckSongs: function () {
            var decksongs = mgrs.dk.songs();  var di; var si; var currsong;
            if(!wrk.rpas) { initRecentlyPlayedArtists(); }
            if(!wrk.rpbs) { initRecentlyPlayedAlbums(); }
            wrk.prs = [];  //reset preserved songs
            for(di = 0; di < decksongs.length && di < mxkp; di += 1) {
                currsong = decksongs[di];
                si = mgrs.ws.findSongIndex(currsong, wrk.songs);
                if(si < 0) { break; }  //deck changed from this index onward
                jt.log("peds " + si + ": " + wrk.songs[si].ti +
                       ", lp: " + wrk.songs[si].lp);
                wrk.prs.push(wrk.songs[si]);
                wrk.songs.splice(si, 1); } },
        shuffleArray: function (arr, startidx, endidx) {  //Fisher-Yates shuffle
            var i; var j; var temp;
            for(i = endidx; i >= startidx; i -= 1) {
                j = Math.floor(Math.random() * i);
                temp = arr[i];
                if(!temp) {  //should never happen, complain loudly
                    throw("arr index " + i + " was undefined"); }
                arr[i] = arr[j];
                arr[j] = temp; } },
        shuffleUnplayed: function () { //All times within a minute are equal
            var chk = {endidx:0};
            if(!wrk.songs.length) { return; }
            chk.thresh = wrk.songs[0].lp || "";
            if(chk.thresh) {
                chk.thresh = new Date(jt.isoString2Time(chk.thresh).getTime() +
                                      (60 * 1000))  //one minute from oldest
                    .toISOString(); }
            while(chk.endidx < wrk.songs.length - 1 &&
                  (!wrk.songs[chk.endidx].dsId ||
                   !wrk.songs[chk.endidx].dsId.startsWith("fr")) &&
                  (!wrk.songs[chk.endidx].lp ||
                   wrk.songs[chk.endidx].lp <= chk.thresh)) {
                chk.endidx += 1; }
            mgrs.ws.shuffleArray(wrk.songs, 0, chk.endidx); },
        shuffleSongs: function () {  //oldest first, artisanal variety
            var first = []; var rest = [];
            var ba = {};  //string keys traverse in insertion order (ES2015)
            wrk.songs.forEach(function (s) {  //oldest songs first
                var artist = s.ar || "Unknown";
                if(!ba[artist]) { ba[artist] = []; }
                ba[artist].push(s); });
            Object.values(ba).forEach(function (songs) {
                first.push(songs.shift());      //oldest song from each artist
                rest = rest.concat(songs); });  //rest of songs from artist
            //leave [0] alone (2nd oldest song), shuffle rest
            mgrs.ws.shuffleArray(rest, 1, rest.length -1);
            wrk.songs = first.concat(rest); },
        presentSongs: function () {
            mgrs.ws.preserveExistingDeckSongs();  //pulled into wrk.prs
            if(!wrk.prs.length) {
                jt.log("Avoiding recently played artists in deck sort"); }
            wrk.songs.sort(comparePresentation);
            mgrs.ws.shuffleUnplayed();  //avoid predictable first song 
            wrk.songs = wrk.songs.slice(0, mxdw);  //truncate to reasonable len
            mgrs.ws.shuffleSongs();  //older songs first, no starvation
            wrk.songs = wrk.prs.concat(wrk.songs); },  //recombine
        updateDeck: function (songs) {
            if(!songs) { return; }  //ignore spurious UI control setup calls
            mgrs.sdt.setSongsDict(songs);
            wrk.songs = [];
            const ssid = app.startParams.songid;
            Object.entries(songs).forEach(function ([p, s]) {
                if(!s.fq || !s.fq.match(/^[DUI]/)) {  //see player.tun.subcats
                    s.path = p;  //used for lookup post update
                    if(ssid && s.dsId === ssid) {
                        wrk.startsong = s; }
                    wrk.songs.push(s); } });
            mgrs.hst.initHistoryIfNeeded(wrk.songs);
            mgrs.ws.filterSongs();
            mgrs.ws.presentSongs();  //slices working set to reasonable length
            if(wrk.startsong) {
                jt.log("updateDeck prepending startsong: " + wrk.startsong.ti);
                wrk.songs.unshift(wrk.startsong);
                wrk.startsong = null;
                app.startParams.songid = ""; }
            mgrs.dk.setSongs(wrk.songs);  //replace working set
            if(wrk.songs.length) {  //let player know songs are available
                app.player.deckUpdated(); }
            setTimeout(function () {  //leave info up momentarily
                mgrs.ddc.togInfoButton(false); }, 800);
            mgrs.sop.displaySongs("dk", "decksongsdiv", wrk.songs);
            wrk.tmo = null;
            wrk.stat = "";
            if(wrk.resched) {
                wrk.resched = false;
                mgrs.ws.rebuild("updateDeck reschedule"); } },
        fetchFailure: function (code, errtxt) {
            jt.err("Song fetch failed " + code + ": " + errtxt);
            mgrs.ws.updateDeck(app.svc.songs()); },  //continue with cached
        rebuildWork: function () {
            wrk.stat = "updating";  //note work has started
            wrk.wait = 1200;  //debounce any filter control movement
            wrk.selview = mgrs.gen.deckstate().disp;
            mgrs.ddc.togInfoButton(true);
            jt.out("deckfresdiv", "Fetching songs...");
            app.svc.fetchSongs(mgrs.ws.updateDeck, mgrs.ws.fetchFailure); },
        rebuild: function (caller) {
            if(!caller) {
                jt.log("mgrs.ws.rebuild unknown caller"); }
            if(!app.filter.filtersReady()) {
                return; }  //ignore spurious calls before filters stabilize
            if(wrk.tmo) {  //already scheduled
                if(wrk.stat) {  //currently running
                    wrk.resched = true;  //note reschedule needed
                    //jt.log("deck rebuild " + caller + " reschedule flagged.");
                    return; }  //don't reschedule now.
                clearTimeout(wrk.tmo); }  //didn't start yet. reschedule
            //jt.log("deck rebuild " + caller + " scheduled.");
            wrk.tmo = setTimeout(mgrs.ws.rebuildWork, wrk.wait); },
        rebuildIfLow: function (caller, redisp) {
            if(wrk.songs.length < 5) {
                mgrs.ws.rebuild(caller); }
            else if(redisp) {  //no rebuild, caller requested refresh
                mgrs.sop.displaySongs("dk", "decksongsdiv", wrk.songs); } },
        rebuildIfChanged: function (caller) {
            const wrklen = wrk.songs.length;
            filterByFilters(false);
            if(wrk.songs.length !== wrklen) {
                mgrs.ws.rebuild(caller); } },
        noteUpdatedSongs: function (updatedsongs) {
            var upds = {};
            updatedsongs.forEach(function (s) { upds[s.dsId] = s; });
            wrk.songs.forEach(function (s) {
                if(upds[s.dsId]) {  //updated
                    app.copyUpdatedSongData(s, upds[s.dsId]); } }); },
        decrementAvailCount: function () {
            wrk.availcount -= 1;
            return wrk.availcount; },
        stableDeckLength: function () { return mxkp; },
        maxDeckWorkingSize: function () { return mxdw; },
        currentDeckSongs: function () { return wrk.songs; }
    };  //end mgrs.ws returned functions
    }());


    //hub service utility manager handles general hub communication processing
    //in support of specific platform svc implementations.
    mgrs.hsu = (function () {
        function writeUpdatedAccount (updacc) {
            var conf = app.svc.dispatch("loc", "getConfig");
            var accts = conf.acctsinfo.accts;
            var aidx = accts.findIndex((a) => a.dsId === updacc.dsId);
            updacc.token = accts[aidx].token;
            accts[aidx] = updacc;
            app.svc.dispatch("loc", "writeConfig", conf, function () {
                jt.log("deck.hsu.writeUpdatedAccount success"); }); }
        function safeSongFieldValue (s, f, t) {
            var val = s[f];
            if(typeof val !== "string") {
                jt.log("safeSongFieldValue correcting " + f + " field for '" +
                       t + "' Song " + s.dsId + " ti: " + s.ti + ", ar: " +
                       s.ar + ", ab: " + s.ab);
                val = String(val);
                if(val === "undefined") {
                    const dflts = {ti:"Unknown", ar:"Unknown", ab:"Singles"};
                    val = dflts[f] || "Bad Field"; } }
            return val; }
        function songFieldComp (a, b, f) {
            var af = safeSongFieldValue(a, f, "a");
            var bf = safeSongFieldValue(b, f, "b");
            //Definitely need case-insensitive to match database storage.
            //Probably best to be lenient about accents also.
            return af.localeCompare(bf, undefined,
                                    {sensitivity:"base"}) === 0; }
        function updateLocalSong (dbo, s) {
            var vc = "Upd";
            var ls = dbo.songs[s.path];
            if(!ls) {  //song was last updated from some other setup
                vc = "Map";
                ls = Object.values(dbo.songs).find((x) =>
                    ((x.dsId === s.dsId) ||
                     (songFieldComp(x, s, "ti") &&
                      songFieldComp(x, s, "ar") &&
                      songFieldComp(x, s, "ab")))); }
            if(!ls) {  //new song from some other setup
                vc = "Nmp";  //not mapped.  Deleted file or bad metadata.
                ls = s; }
            const flds = [
                "modified", "dsId",   //note hub db info locally for sync
                "ti", "ar", "ab",     //if changed elsewhere, reflect here
                "el", "al", "rv",     //update knobs and stars
                "kws", "nt",          //update keywords and notes
                "lp", "pc"];          //copy most recent play info
            if(!(ls.fq.startsWith("D") || ls.fq.startsWith("U"))) {
                flds.push("fq"); }
            flds.forEach(function (fld) { ls[fld] = s[fld]; });
            jt.log("updls " + vc + " " + ls.dsId + ": " + ls.path);
            return ls; }
    return {
        noteSynchronizedAccount: function (updacc) {
            app.top.dispatch("hcu", "deserializeAccount", updacc);
            jt.log("svc.usr.noteUpdatedAccoount musfs: " +
                   JSON.stringify(updacc.musfs));
            writeUpdatedAccount(updacc); },
        updateSynchronizedSongs: function (updsongs) {
            if(updsongs.length) {
                const dbo = app.svc.dispatch("loc", "getDatabase");
                updsongs.forEach(function (s) {
                    updateLocalSong(dbo, s); });
                app.svc.dispatch("loc", "writeSongs"); } }
    };  //end mgrs.hsu returned functions
    }());


    //Song options manager handles actions at the level of specific song
    mgrs.sop = (function () {
        var opts = [{id:"playnow", tt:"Play this song right now",
                     img:"play.png", act:"playnow"},
                    {id:"playnext", tt:"Play this song next",
                     img:"bumpup.png", act:"playnext"},
                    {id:"skipsong", tt:"Skip this song",
                     img:"skipw.png", act:"skip", x:"hst"},
                    {id:"tiredskip", tt:"Note song as tired and skip",
                     img:"snooze.png", act:"snooze", x:"hst"}];
        function amfLink (txt) {
            return jt.tac2html(
                ["a", {href:"#acctinfo",
                       onclick:app.dfs("top", "gen.togtopdlg", ["am", "open"])},
                 txt]); }
        function avrLink () {
            return jt.tac2html(
                ["Add songs, verify app access permission, ",
                 ["a", {href:"#reread",
                        onclick:(app.dfs("svc", "loc.loadLibrary"))},
                  "retry"]]); }
    return {
        optionsTAC: function (mgrnm, idx) {
            var tac = opts.filter((o) => 
                ((!o.x || o.x.indexOf(mgrnm) < 0) &&
                 (o.id !== "playnext" || idx > 0)))
                .map((o) => ["a", {href:"#" + o.id, title:o.tt, cla:"sopa",
                                   onclick:mdfs("sop.dispatchOption", o.act,
                                                mgrnm, idx)},
                             ["img", {src:"img/" + o.img, cla:"ptico"}]]);
            tac.unshift(["a", {href:"#close", title:"dismiss",
                               onclick:mdfs("sop.togOptions", mgrnm, idx)},
                         ["span", {cla:"sopx"}, "x"]]);
            return tac; },
        togOptions: function  (mgrnm, idx) {
            var optdivid = "da" + mgrnm + idx;
            if(jt.byId(optdivid).innerHTML)  { //remove content to close
                return jt.out(optdivid, ""); }
            const playerr = mgrs.hst.playbackError(mgrnm, idx);
            if(playerr) {
                return jt.out(optdivid, playerr); }
            jt.out(optdivid, jt.tac2html(mgrs.sop.optionsTAC(mgrnm, idx))); },
        dispatchOption: function (action, mgrnm, idx) {
            mgrs.sop.togOptions(mgrnm, idx);  //remove actions overlay
            mgrs.dk[action](mgrnm, idx); },   //do clicked action
        tiRateStyle: function (song) {
            if(song.kws || song.el !== 49 || song.al !== 49) {
                return "font-weight:bold;"; }
            return ""; },
        songIdentHTML: function (song) {
            var idh = [["span", {cla:"dstispan", "data-dsId":song.dsId,
                                 style:mgrs.sop.tiRateStyle(song)},
                        song.ti],
                       " - ",
                       ["span", {cla:"dsarspan"}, song.ar || "Unknown"]];
            if(song.ab) {
                idh.push(" - ");
                idh.push(["span", {cla:"dsabspan"}, song.ab || ""]); }
            if(song.dsId && song.dsId.startsWith("fr")) {
                idh[0][2] = "+" + idh[0][2]; }
            return jt.tac2html(idh); },
        noMatchingSongsHelp: function () {
            var msgs = ["No matching songs found"];
            //modify filtering
            const filts = app.filter.filters("active");
            if(filts.some((f) => f.actname && f.actname.match(/[+\-]/g))) {
                msgs.push("Try turning off keyword filters"); }
            else if(filts.some((f) =>
                f.rgfoc && (f.rgfoc.max - f.rgfoc.min < 80))) {
                msgs.push("Try wider energy level and approachability"); }
            //extend library and/or add a fan to help
            else if(app.svc.dispatch("gen", "plat", "hdm") === "web") {
                app.top.dispatch("webla", "spimpNeeded", "nosongs");
                msgs.push(amfLink("Add a fan to find more music")); }
            //add more local playable songs and allow access to them
            else {
                msgs.push(avrLink()); }
            return jt.tac2html([msgs.join(". ") + ".",
                                ["div", {id:"nomusicstatdiv"}]]); },
        displaySongs: function (mgrnm, divid, songs) {
            if(!songs.length) {
                return jt.out(divid, mgrs.sop.noMatchingSongsHelp()); }
            const songsdiv = jt.byId(divid);
            songsdiv.innerHTML = "";
            songs.forEach(function (song, idx) {
                var sd = document.createElement("div");
                sd.className = "decksongdiv";
                sd.innerHTML = jt.tac2html(
                    ["div", {cla:"songtitlediv"},
                     [["a", {href:"#songactions", title:"Show song options",
                             onclick:mdfs("sop.togOptions", mgrnm, idx)},
                       mgrs.sop.songIdentHTML(song)],
                      ["div", {cla:"decksongactdiv",
                               id:"da" + mgrnm + idx}]]]);
                songsdiv.appendChild(sd); }); }
    };  //end mgrs.sop returned functions
    }());


    //Deck manager handles actions affecting what's on deck to play.
    mgrs.dk = (function () {
        var ds = [];  //deck songs
    return {
        songs: function () { return ds; },
        setSongs: function (songs, upds) {  //rebuild deck display with songs
            ds = songs;
            if(upds) { //make array of all deck songs in upds, remove nulls
                ds = (ds.map((s) => upds[s.path])).filter((s) => s); }
            jt.log("dk.setSongs " + ds.slice(0, 7).map((s) => s.ti).join(", "));
            mgrs.sop.displaySongs("dk", "decksongsdiv", ds); },
        songByIndex: function (idx) { return ds[idx]; },
        playSongNow: function (song) {
            ds = ds.filter((s) => s.path !== song.path);
            ds.unshift(song);
            app.player.next(); },
        playnow: function (mgrnm, idx) {
            mgrs.dk.playSongNow(mgrs[mgrnm].songByIndex(idx)); },
        playnext: function (mgrnm, idx) {
            var song = mgrs[mgrnm].songByIndex(idx);
            ds = ds.filter((s) => s.path !== song.path);
            song.bumped = true;
            for(idx = 0; idx < ds.length; idx += 1) {
                if(!ds[idx].bumped) {
                    ds.splice(idx, 0, song);
                    break; } }
            mgrs.sop.displaySongs("dk", "decksongsdiv", ds); },
        skip: function (ignore /*mgrnm*/, idx) {
            mgrs.dk.markAsPlayedAndMoveToHistory(idx); },
        snooze: function (ignore /*mgrnm*/, idx) {
            var song = ds[idx];
            app.player.dispatch("tun", "bumpTired", song);
            mgrs.dk.markAsPlayedAndMoveToHistory(idx); },
        markAsPlayedAndMoveToHistory: function (idx) {
            var song = ds[idx];
            mgrs.dk.markSongPlayed(song);
            ds.splice(idx, 1);
            mgrs.sop.displaySongs("dk", "decksongsdiv", ds); },
        markSongPlayed: function (song) {
            song.lp = new Date().toISOString();
            song.pc = (song.pc || 0) + 1;
            if(song.fq === "N") { song.fq = "P"; }
            mgrs.hst.noteSongPlayed(song);
            app.deck.saveSongs(song, true); },
        markMultipleSongsPlayed: function (count, contf, errf) {
            count = Math.min(count, ds.length);
            const pss = ds.splice(0, count);
            pss.forEach(function (song) {
                song.lp = new Date().toISOString();
                mgrs.hst.noteSongPlayed(song); });
            app.svc.dispatch("gen", "updateMultipleSongs", pss, function () {
                mgrs.sop.displaySongs("dk", "decksongsdiv", ds);
                contf(); }, errf); },
        removeFromDeck: function (sp) {  //song path
            ds = ds.filter((s) => s.path !== sp);
            mgrs.sop.displaySongs("dk", "decksongsdiv", ds); },
        insertAtTop: function (song) {
            ds = [song, ...ds.filter((s) => s.path !== song.path)];
            mgrs.sop.displaySongs("dk", "decksongsdiv", ds); },
        popSongFromDeck: function () {
            var song = null;
            if(ds.length) {
                song = ds.shift();
                if(song.bumped) { delete song.bumped; }
                app.player.noteprevplay(song.lp);
                mgrs.dk.markSongPlayed(song); }
            mgrs.sop.displaySongs("dk", "decksongsdiv", ds);
            return song; },
        popForward: function (npp) {  //now playing path
            const idx = ds.findIndex((s) => s.path === npp);
            if(idx >= 0) {
                ds = ds.slice(idx + 1);
                mgrs.sop.displaySongs("dk", "decksongsdiv", ds);
                return ds; }
            return null; }
    };  //end of mgrs.dk returned functions
    }());


    //factored utility functions
    mgrs.util = (function () {
    return {
        makeToggle: function (spec) {
            var div = jt.byId(spec.id);
            div.style.display = "inline-block";
            div.style.position = "relative";
            spec.w = spec.w || 20;
            spec.h = spec.h || 20;
            div.style.height = spec.h + "px";
            div.style.width = spec.w + "px";
            div.style.verticalAlign = "middle";
            div.style.cursor = "pointer";
            div.title = spec.ti;
            const opas = {onimg:0.0, offimg:1.0};
            const imgstyle = "position:absolute;top:0px;left:0px;" +
                "width:" + spec.w + "px;" + "height:" + spec.h + "px;";
            div.innerHTML = jt.tac2html(
                [["img", {cla:"ico20", id:spec.id + "onimg", src:spec.onimg,
                          style:imgstyle + "opacity:" + opas.onimg}],
                 ["img", {cla:"ico20", id:spec.id + "offimg", src:spec.offimg,
                          style:imgstyle + "opacity:" + opas.offimg}]]);
            spec.tfc[spec.id] = function (activate, reflectonly) {
                var onimg = jt.byId(spec.id + "onimg");
                var offimg = jt.byId(spec.id + "offimg");
                if(activate) {
                    div.dataset.togstate = "on";
                    onimg.style.opacity = 1.0;
                    offimg.style.opacity = 0.0;
                    if(!reflectonly) {
                        spec.togf(true); } }
                else {  //turn off
                    div.dataset.togstate = "off";
                    onimg.style.opacity = 0.0;
                    offimg.style.opacity = 1.0;
                    if(!reflectonly) {
                        spec.togf(false); } } };
            jt.on(div, "click", function (ignore /*event*/) {
                var offimg = jt.byId(spec.id + "offimg");
                spec.tfc[spec.id](offimg.style.opacity > 0); }); },
        setPanelResultHeight: function (targname, headername) {
            const pdd = jt.byId("pandeckdiv").offsetHeight;
            const dhd = jt.byId("deckheaderdiv").offsetHeight;
            var avh = pdd - dhd - 20;  //panel 14 pad and 6 margin
            if(headername) {
                avh -= jt.byId(headername).offsetHeight; }
            jt.byId(targname).style.height = avh + "px"; }
    };  //end mgrs.util returned functions
    }());


    //Deck Display Control manager handles overall display components
    mgrs.ddc = (function () {
        var toggleButtons = {};
        function updateDeckDisplay () {
            if(!mgrs.gen.dataLoadCompleted()) {
                jt.out("deckfresdiv", "Waiting on initial data load"); } }
    return {
        getSaveState: function (dmx) {  //dmx is >= 0
            return {det:mgrs.dk.songs().slice(0, dmx)}; },
        restoreFromSavedState: function (state, songs) {
            mgrs.dk.setSongs(state.det, songs); },
        getSettings: function () { return {}; },
        restoreSettings: function () { return; },
        getQueuedSongs: function (includeContextSongs, sqmax) {
            var songs = mgrs.dk.songs().slice(0, sqmax);
            if(includeContextSongs) {  //include currently playing song
                const nowplayingsong = app.player.song();
                if(nowplayingsong) {
                    songs.unshift(nowplayingsong);
                    songs = songs.slice(0, songs.length - 1); } }
            return songs; },
        endedDueToSleep: function () {  //can click to resume if more songs
            return mgrs.dk.songs().length; },
        getNextSong: function () {
            return mgrs.dk.popSongFromDeck(); },
        popForward: function (npp) {
            return mgrs.dk.popForward(npp); },
        songDataChanged: function (caller) {
            return mgrs.ws.rebuild(caller); },
        makeHistoryToggle: function () {  //created by filter
            mgrs.util.makeToggle({
                tfc:toggleButtons, id:"toghistb", ti:"Playback History",
                onimg:"img/historyact.png", offimg:"img/history.png",
                togf:function (state) {
                    if(!state) {
                        jt.byId("deckhistorydiv").style.display = "none";
                        jt.byId("decksongsdiv").style.display = "block"; }
                    else {
                        jt.byId("deckhistorydiv").style.display = "block";
                        jt.byId("decksongsdiv").style.display = "none";
                        mgrs.hst.verifyDisplayContent(); } }}); },
        makeInfoToggle: function () {  //created by filter
            mgrs.util.makeToggle({
                tfc:toggleButtons, id:"toginfob", ti:"Filtering Information",
                onimg:"img/infoact.png", offimg:"img/info.png",
                togf:function (state) {
                    const disp = (state ? "block" : "none");
                    jt.byId("deckfresdiv").style.display = disp; }}); },
        togInfoButton: function (activate) {
            toggleButtons.toginfob(activate); },
        initDisplay: function () {
            jt.out("ddcdispdiv", jt.tac2html(
                [["div", {id:"panfiltdiv"}],
                 ["div", {id:"ddccontentdiv"},
                  [["div", {id:"decksongsdiv"}],
                   ["div", {id:"deckhistorydiv"}],
                   ["div", {id:"fresframediv"},
                    ["div", {id:"deckfresdiv"}]]]]]));
            app.filter.initializeInterface(); },
        activateDisplay: function () {
            if(!jt.byId("panfiltdiv")) {
                mgrs.ddc.initDisplay(); }
            mgrs.gen.setSongSeqMgrName("ddc");
            mgrs.util.setPanelResultHeight("decksongsdiv", "panfiltdiv");
            updateDeckDisplay(); }
    };  //end mgrs.ddc returned functions
    }());


    //Album manager handles album info and playback
    mgrs.alb = (function () {
        var toggleButtons = {};
        var cak = "";  //current album key
        var aid = {};  //album info dict (idx, songs, etc by album key)
        var sacsr = null;  //suggested albums calc song ref
        var playFromTop = false;  //flag to play whole album from the top
        var asgs = [];   //suggested albums
        const asgmx = 5;  //album suggestion max. Fast scan. Otheriwse search
        function makeAlbumKey (song) {
            if(!(song.ar && song.ab)) { return ""; }
            return song.ar + " - " + song.ab; }
        function improveSuggestionsOrder () {
            var frsh = []; var rest = []; const arts = {};
            if(asgs.length && asgs[0].npsc <= 2) {  //no unplayed albums avail
                asgs = asgs.slice(0, 50);
                mgrs.ws.shuffleArray(asgs, 0, asgs.length - 1); }
            asgs.forEach(function (asc, idx) {
                if(!arts[asc.songs[0].ar]) {
                    arts[asc.songs[0].ar] = idx + 1;
                    frsh.push(asc); }
                else {
                    rest.push(asc); } });
            mgrs.ws.shuffleArray(rest, 0, rest.length - 1);
            asgs = frsh.concat(rest); }
        function initialAlbumSuggestionCount(albumkey) {
            return {ci:0, songs:[], src:"asc", ak:albumkey,
                    npsc:0,  //never played song count
                    mrpt:"1970-01-01T00:00:00Z"}; } //most recently played time
        function getSuggestedAlbums () {
            const np = app.player.song();
            if(asgs.length && sacsr && np && sacsr.path === np.path) {
                return asgs; }  //previous calcs still valid
            Object.keys(aid).forEach(function (ak) {
                if(aid[ak].src === "asc") {  //reset all previous counts
                    aid[ak] = initialAlbumSuggestionCount(ak); } });
            Object.values(mgrs.sdt.getSongsDict()).forEach(function (song) {
                if((!song.fq || !song.fq.match(/^[RDUI]/)) &&  //is eligible
                   (song.rv >= 3)) {  //not rated as bad
                    const key = makeAlbumKey(song);
                    aid[key] = aid[key] || initialAlbumSuggestionCount(key);
                    aid[key].songs.push(song);
                    if(!song.pc || !song.lp) {  //not played yet
                        aid[key].npsc += 1; }
                    if(song.lp > aid[key].mrpt) {
                        aid[key].mrpt = song.lp; } } });
            asgs = Object.values(aid).filter((asg) => asg.src === "asc");
            asgs.sort(function (a, b) {
                if(a.songs[0].ar !== "Unknown" &&
                   b.songs[0].ar === "Unknown") { return -1; }
                if(a.songs[0].ar === "Unknown" &&
                   b.songs[0].ar !== "Unknown") { return 1; }
                if(a.npsc > 2 && a.npsc > b.npsc) { return -1; }
                if(b.npsc > 2 && b.npsc > a.npsc) { return 1; }
                if(a.mrpt < b.mrpt) { return -1; }
                if(a.mrpt > b.mrpt) { return 1; }
                return 0; });
            improveSuggestionsOrder();
            asgs = asgs.slice(0, asgmx);
            return asgs; }
        function displaySuggestedAlbums () {
            const sas = getSuggestedAlbums();
            if(!sas || !sas.length) {
                return jt.out("albsuggsdiv", "No albums available."); }
            jt.out("albsuggsdiv", jt.tac2html(
                [["div", {id:"albsuggstitlediv"}, "Suggested Albums"],
                 ["div", {id:"albsuggscontentdiv"},
                  sas.slice(0, asgmx).map((sa, idx) =>
                      ["div", {cla:"sgalbdiv"},
                       ["a", {href:"#play",
                              onclick:mdfs("alb.playSuggestedAlbum", idx)},
                        [["span", {cla:"sgalbarspan"},
                          sa.songs[0].ar],
                         "&nbsp;-&nbsp;",
                         ["span", {cla:"sgalbabspan"},
                          sa.songs[0].ab]]]])]])); }
        function updateAlbumDisplay (song) {
            var np = song || app.player.song();
            if(!np && aid[cak] && aid[cak].src === "pmq") {
                np = aid[cak].songs[aid[cak].ci]; }
            if(!np) {
                return jt.out("albplaydiv", "No song currently playing"); }
            cak = makeAlbumKey(np);
            if(!cak) {
                return jt.out("albplaydiv", "Album info not available"); }
            if(!aid[cak] || aid[cak].src !== "pmq") {
                //get platform song order and included songs in case different
                jt.out("albplaydiv", "Fetching album info...");
                return app.svc.fetchAlbum(np, mgrs.alb.setAlbumSongs,
                                          mgrs.alb.albumFetchFailure); }
            if(!aid[cak].songs || !aid[cak].songs.length) {
                return jt.out("albplaydiv", "No album info for song"); }
            //currently playing song may have changed via external action
            if(playFromTop) {
                aid[cak].ci = 0; }
            else {
                aid[cak].ci = mgrs.ws.findSongIndex(np, aid[cak].songs); }
            mgrs.alb.displayAlbum(np);
            if(playFromTop) {
                playFromTop = false;
                mgrs.alb.playnow(0); } }
    return {
        getSaveState: function (dmx) {  //dmx is >= 0
            const abst = {key:cak, info:aid[cak]};
            if(abst.info && abst.info.songs && dmx < abst.info.songs.length) {
                abst.info = {ci:abst.info.ci,
                             songs:abst.info.songs.slice(0, dmx)}; }
            return abst; },
        restoreFromSavedState: function (state, songs) {
            var upds = state.info.songs;
            if(songs) {  //make array of all given songs in upds, remove nulls
                upds = (upds.map((s) => upds[s.path])).filter((s) => s); }
            state.info.songs = upds;
            cak[state.key] = state.info; },
        getSettings: function () {
            const settings = {currentAlbumKey:cak};
            if(aid[cak] && aid[cak].src === "pmq") {
                settings.index = aid[cak].ci;
                settings.song = aid[cak].songs[settings.index]; }
            return settings; },
        restoreSettings: function (settings) {
            if(settings.currentAlbumKey && settings.song) {
                updateAlbumDisplay(settings.song);  //get full album info
                if(aid[cak].ci > 0) {  //back up to previous song so player
                    aid[cak].ci -= 1;  //starts where it left off last time
                    mgrs.alb.displayAlbum(aid[cak].songs[aid[cak].ci]); }
                else {  //set up so getNextSong plays the first track
                    aid[cak].ci = -1; } } },
        haveUnplayedAlbums: function () {
            const sa = getSuggestedAlbums();
            return (sa && sa.length && sa[0].npsc >= 2); },
        getQueuedSongs: function (includeContextSongs, sqmax) {
            var songs = [];
            if(aid[cak] && aid[cak].src === "pmq") {
                songs = aid[cak].songs;
                sqmax += aid[cak].ci + 1;  //sleep count relative to curr song
                songs = songs.slice(0, sqmax);
                if(!includeContextSongs) {
                    songs = songs.slice(aid[cak].ci + 1); } }
            return songs; },
        endedDueToSleep: function () {  //can click to resume if more alb tracks
            return (aid[cak] && aid[cak].src === "pmq" &&
                    aid[cak].ci < aid[cak].songs.length - 2); },
        songs: function () { return aid[cak].songs; },
        songByIndex: function (idx) { return aid[cak].songs[idx]; },
        setAlbumSongs: function (fetchsong, albumsongs) {
            const key = makeAlbumKey(fetchsong);
            aid[key] = { ci:mgrs.ws.findSongIndex(fetchsong, albumsongs),
                         songs:albumsongs, src:"pmq"};  //platform media query
            updateAlbumDisplay(aid[key].songs[aid[key].ci]); },
        albumFetchFailure: function (code, errtxt) {
            jt.out("albplaydiv", "Album fetch failed: " + code + ": " +
                   errtxt); },
        togSuggestAlbums: function (disp) {
            toggleButtons.togsuggb(disp); },
        playSuggestedAlbum: function (idx) {
            mgrs.alb.playAlbum(asgs[idx].songs[0]); },
        playAlbum: function (song) {
            mgrs.alb.togSuggestAlbums(false);
            playFromTop = true;
            updateAlbumDisplay(song); },
        songDataChanged: function (/*caller*/) {
            asgs = [];
            if(jt.byId("albsuggsdiv").style.display === "block") {
                displaySuggestedAlbums(); } },
        makeAlbumSongDiv: function (song, idx) {
            if(idx === aid[cak].ci) {
                return [["img", {src:"img/arrow12right.png",
                                 cla:"albumarrow"}],
                        song.ti]; }
            const tn = idx + 1;  //track number
            return ["a", {href:"#playsong" + tn, title:"Play track " + tn,
                          cla:"albumsonglink",
                          //dk handles history and deck bookkeeping
                          onclick:mdfs("alb.playnow", idx)},
                    song.ti]; },
        displayAlbum: function (np) {
            jt.out("albplaydiv", jt.tac2html(
                [["div", {cla:"albumtitlediv"},
                  [["span", {cla:"dsabspan"}, np.ab],
                   " - ",
                   ["span", {cla:"dsarspan"}, np.ar]]],
                 aid[cak].songs.map((song, idx) =>
                     mgrs.alb.makeAlbumSongDiv(song, idx))])); },
        playnow: function (idx) {
            aid[cak].ci = idx - 1;
            app.player.next(); },
        getNextSong: function () {
            if(!aid[cak] && asgs.length) {  //starting up from scratch,
                return null; }              //choose and album to start.
            if(!aid[cak]) {  //most likely a failed restore at startup
                jt.log("mgrs.alb.getNextSong no album so switching to ddc");
                mgrs.gen.dispMode("ddc");
                return mgrs.ddc.getNextSong(); }
            if(aid[cak].ci < aid[cak].songs.length - 1) {
                aid[cak].ci += 1;
                const song = aid[cak].songs[aid[cak].ci];
                app.player.noteprevplay(song.lp);
                mgrs.dk.markSongPlayed(song);
                mgrs.dk.removeFromDeck(song);
                mgrs.alb.displayAlbum(song);
                mgrs.gen.saveSettings();  //note updated playback position
                return song; }
            return null; },
        onLastTrack: function () {
            const ab = aid[cak];
            return (!ab || ab.ci >= ab.songs.length - 1); },
        popForward: function (npp) {
            mgrs.dk.removeFromDeck(npp);  //excise from deck if in it
            const idx = aid[cak].songs.findIndex((s) => s.path === npp);
            if(idx < 0) {  //no longer playing album
                mgrs.gen.dispMode("ddc");
                return null; }
            aid[cak].ci = idx;
            const song = aid[cak].songs[idx];
            mgrs.alb.displayAlbum(song);
            return song; },
        initDisplay: function () {
            jt.out("albdispdiv", jt.tac2html(
                [["div", {id:"albsuggsframediv"},
                  ["div", {id:"albsuggsdiv", style:"display:none"}]],
                 ["div", {id:"albsuggtogdiv"},
                  ["div", {id:"togsuggb"}]],
                 ["div", {id:"albplaydiv"}]]));
            mgrs.util.makeToggle({
                tfc:toggleButtons, id:"togsuggb", ti:"Album Suggestions",
                onimg:"img/suggestact.png", offimg:"img/suggest.png",
                togf:function (state) {
                    const disp = (state ? "block" : "none");
                    jt.byId("albsuggsdiv").style.display = disp;
                    if(state) {
                        displaySuggestedAlbums(); }}}); },
        activateDisplay: function () {
            if(!jt.byId("albsuggtogdiv")) {
                mgrs.alb.initDisplay(); }
            mgrs.gen.setSongSeqMgrName("alb");
            mgrs.util.setPanelResultHeight("albplaydiv");
            updateAlbumDisplay(); }
    };  //end of mgrs.alb returned functions
    }());


    //Search manager handles search the search display
    mgrs.srch = (function () {
        var qstr = "";  //current query string
        var songs = null;
        var rslt = null;
        var sfds = [
            {f:"ar", pn:"Artist", ck:true},
            {f:"ab", pn:"Album", ck:true},
            {f:"ti", pn:"Title", ck:true},
            {f:"nt", pn:"Notes", ck:true}];
        function searchSongs () {
            if(!songs) {
                songs = Object.values(mgrs.sdt.getSongsDict())
                    .filter((s) => !s.fq || !s.fq.match(/^[DUI]/)); }
            const rtx = "(\\s|^)" + qstr.toLowerCase().replace("*", ".*");
            const srx = new RegExp(rtx, "i");
            const sfs = sfds.filter((fd) => fd.ck);
            rslt = {};  //reset search results
            songs.forEach(function (s, idx) {
                const mf = sfs.find((fd) => s[fd.f] && s[fd.f].match(srx));
                if(mf) {  //one of the fields matched, verify rslt entry
                    rslt[s.ar] = rslt[s.ar] ||
                        {matched:(mf.f === "ar"),
                         t:"ar", si:idx, es:{}};
                    const artist = rslt[s.ar];
                    artist.es[s.ab] = artist.es[s.ab] ||
                        {matched:(mf.f === "ab" || s.ab.match(srx)),
                         t:"ab", si:idx, es:{}};
                    const album = artist.es[s.ab];
                    album.es[s.ti] = album.es[s.ti] ||  //dupe possible
                        {matched:(mf.f === "ti" || s.ti.match(srx) ||
                                  mf === "nt" || s.ti.match(srx)),
                         t:"ti", si:idx}; } }); }
        function makeResultTAC (dict, parentMatched) {
            const sks = Object.keys(dict).sort(
                function (a, b) { return a.localeCompare(b); });
            return sks.map(function (fv) {
                const det = dict[fv];
                const dln = {xpc:"",
                             val:["span", {cla:"srchresvspan"}, fv],
                             esdd:"block"};
                if(det.es) {  //need an expand/close control
                    dln.xpc = ["a", {cla:"srchxpctoga", href:"#close",
                                     onclick:mdfs("srch.togResExp", "event")},
                               "-"];
                    if(det.matched || parentMatched) {
                        dln.esdd = "none";
                        dln.xpc[1].href = "#expand";
                        dln.xpc[2] = "+"; } }
                if(det.matched) {  //bold the entry val
                    dln.val[1].cla = "srchresmatchvspan"; }
                if(det.t === "ab") {
                    dln.val = ["a", {href:"#playalbum",
                                     onclick:mdfs("srch.playAlbum", det.si)},
                               dln.val]; }
                if(det.t === "ti") {
                    dln.val = ["a", {href:"playsong",
                                     title:jt.escq(songs[det.si].path),
                                     onclick:mdfs("srch.playSong", det.si)},
                               dln.val]; }
                return ["div", {cla:"rslt" + det.t + "div"},
                        [dln.xpc,
                         dln.val,
                         (!det.es? "" : 
                          ["div", {cla:"rslt" + det.t + "childrendiv",
                                   style:"display:" + dln.esdd},
                           makeResultTAC(det.es, det.matched)])]]; }); }
    return {
        getSaveState: function (/*dmx*/) {
            return {searchText:qstr, searchFields:sfds}; },
        restoreFromSavedState: function (state) {
            qstr = state.searchText;
            sfds = state.searchFields; },
        getSettings: function () {
            return {searchText:qstr}; },
        restoreSettings: function (settings) {
            qstr = settings.searchText; },
        playAlbum: function (sidx) {
            mgrs.gen.dispMode("alb");
            mgrs.alb.playAlbum(songs[sidx]); },
        playSong: function (sidx) {
            mgrs.gen.dispMode("ddc");
            mgrs.dk.playSongNow(songs[sidx]); },
        togResExp: function (event) {
            const lnk = event.target;
            if(lnk.href.endsWith("#close")) {
                lnk.href = "#expand";
                lnk.innerHTML = "+"; }
            else {
                lnk.href = "#close";
                lnk.innerHTML = "-"; }
            const rsltdiv = lnk.parentElement;
            const rselems = Array.from(rsltdiv.children);
            const es = rselems[rselems.length - 1];
            if(es.style.display === "none") {
                es.style.display = "block"; }
            else {
                es.style.display = "none"; }
            jt.evtend(event); },
        updateSearchDisplay: function () {
            qstr = jt.byId("srchin").value || "";
            qstr = qstr.toLowerCase().trim();
            if(qstr) {  //show clear "x"
                jt.byId("clrsrchdiv").style.display = "inline-block"; }
            else {
                jt.byId("clrsrchdiv").style.display = "none"; }
            searchSongs();
            jt.out("srchresdiv", jt.tac2html(makeResultTAC(rslt))); },
        songDataChanged: function (/*caller*/) {
            songs = null;  //re-read of media lib may new music or metadata
            mgrs.srch.updateSearchDisplay(); },
        clearSearch: function () {
            jt.byId("srchin").value = "";
            mgrs.srch.updateSearchDisplay(); },
        fcheckchg: function (idx) {
            sfds[idx].ck = !sfds[idx].ck;
            mgrs.srch.updateSearchDisplay(); },
        initDisplay: function () {
            jt.out("srchdispdiv", jt.tac2html(
                [["div", {id:"srchctrlsdiv"},
                  [["input", {type:"text", id:"srchin", size:20,
                              //placeholder:"artist/album/song...",
                              value:qstr,
                              oninput:mdfs("srch.updateSearchDisplay")}],
                   ["div", {id:"clrsrchdiv", style:"display:none"},
                    ["a", {href:"#clearsearch", title:"Clear search",
                           onclick:mdfs("srch.clearSearch")}, "x"]],
                   ["div", {id:"srchfieldsdiv"},
                    sfds.map((fd, idx) =>
                        ["div", {cla:"srchfcbdiv"},
                         [["input", {type:"checkbox", id:"sfcb" + fd.f + "in",
                                     value:fd.f, checked:jt.toru(fd.ck),
                                     onchange:mdfs("srch.fcheckchg", idx)}],
                          ["label", {fo:"sfcb" + fd.f + "in"}, fd.pn]]])]]],
                 ["div", {id:"srchresdiv"}]])); },
        activateDisplay: function () {
            if(!jt.byId("srchctrlsdiv")) {
                mgrs.srch.initDisplay(); }
            mgrs.util.setPanelResultHeight("srchresdiv", "srchctrlsdiv");
            mgrs.srch.updateSearchDisplay(); }
    };  //end mgrs.srch returned functions
    }());


    //History manager holds functions related to history update and tracking.
    mgrs.hst = (function () {
        var pps = [];  //previously played songs
    return {
        songs: function () { return pps; },
        songByIndex: function (idx) { return pps[idx]; },
        playbackError: function (prefix, idx) {
            var playerr = "";
            if(prefix === "hst") {
                const song = pps[idx];
                playerr = app.player.playerr(song.path); }
            return playerr; },
        noteSongPlayed: function (song) {
            pps = pps.filter((s) => s.path !== song.path);
            pps.unshift(song); },
        verifyDisplayContent: function () {
            if(!pps.length) {
                return jt.out("deckhistorydiv", "No songs played yet"); }
            mgrs.sop.displaySongs("hst", "deckhistorydiv", pps); },
        initHistoryIfNeeded: function (songs) {
            if(!pps.length) {
                pps = Object.values(songs)
                    .filter((song) => song.lp)
                    .sort(function (a, b) {
                        return b.lp.localeCompare(a.lp); })
                    .slice(0, 100); } },
        rebuildHistory: function () {
            var songs = [];
            Object.entries(app.svc.songs()).forEach(function ([p, s]) {
                if(!s.fq || !s.fq.match(/^[DUI]/)) {  //see player.tun.subcats
                    s.path = p;  //used for lookup post update
                    songs.push(s); } });
            pps = [];
            mgrs.hst.initHistoryIfNeeded(songs); }
    };  //end mgrs.hst returned functions
    }());


    //general manager is main interface for the module
    mgrs.gen = (function () {
        var mdms = [   //major display modes
            {mgr:"ddc", name:"Deck", img:"deck.png"},
            {mgr:"alb", name:"Album", img:"album.png"},
            {mgr:"srch", name:"Search", img:"search.png"}];
        var dataLoadCompleted = null;
        var songSeqMgrName = mdms[0].mgr;
        function restoreSettings () {  //read from acct not filter init
            const ca = app.top.dispatch("aaa", "getAccount");
            if(ca && ca.settings && ca.settings.deck) {
                const ds = ca.settings.deck;
                songSeqMgrName = ds.ssmn;
                mdms.forEach(function (dm) {
                    mgrs[dm.mgr].restoreSettings(ds[dm.mgr]); }); } }
        function minutesSinceLastSongPlay () {
            var mrt = "";  //most recent timestamp
            Object.values(app.svc.songs()).forEach(function (s) {
                if(s.lp && s.lp > mrt) {
                    mrt = s.lp; } });
            if(!mrt) {
                return -1; }
            const diffms = Date.now() - jt.isoString2Time(mrt).getTime();
            return Math.round(diffms / (60 * 60 * 1000)); }
        function chooseActiveDisplay () {
            if(songSeqMgrName === "ddc") {
                const mslsp = minutesSinceLastSongPlay();
                if((mslsp < 0 || mslsp > 120) &&
                   (mgrs.alb.haveUnplayedAlbums())) {
                    mgrs.gen.dispMode("alb");
                    mgrs.alb.togSuggestAlbums(true); } }
            else if((songSeqMgrName === "alb") &&
                    (mgrs.alb.onLastTrack())) {
                mgrs.alb.togSuggestAlbums(true); }
            mgrs.gen.dispMode(songSeqMgrName); }
        function simplifiedSongInfo (song) {
            return {ti:song.ti, ar:song.ar, path:song.path}; }
    return {
        dataLoadCompleted: function () { return dataLoadCompleted; },
        songSeqMgrName: function () { return songSeqMgrName; },
        setSongSeqMgrName: function (mgr) { songSeqMgrName = mgr; },
        saveSettings: function () {  //filter holds/sets all settings
            const settings = app.filter.dispatch("stg", "settings");
            settings.deck = {ssmn:songSeqMgrName};
            mdms.forEach(function (dm) {
                settings.deck[dm.mgr] = mgrs[dm.mgr].getSettings(); });
            app.filter.dispatch("stg", "saveSettings"); },
        dispMode: function (mgrname) {
            mdms.forEach(function (dm) {
                jt.byId(dm.mgr + "mdmbdiv").className = "mdmbdiv";
                jt.byId(dm.mgr + "dispdiv").style.display = "none"; });
            jt.byId(mgrname + "mdmbdiv").className = "mdmbdivact";
            jt.byId(mgrname + "dispdiv").style.display = "block";
            mgrs[mgrname].activateDisplay();
            mgrs.gen.saveSettings(); },
        initDisplay: function () {
            jt.out("pandeckdiv", jt.tac2html(
                [["div", {id:"deckheaderdiv"},
                  mdms.map((dm) =>
                      ["div", {cla:"mdmbdiv", id:dm.mgr + "mdmbdiv",
                               onclick:mdfs("gen.dispMode", dm.mgr)},
                       ["img", {cla:"mdmbimg", title:dm.name,
                                src:"img/" + dm.img,
                                onclick:mdfs("gen.dispMode", dm.mgr)}]])],
                 ["div", {id:"deckcontentdiv"},
                  mdms.map((dm) =>
                      ["div", {cla:"mdmdispdiv", id:dm.mgr + "dispdiv",
                               style:"display:none;"}])]]));
            mdms.forEach(function (dm) {
                if(mgrs[dm.mgr].initDisplay) { mgrs[dm.mgr].initDisplay(); }});
            mgrs.gen.songSeqMgrName(mdms[0].mgr); //interim until data loaded
            mgrs.gen.dispMode(mdms[0].mgr); },    //interim until data loaded
        getPlaybackState: function (includeContextSongs, fmt) {
            var sqmax = 200;  //approximately 6+ hrs of songs to queue up
            sqmax = app.player.dispatch("slp", "limitToSleepQueueMax", sqmax);
            const songs = mgrs[songSeqMgrName].getQueuedSongs(
                includeContextSongs, sqmax);
            //copy needed song info to avoid any interaction with live data
            const ret = {dbts:app.svc.dispatch("loc", "getDatabase").dbts,
                         qsi:songs.map((s) => simplifiedSongInfo(s))};
            if(fmt !== "ssd") {  //return paths if not simplified song details
                ret.qsi = ret.qsi.map((s) => s.path); }
            return ret; },
        endedDueToSleep: function () {
            //guess if app independent mobile playback stopped due to sleep
            return mgrs[songSeqMgrName].endedDueToSleep(); },
        deckstate: function (dmx) {  //interim rapid restore info (minimal data)
            var state = {ssmn:songSeqMgrName};
            dmx = dmx || 0;  //must be numeric, verify not undefined.
            mdms.forEach(function (dm) {
                state[dm.mgr] = mgrs[dm.mgr].getSaveState(dmx); });
            return state; },
        restore: function (state, songs) {  //state is rapid restore state,
            mdms.forEach(function (dm) {    //optional songs are dbo.songs
                mgrs[dm.mgr].restoreFromSavedState(state[dm.mgr], songs); }); },
        getNextSong: function () {
            return mgrs[songSeqMgrName].getNextSong(); },
        popForward: function (npp) { //now playing path
            return mgrs[songSeqMgrName].popForward(npp); },
        songDataChanged: function (caller) {
            jt.log("deck.songDataChanged: " + caller);
            const sdict = app.svc.songs();
            mgrs.sdt.setSongsDict(sdict);  //reset with updated data
            app.top.dispCount(Object.values(sdict).length, "avail");
            mdms.forEach(function (dm) {
                mgrs[dm.mgr].songDataChanged(caller); });
            if(!dataLoadCompleted.sc) {
                chooseActiveDisplay(); } },
        initialDataLoaded: function (startdata) {
            const sdict = startdata.songdata.songs;
            dataLoadCompleted = {sc:Object.values(sdict).length};
            mgrs.sdt.setSongsDict(sdict);  //initialize
            app.top.dispCount(dataLoadCompleted.sc, "avail");
            restoreSettings();
            mgrs.hst.initHistoryIfNeeded(sdict);
            chooseActiveDisplay(); }
    };  //end mgrs.gen returned functions
    }());

return {
    init: mgrs.gen.initDisplay,
    initialDataLoaded: mgrs.gen.initialDataLoaded,
    filtersChanged: mgrs.ws.rebuild,
    songDataChanged: mgrs.gen.songDataChanged,
    getNextSong: mgrs.gen.getNextSong,
    popForward: mgrs.gen.popForward,
    rebuildHistory: mgrs.hst.rebuildHistory,
    isUnrated: function (s) { return (!s.kws && s.el === 49 && s.al === 49); },
    getPlaybackState: mgrs.gen.getPlaybackState,
    endedDueToSleep: mgrs.gen.endedDueToSleep,
    getState: mgrs.gen.deckstate,
    setState: mgrs.gen.restore,
    stableDeckLength: mgrs.ws.stableDeckLength,
    saveSongs: mgrs.sdt.saveSongs,
    dispatch: function (mgrname, fname, ...args) {
        return mgrs[mgrname][fname].apply(app.deck, args); }
};  //end of module returned functions
}());
