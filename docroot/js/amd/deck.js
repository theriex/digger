/*global app, jt */
/*jslint browser, white, long, for, unordered */

//Deck display interface and actions
app.deck = (function () {
    "use strict";

    var mgrs = {};  //general container for managers 
    function mdfs (mgrfname, ...args) {  //module dispatch function string
        return app.dfs("deck", mgrfname, args);
    }


    //Working Set manager handles rebuild of eligible songs 
    mgrs.ws = (function () {
        var wrk = {tmo:null, stat:"", resched:false, songs:[], fcs:[],
                   prs:[], wait:50};  //first wait is quick since starting up
        function compareOwnership(a, b) {  //fan songs after own songs
            if(a.dsId && b.dsId) {
                if(a.dsId.startsWith("fr") && !b.dsId.startsWith("fr")) {
                    return 1; }
                if(!a.dsId.startsWith("fr") && b.dsId.startsWith("fr")) {
                    return -1; } }
            return 0; }
        function compareLastPlayed(a, b) {  //oldest songs first
            if(a.dsId && a.dsId.startsWith("fr") &&  //most recent first for
               b.dsId && b.dsId.startsWith("fr")) {  //fan recs (email thx)
                if(a.lp && !b.lp) { return -1; }  //unplayed last
                if(!a.lp && b.lp) { return 1; }
                if(a.lp && b.lp) { return b.lp.localeCompare(a.lp); } }
            else {  //sorting own songs, oldest songs first
                if(a.lp && !b.lp) { return 1; }  //unplayed first
                if(!a.lp && b.lp) { return -1; }
                if(a.lp && b.lp) { return a.lp.localeCompare(b.lp); } }
            return 0; }
    return {
        appendInfoCount: function (phasename, count) {
            count = count || wrk.songs.length;
            wrk.fcs.push({filter:phasename, sc:count});
            jt.out("deckinfodiv", jt.tac2html(wrk.fcs.map((fc) =>
                ["div", {cla:"dinfrecdiv"},
                 [["span", {cla:"dinfrectspan"}, fc.filter + ": "],
                  ["span", {cla:"dinfrecnspan"}, String(fc.sc)]]]))); },
        getSearchText: function () {
            var st = jt.byId("srchin").value || "";
            st = st.toLowerCase().trim();
            return st; },
        filterBySearchText: function () {
            var st = mgrs.ws.getSearchText();
            if(st) {
                jt.byId("clrsrchdiv").style.display = "inline-block";
                wrk.songs = wrk.songs.filter((song) =>
                    ((song.ar && song.ar.toLowerCase().indexOf(st) >= 0) ||
                     (song.ab && song.ab.toLowerCase().indexOf(st) >= 0) ||
                     (song.ti && song.ti.toLowerCase().indexOf(st) >= 0) ||
                     (song.path.toLowerCase().indexOf(st) >= 0) ||
                     (song.kws && song.kws.toLowerCase().indexOf(st) >= 0)));
                mgrs.ws.appendInfoCount("Search Text"); }
            else {  //no search term present, don't show 'x'
                jt.byId("clrsrchdiv").style.display = "none"; } },
        filterByFilters: function () {
            if(app.filter.filteringPanelState() === "off") {
                return; }
            app.filter.filters("active").forEach(function (ftr) {
                wrk.songs = wrk.songs.filter((song) => ftr.match(song));
                mgrs.ws.appendInfoCount(ftr.actname || ftr.pn); }); },
        filterSongs: function () {
            wrk.fcs = [];  //clear filter control status messages
            mgrs.ws.appendInfoCount("Readable songs");
            mgrs.ws.filterBySearchText();
            mgrs.ws.filterByFilters(); },
        findSongIndex: function (song, songs) {
            return songs.findIndex((s) => 
                ((s.dsId && s.dsId === song.dsId) ||
                 (s.path && s.path === song.path))); },
        preserveExistingDeckSongs: function () {
            //some people like to anticipate what they saw on deck, so leave
            //the first songs intact to the extent possible
            var decksongs = mgrs.dk.songs();  var di; var si; var currsong;
            wrk.prs = [];  //reset preserved songs
            for(di = 0; di < decksongs.length && di < 7; di += 1) {
                currsong = decksongs[di];
                si = mgrs.ws.findSongIndex(currsong, wrk.songs);
                //jt.log("peds " + si + ": " + currsong.ti);
                if(si < 0) { break; }  //deck changed from this index onward
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
            wrk.songs.sort(function (a, b) {  //sort by last played, fr last
                return compareOwnership(a, b) || compareLastPlayed(a, b); });
            mgrs.ws.shuffleUnplayed();  //avoid predictable first song 
            wrk.songs = wrk.songs.slice(0, 1000);  //truncate to reasonable len
            mgrs.ws.shuffleSongs();  //older songs first, no starvation
            wrk.songs = wrk.prs.concat(wrk.songs); },  //recombine
        updateDeck: function (songs) {
            if(!songs) { return; }  //ignore spurious UI control setup calls
            wrk.songs = [];
            const ssid = app.startParams.songid;
            Object.entries(songs).forEach(function ([p, s]) {
                if(!s.fq || !s.fq.match(/^[DUI]/)) {  //see player.tun.subcats
                    s.path = p;  //used for lookup post update
                    if(ssid && s.dsId === ssid) {
                        wrk.startsong = s; }
                    wrk.songs.push(s); } });
            mgrs.ws.filterSongs();
            mgrs.ws.presentSongs();  //slices working set to reasonable length
            if(wrk.startsong) {
                jt.log("updateDeck prepending startsong: " + wrk.startsong.ti);
                wrk.songs.unshift(wrk.startsong);
                wrk.startsong = null;
                app.startParams.songid = ""; }
            mgrs.dk.setSongs(wrk.songs);  //replace working set
            if(wrk.songs.length) {  //show songs if any found
                app.player.deckUpdated(); }
            setTimeout(function () {  //leave info up momentarily
                mgrs.gen.showSection(wrk.selview); }, 800);
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
            mgrs.gen.showSection("info");
            jt.out("deckinfodiv", "Fetching songs...");
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
        noteUpdatedSongs: function (updatedsongs) {
            var upds = {};
            updatedsongs.forEach(function (s) { upds[s.dsId] = s; });
            wrk.songs.forEach(function (s) {
                if(upds[s.dsId]) {  //updated
                    app.svc.dispatch("gen", "copyUpdatedSongData",
                                     s, upds[s.dsId]); } }); }
    };  //end mgrs.ws returned functions
    }());


    //Song options manager handles actions at the level of specific song
    mgrs.sop = (function () {
        var opts = [{id:"playnow", tt:"Play this song right now",
                     img:"play.png", act:"playnow"},
                    {id:"playnext", tt:"Play this song next",
                     img:"bumpup.png", act:"playnext"},
                    {id:"skipsong", tt:"Skip this song",
                     img:"skip.png", act:"skip", x:"hst,nst"},
                    {id:"tiredskip", tt:"Note song as tired and skip",
                     img:"snooze.png", act:"snooze", x:"hst,nst"}];
        function amfLink (txt) {
            return jt.tac2html(
                ["a", {href:"#acctinfo",
                       onclick:app.dfs("top", "gen.togtopdlg", ["am", "open"])},
                 txt]); }
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
            if(mgrs.ws.getSearchText()) {
                if(app.filter.filteringPanelState() === "on") {
                    msgs.push("Try turning off the filter panel using the button to the left of the search text, or clear the search"); }
                else {
                    msgs.push("Try clearing search"); } }
            else {  //text search not active
                //modify filtering
                const filts = app.filter.filters("active");
                if(filts.some((f) => f.actname && f.actname.match(/[+\-]/g))) {
                    msgs.push("Try turning off keywords"); }
                else if(filts.some((f) =>
                        f.rgfoc && (f.rgfoc.max - f.rgfoc.min < 80))) {
                    msgs.push("Try wider energy level and approachability"); }
                //extend library and/or add a fan to help
                if(app.svc.dispatch("gen", "plat", "hdm") === "web") {
                    app.top.dispatch("webla", "spimpNeeded", "nosongs");
                    msgs.push(amfLink("Add a fan to find more music")); }
                else { //local player
                    msgs.push("Import more music");
                    msgs.push(amfLink("Add a fan to help rate music")); } }
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
        setSongs: function (songs) {  //rebuild deck display with updated songs
            ds = songs;
            jt.log("dk.setSongs " + ds.slice(0, 7).map((s) => s.ti).join(", "));
            mgrs.sop.displaySongs("dk", "decksongsdiv", ds); },
        songByIndex: function (idx) { return ds[idx]; },
        playnow: function (mgrnm, idx) {
            var song = mgrs[mgrnm].songByIndex(idx);
            ds = ds.filter((s) => s.path !== song.path);
            ds.unshift(song);
            app.player.next(); },  //calls popSongFromDeck
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
            app.svc.updateSong(song); },
        markMultipleSongsPlayed: function (count, contf, errf) {
            count = Math.min(count, ds.length);
            const pss = ds.splice(0, count);
            pss.forEach(function (song) {
                song.lp = new Date().toISOString();
                mgrs.hst.noteSongPlayed(song); });
            app.svc.dispatch("gen", "updateMultipleSongs", pss, function () {
                mgrs.sop.displaySongs("dk", "decksongsdiv", ds);
                contf(); }, errf); },
        removeFromDeck: function (song) {
            ds = ds.filter((s) => s.path !== song.path);
            mgrs.sop.displaySongs("dk", "decksongsdiv", ds); },
        popSongFromDeck: function () {
            var song = null;
            if(mgrs.gen.deckinfo().di === "album") {
                return mgrs.alb.nextSong(); }
            if(ds.length) {
                song = ds.shift();
                if(song.bumped) { delete song.bumped; }
                app.player.noteprevplay(song.lp);
                mgrs.dk.markSongPlayed(song); }
            mgrs.sop.displaySongs("dk", "decksongsdiv", ds);
            return song; }
    };  //end of mgrs.dk returned functions
    }());


    //Album manager handles album info and playback
    mgrs.alb = (function () {
        var cak = "";  //current album key (artist + album)
        var aid = {};  //current index and songs organized by album key
    return {
        songs: function () { return aid[cak].songs; },
        songByIndex: function (idx) { return aid[cak].songs[idx]; },
        makeAlbumKey: function (song) {
            if(!(song.ar && song.ab)) { return ""; }
            return song.ar + " - " + song.ab; },
        setAlbumSongs: function (fetchsong, albumsongs) {
            aid[mgrs.alb.makeAlbumKey(fetchsong)] = {
                ci:mgrs.ws.findSongIndex(fetchsong, albumsongs),
                songs:albumsongs};
            mgrs.alb.updateDisplayContent(); },
        albumFetchFailure: function (code, errtxt) {
            jt.out("deckalbumdiv", "Album fetch failed: " + code + ": " +
                   errtxt); },
        updateDisplayContent: function () {
            var np = app.player.song();
            if(!np) {
                return jt.out("deckalbumdiv", "No song currently playing"); }
            cak = mgrs.alb.makeAlbumKey(np);
            if(!cak) {
                return jt.out("deckalbumdiv", "Album info not available"); }
            if(!aid[cak]) {
                jt.out("deckalbumdiv", "Fetching album info...");
                return app.svc.fetchAlbum(np, mgrs.alb.setAlbumSongs,
                                          mgrs.alb.albumFetchFailure); }
            if(!aid[cak].songs || !aid[cak].songs.length) {
                return jt.out("deckalbumdiv", "No album info for song"); }
            //currently playing song may have changed via external action
            aid[cak].ci = mgrs.ws.findSongIndex(np, aid[cak].songs);
            mgrs.alb.displayAlbum(np); },
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
            app.svc.noteUpdatedState("deck");  //enable restoring to album view
            jt.out("deckalbumdiv", jt.tac2html(
                [["div", {cla:"albumtitlediv"},
                  [["span", {cla:"dsabspan"}, np.ab],
                   " - ",
                   ["span", {cla:"dsarspan"}, np.ar]]],
                 aid[cak].songs.map((song, idx) =>
                     mgrs.alb.makeAlbumSongDiv(song, idx))])); },
        albumstate: function () {
            return {key:cak, info:aid[cak]}; },
        restore: function (state) {
            cak = state.key;
            jt.log("mgrs.alb.restore cak: " + cak);
            aid[cak] = state.info;
            jt.log("mgrs.alb.restore aid[cak]: " + JSON.stringify(aid[cak]));
            mgrs.gen.showSection("album"); },
        playnow: function (idx) {
            aid[cak].ci = idx - 1;
            app.player.next(); },
        nextSong: function () {
            if(aid[cak].ci < aid[cak].songs.length - 1) {
                aid[cak].ci += 1;
                const song = aid[cak].songs[aid[cak].ci];
                mgrs.dk.markSongPlayed(song);
                mgrs.dk.removeFromDeck(song);
                mgrs.alb.displayAlbum(song);
                return song; }
            return null; }
    };  //end of mgrs.alb returned functions
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
            pps.unshift(song);
            mgrs.nst.noteSongPlayed(song); },
        verifyDisplayContent: function () {
            if(!pps.length) {
                return jt.out("deckhistorydiv", "No songs played yet"); }
            mgrs.sop.displaySongs("hst", "deckhistorydiv", pps); }
    };  //end mgrs.hst returned functions
    }());


    //Newest manager shows latest added songs that haven't played yet.
    mgrs.nst = (function () {
        var nss = [];  //newest songs
    return {
        songs: function () { return nss; },
        songByIndex: function (idx) { return nss[idx]; },
        noteSongPlayed: function (song) {
            nss = nss.filter((s) => s.path !== song.path); },
        updateNewest: function (songs) {
            nss = [];
            Object.entries(songs).forEach(function ([p, s]) {
                if((!s.fq || !s.fq.match(/^[DUI]/)) &&  //see player.tun
                   (!s.lp || app.deck.isUnrated(s))) {
                    s.path = p;  //used for lookup post update
                    nss.push(s); } });
            nss = nss.filter((s) => 
                ((!s.dsId || !s.dsId.startsWith("fr")) &&
                 (app.deck.isUnrated(s) || !s.lp)));
            nss.sort(function (a, b) {
                if(a.modified && !b.modified) { return 1; }  //unmod 1st
                if(!a.modified && b.modified) { return -1; }
                return b.modified.localeCompare(a.modified); }); //new 1st
            mgrs.nst.displayNewest(); },
        displayNewest: function () {
            if(!nss.length) {
                jt.out("decknewestdiv", "No unplayed/unrated songs found.");
                return; }
            mgrs.sop.displaySongs("nst", "decknewestdiv", nss); },
        fetchFailure: function (code, errtxt) {
            jt.err("Newest fetch failed " + code + ": " + errtxt);
            mgrs.nst.updateNewest([]); },
        verifyDisplayContent: function () {
            if(nss.length) { return mgrs.nst.displayNewest(); }
            jt.out("decknewestdiv", "Fetching...");
            app.svc.fetchSongs(mgrs.nst.updateNewest, mgrs.nst.fetchFailure); }
    };  //end mgrs.nst returned functions
    }());



    //Views manager handles which view is curently selected.
    mgrs.vws = (function () {
        var vi = {currv: "history",
                  tabs: {history: {title:"History", mgr:"hst"},
                         newest: {title:"Newest", mgr:"nst"}}};
    return {
        songs: function () {
            const currtab = vi.tabs[vi.currv];
            return mgrs[currtab.mgr].songs(); },
        getView: function () { return vi.currv; },
        showView: function (tabname) {
            vi.currv = tabname;
            mgrs.vws.verifyDisplayContent(); },
        verifyDisplayContent: function () {
            var tabs = [];
            Object.entries(vi.tabs).forEach(function ([tab, def]) {
                const tc = ((tab === vi.currv)? "vtabsel" : "vtab");
                tabs.push(
                    ["span", {cla:tc},
                     ["a", {href:"#" + tab,
                            onclick:mdfs("vws.showView", tab)},
                      def.title]]);
                jt.byId("deck" + tab + "div").style.display =
                    ((tab === vi.currv)? "block" : "none"); });
            jt.out("deckvtabsdiv", jt.tac2html(tabs));
            const currtab = vi.tabs[vi.currv];
            mgrs[currtab.mgr].verifyDisplayContent(); }
    };  //end mgrs.vws returned functions
    }());


    //general manager is main interface for the module
    mgrs.gen = (function () {
        var deckstat = {qstr:"", disp:"songs", toggles:{},
                        maxdecksel:1000};
        var tgs = [
            {id:"togfiltb", ti:"Bypass filtering", w:46, h:23,
             onimg:"img/filteron.png", offimg:"img/filteroff.png",
             togf:function (state) {
                 if(state) {
                     jt.byId("panfiltcontentdiv").style.opacity = 1.0; }
                 else {
                     jt.byId("panfiltcontentdiv").style.opacity = 0.3; }
                 mgrs.ws.rebuild("togfiltb"); }},
            {id:"toginfob", ti:"Filtering Information",
             onimg:"img/infoact.png", offimg:"img/info.png",
             togf:function (state) {
                 mgrs.gen.showSection(state ? "info" : "songs"); }},
            {id:"togalb", ti:"Play Album",
             onimg:"img/albumact.png", offimg:"img/album.png",
             togf:function (state) {
                 mgrs.gen.showSection(state ? "album" : "songs"); }},
            {id:"togviewsb", ti:"Song Views",
             onimg:"img/viewsact.png", offimg:"img/views.png",
             togf:function (state) {
                 mgrs.gen.showSection(state ? "views" : "songs"); }}];
    return {
        showSection: function (showing) {
            showing = showing || deckstat.disp;
            const sections = ["songs", "info", "album", "views"];
            const buttons = ["", "toginfob", "togalb", "togviewsb"];
            sections.forEach(function (section, idx) {
                var togbf = deckstat.toggles[buttons[idx]];
                var secdiv = jt.byId("deck" + section + "div");
                if(secdiv) {
                    if(section === showing) {  //button is already toggled on
                        secdiv.style.display = "block";
                        if(togbf) {
                            togbf("activate", "reflectonly"); } }
                    else {
                        secdiv.style.display = "none";
                        if(togbf) {
                            togbf("", "reflectonly"); } } } });
            deckstat.disp = showing;
            switch(deckstat.disp) {
            case "album": mgrs.alb.updateDisplayContent(); break;
            case "views": mgrs.vws.verifyDisplayContent(); break; } },
        redisplayCurrentSection: function () {
            deckstat.disp = deckstat.disp || "songs";
            mgrs.gen.showSection(deckstat.disp); },
        makeToggle: function (spec) {
            var div = jt.byId(spec.id);
            div.style.display = "inline-block";
            div.style.position = "relative";
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
        makeToggleControls: function () {
            tgs.forEach(function (tg) {
                tg.tfc = deckstat.toggles;
                tg.w = tg.w || 20;
                tg.h = tg.h || 20;
                mgrs.gen.makeToggle(tg); }); },
        clearSearch: function () {
            jt.byId("srchin").value = "";
            mgrs.dk.setSongs([]);  //clear deck to avoid merging
            mgrs.ws.rebuild("srchin"); },
        initDisplay: function () {
            jt.out("pandeckdiv", jt.tac2html(
                [["div", {id:"deckheaderdiv"},
                  [["div", {cla:"togbdiv", id:"togfiltb"}],
                   ["input", {type:"text", id:"srchin", size:14,
                              placeholder:"artist/album/song...",
                              value:deckstat.qstr,
                              oninput:mdfs("ws.rebuild", "srchin")}],
                   ["div", {id:"clrsrchdiv"},
                    ["a", {href:"#clearsearch", title:"Clear search",
                           onclick:mdfs("gen.clearSearch")}, "x"]],
                   ["a", {href:"#search", title:"Search Songs",
                          onclick:mdfs("ws.rebuild", "srchin")},
                    ["img", {src:"img/search.png", cla:"ico20"}]],
                   ["div", {cla:"togbdiv", id:"toginfob"}],
                   ["div", {cla:"togbdiv", id:"togalb"}],
                   ["div", {cla:"togbdiv", id:"togviewsb"}]]],
                 ["div", {id:"deckinfodiv", style:"display:none;"}],
                 ["div", {id:"deckalbumdiv", style:"display:none;"}],
                 ["div", {id:"deckviewsdiv", style:"display:none;"},
                  [["div", {id:"deckvtabsdiv"}],
                   ["div", {id:"deckvcontdiv"},
                    [["div", {id:"deckhistorydiv"}],
                     ["div", {id:"decknewestdiv"}]]]]],
                 ["div", {id:"decksongsdiv"}, "Verifying filters..."]]));
            mgrs.gen.makeToggleControls();
            deckstat.toggles.togfiltb(true); },
        deckinfo: function () {
            var di = {disp:deckstat.disp};
            switch(deckstat.disp) {
            case "album": di.songs = mgrs.alb.songs(); break;
            case "views": di.songs = mgrs.vws.songs(); break;
            default: di.disp = "deck"; di.songs = mgrs.dk.songs(); }
            return di; },
        deckstate: function (dmx) {  //interim rapid restore info (minimal data)
            var state = {disp:deckstat.disp};
            dmx = dmx || 7;
            //jt.log("deck.gen.deckstate disp: " + deckstat.disp);
            if(deckstat.disp === "album") {
                state.det = mgrs.alb.albumstate(); }
            else { //might be displaying other tab, but next song is from deck
                state.det = mgrs.dk.songs().slice(0, dmx); }
            return state; },
        restore: function (state) {  //interim rapid restore display
            jt.log("deck.gen.restore " + state.disp);
            if(state.disp === "album") {
                deckstat.disp = "album";
                mgrs.alb.restore(state.det); }
            else {
                deckstat.disp = "deck";
                mgrs.dk.setSongs(state.det); } },
        getNextSong: function () {
            if(deckstat.disp === "album") {
                return mgrs.alb.nextSong(); }
            return mgrs.dk.popSongFromDeck(); }
    };  //end mgrs.gen returned functions
    }());

return {
    init: function () { mgrs.gen.initDisplay(); },  //filters call update
    deckinfo: function () { return mgrs.gen.deckinfo(); },
    update: function (caller) { mgrs.ws.rebuild(caller); },
    getNextSong: function () { return mgrs.gen.getNextSong(); },
    isUnrated: function (s) { return (!s.kws && s.el === 49 && s.al === 49); },
    getState: function (dmx) { return mgrs.gen.deckstate(dmx); },
    setState: function (state) { mgrs.gen.restore(state); },
    dispatch: function (mgrname, fname, ...args) {
        return mgrs[mgrname][fname].apply(app.deck, args); }
};  //end of module returned functions
}());
