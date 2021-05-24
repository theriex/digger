/*global app, jt */
/*jslint browser, white, fudge, long, for */

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
                   prs:[], wait:600};  //debounce filters
    return {
        appendInfoCount: function (phasename, count) {
            count = count || wrk.songs.length;
            wrk.fcs.push({filter:phasename, sc:count});
            jt.out("deckinfodiv", jt.tac2html(wrk.fcs.map((fc) =>
                ["div", {cla:"dinfrecdiv"},
                 [["span", {cla:"dinfrectspan"}, fc.filter + ": "],
                  ["span", {cla:"dinfrecnspan"}, fc.sc]]]))); },
        filterBySearchText: function () {
            var st = jt.byId("srchin").value || "";
            st = st.toLowerCase().trim();
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
            var togfiltb = jt.byId("togfiltb");
            if(togfiltb && togfiltb.dataset.togstate === "off") {
                return; }  //no filtering, explicitely turned off
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
            wrk.prs = [];  //reset preserved songs
            var decksongs = mgrs.dk.songs();  var di; var si; var currsong;
            for(di = 0; di < decksongs.length && di < 7; di += 1) {
                currsong = decksongs[di];
                si = mgrs.ws.findSongIndex(currsong, wrk.songs);
                if(si < 0) { break; }  //deck changed from this index onward
                wrk.prs.push(wrk.songs[si]);
                wrk.songs.splice(si, 1); } },
        shuffleSongs: function () {  //oldest first, artisanal variety
            var ba = {};  //string keys traverse in insertion order (ES2015)
            wrk.songs.forEach(function (s) {  //oldest songs first
                var artist = s.ar || "Unknown";
                if(!ba[artist]) { ba[artist] = []; }
                ba[artist].push(s); });
            var first = []; var rest = [];
            Object.values(ba).forEach(function (songs) {
                first.push(songs.shift());
                rest = rest.concat(songs); });
            //leave [0] (2nd oldest song), Fisher-Yates shuffle rest
            var i; var j; var temp;
            for(i = rest.length - 1; i > 0; i -= 1) {
                j = Math.floor(Math.random() * i);
                temp = rest[i];
                if(!temp) {  //should never happen, complain loudly
                    throw("rest index " + i + " was undefined"); }
                rest[i] = rest[j];
                rest[j] = temp; }
            wrk.songs = first.concat(rest); },
        presentSongs: function () {
            mgrs.ws.preserveExistingDeckSongs();  //pulled into wrk.prs
            wrk.songs.sort(function (a, b) {  //sort by last played
                if(a.lp && !b.lp) { return 1; }
                if(!a.lp && b.lp) { return -1; }
                if(a.lp && b.lp) { return a.lp.localeCompare(b.lp); }
                return 0; });
            wrk.songs = wrk.songs.slice(0, 1000);  //truncate to reasonable len
            mgrs.ws.shuffleSongs();  //older songs first, no starvation
            wrk.songs = wrk.prs.concat(wrk.songs); },  //recombine
        updateDeck: function (songs) {
            if(!songs) { return; }  //ignore spurious UI control setup calls
            wrk.songs = [];
            Object.entries(songs).forEach(function ([p, s]) {
                if(!s.fq || !s.fq.match(/^[DUI]/)) {  //see player.tun.subcats
                    s.path = p;  //used for lookup post update
                    wrk.songs.push(s); } });
            mgrs.ws.filterSongs();
            mgrs.ws.presentSongs();
            mgrs.dk.setSongs(wrk.songs);  //replace working set
            if(wrk.songs.length) {  //show songs if any found
                app.player.deckUpdated();
                setTimeout(function () {  //leave info momentarily
                    mgrs.gen.showSection("songs"); }, 800); }
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
            wrk.wait = 1200;  //debounce filters 
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
            wrk.tmo = setTimeout(mgrs.ws.rebuildWork, wrk.wait); }
    };  //end mgrs.ws returned functions
    }());


    //Song options manager handles actions at the level of specific song
    mgrs.sop = (function () {
        var opts = [{id:"playnow", tt:"Play this song right now",
                     img:"play.png", act:"playnow"},
                    {id:"playnext", tt:"Play this song next",
                     img:"bumpup.png", act:"playnext"},
                    {id:"skipsong", tt:"Skip this song",
                     img:"skip.png", act:"skip", x:"hst"},
                    {id:"tiredskip", tt:"Note song as tired and skip",
                     img:"snooze.png", act:"snooze", x:"hst"}];
    return {
        togOptions: function  (mgrnm, idx) {
            var optdivid = "da" + mgrnm + idx;
            if(jt.byId(optdivid).innerHTML)  { //remove content to close
                return jt.out(optdivid, ""); }
            var playerr = mgrs.hst.playbackError(mgrnm, idx);
            if(playerr) {
                return jt.out(optdivid, playerr); }
            jt.out(optdivid, jt.tac2html(
                opts.filter((o) => 
                    ((!o.x || o.x.indexOf(mgrnm) < 0) &&
                     (o.id !== "playnext" || idx > 0)))
                .map((o) => ["a", {href:"#" + o.id, title:o.tt, cla:"sopa",
                                   onclick:mdfs("sop.dispatchOption", o.act,
                                                mgrnm, idx)},
                             ["img", {src:"img/" + o.img, cla:"ptico"}]]))); },
        dispatchOption: function (action, mgrnm, idx) {
            mgrs.sop.togOptions(mgrnm, idx);  //remove actions overlay
            mgrs.dk[action](mgrnm, idx); },   //do clicked action
        songIdentHTML: function (song) {
            var idh = [["span", {cla:"dstispan"}, song.ti],
                       " - ",
                       ["span", {cla:"dsarspan"}, song.ar || "???"]];
            if(song.ab) {
                idh.push(" - ");
                idh.push(["span", {cla:"dsabspan"}, song.ab || ""]); }
            return jt.tac2html(idh); },
        displaySongs: function (mgrnm, divid, songs) {
            if(!songs.length) {
                return jt.out(divid, "No matching songs found."); }
            var songsdiv = jt.byId(divid);
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
            if(song.fq === "N") { song.fq = "P"; }
            mgrs.hst.noteSongPlayed(song);
            app.svc.updateSong(song); },
        removeFromDeck: function (song) {
            ds = ds.filter((s) => s.path !== song.path);
            mgrs.sop.displaySongs("dk", "decksongsdiv", ds); },
        popSongFromDeck: function () {
            if(mgrs.gen.deckinfo().di === "album") {
                return mgrs.alb.nextSong(); }
            var song = null;
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
            cak = mgrs.alb.makeAlbumKey(app.player.song());
            if(!cak) {
                return jt.out("deckalbumdiv", "Album info not available"); }
            if(!aid[cak]) {
                jt.out("deckalbumdiv", "Fetching album info...");
                return app.svc.fetchAlbum(np, mgrs.alb.setAlbumSongs,
                                          mgrs.alb.albumFetchFailure); }
            if(!aid[cak].songs || !aid[cak].songs.length) {
                return jt.out("deckalbumdiv", "No album info for song"); }
            mgrs.alb.displayAlbum(np); },
        makeAlbumSongDiv: function (song, idx) {
            if(idx === aid[cak].ci) {
                return [["img", {src:"img/arrow12right.png",
                                 cla:"albumarrow"}],
                        song.ti]; }
            var tn = idx + 1;  //track number
            return ["a", {href:"#playsong" + tn, title:"Play track " + tn,
                          cla:"albumsonglink",
                          //dk handles history and deck bookkeeping
                          onclick:mdfs("alb.playnow", idx)},
                    song.ti]; },
        displayAlbum: function (np) {
            jt.out("deckalbumdiv", jt.tac2html(
                [["div", {cla:"albumtitlediv"},
                  [["span", {cla:"dsabspan"}, np.ab],
                   " - ",
                   ["span", {cla:"dsarspan"}, np.ar]]],
                 aid[cak].songs.map((song, idx) =>
                     mgrs.alb.makeAlbumSongDiv(song, idx))])); },
        playnow: function (idx) {
            aid[cak].ci = idx - 1;
            app.player.next(); },
        nextSong: function () {
            if(aid[cak].ci < aid[cak].songs.length - 1) {
                aid[cak].ci += 1;
                var song = aid[cak].songs[aid[cak].ci];
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
                var song = pps[idx];
                playerr = app.player.playerr(song.path); }
            return playerr; },
        noteSongPlayed: function (song) {
            pps = pps.filter((s) => s.path !== song.path);
            pps.unshift(song); },
        verifyDisplayContent: function () {
            if(!pps.length) {
                return jt.out("deckhistorydiv", "No songs played yet"); }
            mgrs.sop.displaySongs("hst", "deckhistorydiv", pps); }
    };  //end mgrs.hst returned functions
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
            {id:"toghistb", ti:"Song History",
             onimg:"img/historyact.png", offimg:"img/history.png",
             togf:function (state) {
                 mgrs.gen.showSection(state ? "history" : "songs"); }}];
    return {
        showSection: function (showing) {
            showing = showing || "songs";
            var sections = ["songs", "info", "album", "history"];
            var buttons = ["", "toginfob", "togalb", "toghistb"];
            sections.forEach(function (section, idx) {
                var togbf = deckstat.toggles[buttons[idx]];
                if(section === showing) {  //button is already toggled on
                    jt.byId("deck" + section + "div").style.display = "block"; }
                else {
                    jt.byId("deck" + section + "div").style.display = "none";
                    if(togbf) {
                        togbf("", true); } } });
            deckstat.disp = showing;
            switch(deckstat.disp) {
            case "album": mgrs.alb.updateDisplayContent(); break;
            case "history": mgrs.hst.verifyDisplayContent(); break; } },
        makeToggle: function (spec) {
            var div = jt.byId(spec.id);
            div.style.display = "inline-block";
            div.style.position = "relative";
            div.style.height = spec.h + "px";
            div.style.width = spec.w + "px";
            div.style.verticalAlign = "middle";
            div.style.cursor = "pointer";
            div.title = spec.ti;
            var opas = {onimg:0.0, offimg:1.0};
            var imgstyle = "position:absolute;top:0px;left:0px;" +
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
                   ["input", {type:"text", id:"srchin", size:18,
                              placeholder:"artist/album/song...",
                              value:deckstat.qstr,
                              oninput:mdfs("ws.rebuild", "srchin")}],
                   ["div", {id:"clrsrchdiv"},
                    ["a", {href:"#clearsearch", title:"Clear search",
                           onclick:mdfs("gen.clearSearch")}, 'x']],
                   ["a", {href:"#search", title:"Search Songs",
                          onclick:mdfs("ws.rebuild", "srchin")},
                    ["img", {src:"img/search.png", cla:"ico20"}]],
                   ["div", {cla:"togbdiv", id:"toginfob"}],
                   ["div", {cla:"togbdiv", id:"togalb"}],
                   ["div", {cla:"togbdiv", id:"toghistb"}]]],
                 ["div", {id:"deckinfodiv", style:"display:none;"}],
                 ["div", {id:"deckalbumdiv", style:"display:none;"}],
                 ["div", {id:"deckhistorydiv", style:"display:none;"}],
                 ["div", {id:"decksongsdiv"}, "Verifying filters..."]]));
            mgrs.gen.makeToggleControls();
            deckstat.toggles.togfiltb(true); },
        deckinfo: function () {
            var di = {disp:deckstat.disp};
            switch(deckstat.disp) {
            case "album": di.songs = mgrs.alb.songs(); break;
            case "history": di.songs = mgrs.hst.songs(); break;
            default: di.disp = "deck"; di.songs = mgrs.dk.songs(); }
            return di; },
        getNextSong: function () {
            if(deckstat.disp === "album") {
                return mgrs.alb.nextSong(); }
            return mgrs.dk.popSongFromDeck(); }
    };  //end mgrs.gen returned functions
    }());

return {
    init: function () { mgrs.gen.initDisplay(); },
    deckinfo: function () { return mgrs.gen.deckinfo(); },
    update: function (caller) { mgrs.ws.rebuild(caller); },
    getNextSong: function () { return mgrs.gen.getNextSong(); },
    dispatch: function (mgrname, fname, ...args) {
        return mgrs[mgrname][fname].apply(app.deck, args); }
};  //end of module returned functions
}());
