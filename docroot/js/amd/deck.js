/*global app, jt */
/*jslint browser, white, long, for, unordered */

//Deck display interface and actions
app.deck = (function () {
    "use strict";

    var mgrs = {};  //general container for managers 
    function mdfs (mgrfname, ...args) {  //module dispatch function string
        return app.util.dfs("deck", mgrfname, args);
    }


    //Song dupe tracker handles persisting songs with possible copies
    mgrs.sdt = (function () {
        function simplifiedMatch (str) {
            var sm = str;
            //See related appdat.py standardized_colloquial_match used for
            //equivalence matching during collaboration.
            sm = sm.replace(/featuring.*/ig, "");
            if(!sm.match(/\(.*part.*\)/i)) {  //not "(Part 2)" or similar
                sm = sm.replace(/\(.*\)/g, ""); }  //ignore parenthetical
            sm = sm.replace(/\[.*\]/g, "");  //ignore bracketed
            if(!sm) {
                jt.log("simplifiedMatch reduced to nothing: " + str);
                sm = str; }
            return sm; }
        function findDupesForSong (song, markplayed) {
            var res = [];
            const mti = simplifiedMatch(song.ti).toLowerCase();
            const mar = simplifiedMatch(song.ar).toLowerCase();
            Object.entries(app.pdat.songsDict()).forEach(function ([p, s]) {
                if(p !== song.path &&  //original song is not a dupe
                   s.ti && s.ti.toLowerCase().startsWith(mti) &&
                   s.ar && s.ar.toLowerCase().startsWith(mar) &&
                   (!s.fq || (!s.fq.includes("D") &&
                              !s.fq.includes("U")))) {
                    if(markplayed) {
                        //not updating s.pc/fq since not actually played
                        if(!s.lp || s.lp < song.lp) {
                            s.pd = "dupe";
                            s.lp = song.lp; } }
                    res.push(s); } });
            return res; }
        function removeDuplicateSongs (queue, appendToEnd) {
            var res; var md = {};  //match dictionary
            queue.forEach(function (song) {
                const mti = simplifiedMatch(song.ti).toLowerCase();
                const mar = simplifiedMatch(song.ar).toLowerCase();
                const key = mti + mar;
                md[key] = md[key] || [];
                md[key].push(song); });
            res = Object.values(md).map((arr) => arr[0]);  //dupes removed
            if(appendToEnd) {  //push any dupe songs found onto end of queue
                Object.values(md).forEach(function (arr) {
                    res.push(...arr.slice(1)); }); }
            return res; }
    return {
        getSongDupes: findDupesForSong,
        markDupesPlayed: function (song) { findDupesForSong(song, true); },
        dedupeSongList: removeDuplicateSongs
    };  //end mgrs.sdt returned functions
    }());


    //factored utility functions
    mgrs.util = (function () {
        var qsodisp = null;
        var qsos = [{id:"playnow", tt:"Play this song right now",
                     img:"play.png", act:"playnow"},
                    {id:"tiredskip", tt:"Note song as tired and skip",
                     img:"snooze.png", act:"snooze", x:"hst"}];
        const csk = {m:"init"};  //"ongoing", "lastpass", "disabled"
        function compilationSkip (sq, aq) {
            if(csk.m === "disabled") { return false; }
            if(!sq.length) { return false; }
            if(sq[sq.length - 1].ab === aq[0].ab) {
                if(csk.m === "init") { csk.m = "ongoing"; }
                return true; }
            csk.m = "init";  //found a different artist not on same album
            return false; }
        function updateSelectionFilteringInfoDisplay (fcs) {
            jt.out("deckfresdiv", jt.tac2html(
                ["table", {id:"filtsumtable"},
                 fcs.map((fc) =>
                     ["tr",
                      [["td", {cla:"dinfrectd"},
                        ["span", {cla:"dinfrectspan"}, fc.filter + ": "]],
                       ["td",
                        ["span", {cla:"dinfrecnspan"}, String(fc.sc)]]]])])); }
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
                [["img", {cla:"ico20 inv", id:spec.id + "onimg",
                          src:spec.onimg,
                          style:imgstyle + "opacity:" + opas.onimg}],
                 ["img", {cla:"ico20 inv", id:spec.id + "offimg",
                          src:spec.offimg,
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
            jt.byId(targname).style.height = avh + "px"; },
        filterByFilters: function (songs, fcs) {
            fcs.length = 0;  //clear all filter control status messages
            fcs.push({filter:"Saved", sc:songs.length});
            if(app.svc.okToPlay) {  //have plat/situation song filtering func
                songs = songs.filter((s) => app.svc.okToPlay(s)); }
            songs = songs.filter((s) => app.deck.isDeckable(s));
            fcs.push({filter:"Playable", sc:songs.length});
            if(app.filter.filteringPanelState() !== "off") {
                app.filter.filters("active").forEach(function (ftr) {
                    songs = songs.filter((song) => ftr.match(song));
                    fcs.push({filter:ftr.sumname || ftr.pn,
                              sc:songs.length}); }); }
            updateSelectionFilteringInfoDisplay(fcs);
            return songs; },
        sba2queue: function (sba, salrp) {  //song arrays by artist
            var rsq = [];  //resulting song queue
            if(salrp) {  //sort artists by least recently played
                const alp = {};  //artists last played, even if not playable
                Object.values(app.pdat.songsDict()).forEach(function (s) {
                    if(s.ar) {
                        alp[s.ar] = alp[s.ar] || "";
                        if(s.lp > alp[s.ar]) {  //true if s.lp defined and >
                            alp[s.ar] = s.lp; } } });
                const sas = Object.keys(sba).map(function (ar) {
                    return {artist:ar, mrp:alp[ar], songs:sba[ar]}; })
                      .sort((a, b) => a.mrp.localeCompare(b.mrp));
                sba = {};
                sas.forEach(function (sa) { sba[sa.artist] = sa.songs; }); }
            //consume sba round robin into a single queue of songs
            csk.m = "init";  //reset compilation skipping
            while(Object.keys(sba).length > 0) {  //have artists with songs
                Object.keys(sba).forEach(function (artist) {
                    if(!compilationSkip(rsq, sba[artist])) {
                        rsq.push(sba[artist].shift());
                        if(!sba[artist].length) {
                            delete sba[artist]; }} });
                if(csk.m === "ongoing") { csk.m = "lastpass"; }
                else if(csk.m === "lastpass") { csk.m = "disabled"; } }
            return rsq; },
        songIdentHTML: function (song, emptytxt) {
            var idh = [];
            if(song) {
                idh.push(["span", {cla:"dstispan", "data-dsId":song.dsId,
                                   style:(app.deck.isUnrated(song)?
                                          "" : "font-weight:bold;")},
                          song.ti]);
                idh.push(" - ");
                idh.push(["span", {cla:"dsarspan"}, song.ar || "Unknown"]);
                if(song.ab) {
                    idh.push(" - ");
                    idh.push(["span", {cla:"dsabspan"}, song.ab || ""]); } }
            return jt.tac2html(idh) || emptytxt || ""; },
        execQSO: function (action, mgrnm, idx) {
            //options overlay already cleared from event percolation..
            //mgrs.util.togQSOpts(mgrnm, idx);  //remove actions overlay
            const song = mgrs[mgrnm].songByIndex(idx);
            switch(action) {
            case "playnow":   //either from csa or hst display
                mgrs.csa.playGivenSong(song);
                break;
            case "snooze": 
                if(song.fq === "N") { song.fq = "P"; }  //played
                app.player.dispatch("cmt", "bumpTired", song);
                song.lp = new Date().toISOString();
                song.pc = (song.pc || 0) + 1;
                song.pd = "snoozed";
                app.pdat.writeDigDat("deck.util.execQSO.snooze");
                break;
            default: jt.log("execQSO unknown action " + action); } },
        togQSOpts: function  (mgrnm, idx) {
            const optdivid = "da" + mgrnm + idx;
            const optlinkid = "dsl" + mgrnm + idx;
            if(qsodisp) {  //currently displayed, toggle off
                jt.out(qsodisp.divid, "");
                jt.byId(qsodisp.linkid).style.color = null;
                qsodisp = null;
                return; }
            if(mgrnm === "hst") {
                const pberr = mgrs.hst.playbackError(idx);
                if(pberr) {
                    return jt.out(optdivid, pberr); } }
            qsodisp = {divid:optdivid, linkid:optlinkid};
            jt.byId(optlinkid).style.color = "#ffab00";
            jt.out(optdivid, jt.tac2html(
                qsos.filter((o) => !o.x || o.x.indexOf(mgrnm) < 0)
                    .map((o) =>
                        ["a", {href:"#" + o.id, title:o.tt, cla:"sopa",
                               onclick:mdfs("util.execQSO", o.act,
                                            mgrnm, idx)},
                         ["div", {cla:"dsoidiv"},
                          ["img", {src:"img/" + o.img, cla:"ptico"}]]]))); },
        mostRecentlyPlayedFirst: function (a, b) {
            if(a.lp && b.lp) { return b.lp.localeCompare(a.lp); }
            if(a.lp && !b.lp) { return -1; }
            if(!a.lp && b.lp) { return 1; } },
        findIndexByLastPlayedTimestamp: function (paths) {
            var idx;
            if(!paths || !paths.length) {
                jt.log("deck.util.fIBLPT no paths given to check against");
                return -1; }
            const mrs = Object.values(app.pdat.songsDict())
                  .sort(mgrs.util.mostRecentlyPlayedFirst);
            const fqsi = mrs.findIndex((s) => s.path === paths[0]);
            if(fqsi < 0) {
                jt.log("deck.util.fIBLPT first song path not in songs");
                return -1; }
            const played = mrs.slice(0, fqsi + 1).reverse();
            // jt.log("deck.util.fIBLPT most recently played songs:");
            // for(idx = 0; idx < played.length && idx < 6; idx += 1) {
            //     jt.log("  " + idx + " p:" + paths[idx].slice(-20) + ", m:" +
            //            played[idx].path.slice(-20)); }
            for(idx = 0; idx < played.length; idx += 1) {
                if(played[idx].path !== paths[idx]) {
                    jt.log("deck.util.fIBLPT playback order differs");
                    return -1; } }
            return played.length - 1; },
        displayQueuedSongs: function (mgrnm, divid, songs) {
            if(!songs.length) {
                return jt.out(divid, mgrs[mgrnm].emptyQueueDisplay()); }
            const songsdiv = jt.byId(divid);
            songsdiv.innerHTML = "";
            songs.forEach(function (song, idx) {
                var sd = document.createElement("div");
                sd.className = "decksongdiv";
                sd.innerHTML = jt.tac2html(
                    ["div", {cla:"songtitlediv"},
                     [["a", {href:"#songactions", title:"Show song options",
                             onclick:mdfs("util.togQSOpts", mgrnm, idx),
                             id:"dsl" + mgrnm + idx},
                       mgrs.util.songIdentHTML(song)],
                      ["div", {cla:"decksongactdiv",  //toggle off if clicked
                               onclick:mdfs("util.togQSOpts", mgrnm, idx),
                               id:"da" + mgrnm + idx}]]]);
                songsdiv.appendChild(sd); }); }
    };  //end mgrs.util returned functions
    }());


    //Continuous Select Autoplay manager handles filtered playback with
    //info and access to history.
    mgrs.csa = (function () {
        const toggleButtons = {};
        var fcs = [];  //filter control status messages
        var asq = {paths:[], ts:"", idx:-1};  //autoplay selection queue
        function lastPlayedComparator (a, b) {
            if(a.lp && b.lp) { return a.lp.localeCompare(b.lp); }
            if(a.lp && !b.lp) { return 1; }  //unplayed before played
            if(!a.lp && b.lp) { return -1; } }
        function getPlayableSongs () {
            var songs = Object.values(app.pdat.songsDict())
                .sort(lastPlayedComparator);    //oldest first
            songs = mgrs.util.filterByFilters(songs, fcs);  //rebuilds fcs
            //consider an order of magnitude more than supported playback to
            //maximize breadth of artists in autoplay selection.
            songs = songs.slice(0, 10 * app.player.playQueueMax);
            songs = mgrs.sdt.dedupeSongList(songs);
            return songs; }
        function redrawPlaylistDisplay () {
            const sd = app.pdat.songsDict();
            //asq.idx is currently playing song, display rest
            const songs = asq.paths.slice(asq.idx + 1).map((p) => sd[p]);
            mgrs.util.displayQueuedSongs("csa", "csaqueuediv", songs); }
        function playQueueFromIndex () {
            const sd = app.pdat.songsDict();
            const songs = asq.paths.slice(asq.idx).map((p) => sd[p]);
            redrawPlaylistDisplay();
            app.player.playSongQueue("deck.csa", songs); }
        function replaceQueueAndPlay (songs, pfsg) {
            const np = app.player.nowPlayingSong();
            if(pfsg) {  //start playback with provided song
                songs = songs.filter((s) => s.path !== pfsg.path);
                songs.unshift(pfsg); }
            else if(np) {  //include currently playing song first in queue
                songs.unshift(np); }   //prepend currently playing
            asq.paths = songs.map((s) => s.path);
            asq.ts = new Date().toISOString();
            asq.idx = 0;
            redrawPlaylistDisplay();
            if(songs.length) {
                app.player.playSongQueue("deck.csa", songs); } }
        function rebuildPlaybackQueue (pfsg) {
            var songs; var sba = {}; const sd = app.pdat.songsDict();
            songs = asq.paths.map((p) => sd[p]);  //previously queued songs
            songs = mgrs.util.filterByFilters(songs, fcs);  //rem played/invalid
            songs.forEach(function (s) {  //group by artist
                sba[s.ar] = sba[s.ar] || [];
                sba[s.ar].push(s); });
            songs = getPlayableSongs();  //find playable songs, rebuild fcs
            songs.forEach(function (s) {
                sba[s.ar] = sba[s.ar] || [];
                if(!sba[s.ar].find((existing) => s.path === existing.path)) {
                    sba[s.ar].push(s); } });
            songs = mgrs.util.sba2queue(sba, !asq.paths.length)
                .slice(0, app.player.playQueueMax);
            replaceQueueAndPlay(songs, pfsg); }
        function restoreAutoplaySelectionQueueSettings () {
            const deckset = app.pdat.uips("deck");
            deckset.asq = deckset.asq || {};
            asq = deckset.asq;
            asq.paths = asq.paths || [];
            asq.ts = asq.ts || new Date().toISOString();
            if(!(asq.idx >= 0)) {  //undefined or non-numeric value
                asq.idx = -1; } }
        function verifyNowPlayingSong (npStatusChecked) {
            if(app.svc.plat("audsrc") === "Browser") {  //no separate platform
                npStatusChecked = true; }               //player callback
            const np = app.player.nowPlayingSong();
            if(np) {
                if(np.path === asq.paths[asq.idx]) {  //still playing queue
                    redrawPlaylistDisplay(); }
                else {  //now playing something else, rebuild playback queue
                    rebuildPlaybackQueue(); } }
            else {  //no song playing, or playback status not yet known
                if(npStatusChecked) {  //not playing, verify queue and play
                    rebuildPlaybackQueue(); }
                else {  //indeterminate state, call back
                    jt.log("deck.csa check playing " + asq.paths[asq.idx]);
                    app.player.reqUpdatedPlaybackStat(function (/*stat*/) {
                        verifyNowPlayingSong(true); }); } } }
        function remainingQueuedSongsValid () {
            if(asq.idx < 0) {
                jt.log("remainingQueuedSongsValid invalid idx: " + asq.idx);
                return false; }
            if(!asq.paths.length) {
                jt.log("remainingQueuedSongsValid no songs in queue");
                return false; }
            const sd = app.pdat.songsDict();
            const rems = asq.paths.slice(asq.idx + 1).map((p) => sd[p]);
            if(!rems.length) {
                jt.log("remainingQueuedSongsValid no songs remaining");
                return false; }
            const remqlen = rems.length;
            const tempfcs = fcs;   //hold previous full rebuild counts
            const frs = mgrs.util.filterByFilters(rems, fcs);
            fcs = tempfcs;  //restore previous rebuild counts
            if(remqlen !== frs.length) {
                jt.log("remainingQueuedSongsValid some songs invalidated");
                return false; }
            return true; }
        function verifyQueuedPlayback () {
            if(!remainingQueuedSongsValid()) {
                return rebuildPlaybackQueue(); }
            asq.idx = mgrs.util.findIndexByLastPlayedTimestamp(asq.paths);
            if(asq.idx < 0) {  //playback has not followed queue
                jt.log("csa.digDatUpdated playback did not follow queue");
                return rebuildPlaybackQueue(); }
            verifyNowPlayingSong(); }
        function digDatUpdated (/*digdat*/) {
            restoreAutoplaySelectionQueueSettings();
            const deckset = app.pdat.uips("deck");
            if(deckset.seqmgr !== "csa") { return; }
            verifyQueuedPlayback(); }
    return {
        initialize: function () {
            app.pdat.addDigDatListener("deck.csa", digDatUpdated); },
        makeHistoryToggle: function () {  //created by filter
            mgrs.util.makeToggle({
                tfc:toggleButtons, id:"toghistb", ti:"Playback History",
                onimg:"img/historyact.png", offimg:"img/history.png",
                togf:function (state) {
                    if(!state) {
                        jt.byId("deckhistorydiv").style.display = "none";
                        jt.byId("csaqueuediv").style.display = "block"; }
                    else {
                        jt.byId("deckhistorydiv").style.display = "block";
                        jt.byId("csaqueuediv").style.display = "none";
                        mgrs.hst.verifyDisplayContent(); } }}); },
        makeInfoToggle: function () {  //created by filter
            mgrs.util.makeToggle({
                tfc:toggleButtons, id:"toginfob", ti:"Filtering Information",
                onimg:"img/infoact.png", offimg:"img/info.png",
                togf:function (state) {
                    const disp = (state ? "block" : "none");
                    jt.byId("deckfresdiv").style.display = disp; }});
            toggleButtons.toginfob(false); },
        playNextSong: function () {
            if(asq.idx >= 0 && asq.idx < asq.paths.length - 1) {
                asq.idx += 1;
                playQueueFromIndex(); }
            else {
                jt.log("deck.csa.playNextSong: no songs left to play"); } },
        replayQueue: function () {
            playQueueFromIndex(); },
        playGivenSong: function (song) {
            rebuildPlaybackQueue(song); },
        filtersChanged: function () {
            rebuildPlaybackQueue(); },
        songByIndex: function (idx) {  //index of song in visible queue
            //asq[idx] references now playing song. +1 is first song in queue
            const pathidx = asq.idx + 1 + idx;
            return app.pdat.songsDict()[asq.paths[pathidx]]; },
        emptyQueueDisplay: function () {
            var msgs = ["No matching songs found"];
            //modify filtering
            const filts = app.filter.filters("active");
            if(filts.some((f) => f.sumname && f.sumname.match(/^[+\-]/))) {
                //found a filter summary name like "+Office"
                msgs.push("Try turning off keyword filters"); }
            else if(filts.some((f) =>
                f.rgfoc && (f.rgfoc.max - f.rgfoc.min < 80))) {
                msgs.push("Try wider energy level and approachability"); }
            //add more local playable songs and allow access to them
            else {
                msgs.push(jt.tac2html(
                    ["Add songs, verify app access permission, ",
                     ["a", {href:"#reread",
                            onclick:(app.util.dfs("svc", "loc.loadLibrary"))},
                      "retry"]])); }
            return jt.tac2html([msgs.join(". ") + ".",
                                ["div", {id:"nomusicstatdiv"}]]); },
        initDisplay: function () {
            jt.out("csadispdiv", jt.tac2html(
                [["div", {id:"panfiltdiv"}],
                 ["div", {id:"csacontentdiv"},
                  [["div", {id:"csaqueuediv"}],
                   ["div", {id:"deckhistorydiv"}],
                   ["div", {id:"fresframediv"},
                    ["div", {id:"deckfresdiv"}]]]]]));
            app.filter.initializeInterface(); },
        activateDisplay: function () {
            if(!jt.byId("panfiltdiv")) {
                mgrs.csa.initDisplay(); }
            mgrs.util.setPanelResultHeight("csaqueuediv", "panfiltdiv");
            mgrs.util.setPanelResultHeight("deckhistorydiv", "panfiltdiv");
            if(mgrs.gen.getSongSeqMgrName() === "csa") {
                verifyQueuedPlayback(); }
            else {  //sequence manager has changed, need to take control
                mgrs.gen.setSongSeqMgrName("csa");
                rebuildPlaybackQueue(); } }
    };  //end mgrs.csa returned functions
    }());


    //suggested albums manager handles what albums to suggest
    mgrs.sas = (function () {
        var sads = {contentdivid:"", togbuttondivid:"", toggleButtons:{}};
        var suggestedAlbums = null;
        const asgmx = 5;  //max number of album suggestions to display
        function makeAlbumKey (song) {
            if(!(song.ar && song.ab)) { return ""; }
            return song.ar + " - " + song.ab; }
        function calculateAlbumSuggestionsIfNeeded () {
            var abd = {};  //albums dictionary
            if(suggestedAlbums) { return; }  //already calculated
            Object.values(app.pdat.songsDict()).forEach(function (song) {
                if(app.deck.isPlayable(song) &&
                   song.ar && song.ar !== "Unknown" &&
                   song.ab && song.ab !== "Singles") {
                    const key = makeAlbumKey(song);
                    if(key) {
                        abd[key] = abd[key] || {
                            lrp:new Date().toISOString(),  //least recent played
                            mrp:new Date(0).toISOString(), //most recent played
                            songs:[]};
                        if(song.lp < abd[key].lrp) {
                            abd[key].lrp = song.lp; }
                        if(song.lp > abd[key].mrp) {
                            abd[key].mrp = song.lp; }
                        abd[key].songs.push(song); } } });
            suggestedAlbums = Object.values(abd)
                .filter((a) => a.songs.length >= 3);  //not a single from a comp
            suggestedAlbums.forEach(function (a) {  //calc recent max weighting
                a.rmw = (jt.isoString2Time(a.lrp).getTime() +
                         jt.isoString2Time(a.mrp).getTime()); });
            suggestedAlbums.sort(function (a, b) {
                return (a.rmw - b.rmw) || (b.songs.length - a.songs.length); });
            suggestedAlbums = suggestedAlbums.slice(0, asgmx); }
        function displaySuggestedAlbums () {
            calculateAlbumSuggestionsIfNeeded();
            if(!suggestedAlbums || !suggestedAlbums.length) {
                return jt.out(sads.contentdivid, "No albums available."); }
            jt.out(sads.contentdivid, jt.tac2html(
                [["div", {id:"albsuggstitlediv"}, "Suggested Albums"],
                 ["div", {id:"albsuggscontentdiv"},
                  suggestedAlbums.slice(0, asgmx).map((sa, idx) =>
                      ["div", {cla:"sgalbdiv"},
                       ["a", {href:"#play",
                              onclick:mdfs("sas.playSuggestedAlbum", idx)},
                        [["span", {cla:"sgalbarspan"},
                          sa.songs[0].ar],
                         "&nbsp;-&nbsp;",
                         ["span", {cla:"sgalbabspan"},
                          sa.songs[0].ab]]]])]])); }
        function digDatUpdated (/*dbo*/) {
            suggestedAlbums = null;
            const dispdiv = jt.byId(sads.contentdivid);
            if(dispdiv && dispdiv.style.display === "block") {
                displaySuggestedAlbums(); } }
    return {
        initialize: function () {
            app.pdat.addDigDatListener("deck.sas", digDatUpdated); },
        togSuggestAlbums: function (togst) {
            sads.toggleButtons.togsuggb(togst); },
        playSuggestedAlbum: function (idx) {
            mgrs.alb.playAlbum(suggestedAlbums[idx].songs[0], true); },
        initSuggestionsDisplay: function (contentdivid, buttondivid) {
            sads.contentdivid = contentdivid;
            sads.buttondivid = buttondivid;
            mgrs.util.makeToggle({
                tfc:sads.toggleButtons, id:sads.buttondivid,
                ti:"Album Suggestions",
                onimg:"img/suggestact.png", offimg:"img/suggest.png",
                togf:function (state) {
                    const ds = (state ? "block" : "none");
                    jt.byId(sads.contentdivid).style.display = ds;
                    if(state) {
                        displaySuggestedAlbums(); }}}); }
    };  //end mgrs.sas returned functions
    }());


    //Album manager handles album display and playback.
    mgrs.alb = (function () {
        var apq = {paths:[], ts:"", idx:-1};  //album playback queue
        function makeAlbumSongDiv (song, idx, npi) {
            if(idx === npi) {  //index is the now playing song index
                return [["img", {src:"img/arrow12right.png",
                                 cla:"albumarrow inv"}],
                        song.ti]; }
            const tn = idx + 1;  //track number based on available songs
            return ["a", {href:"#playsong" + tn, title:"Play track " + tn,
                          cla:"albumsonglink",
                          onclick:mdfs("alb.playAlbumTrack", idx)},
                    song.ti]; }
        function redrawAlbumDisplay () {
            if(!apq.paths || !apq.paths.length) {
                return jt.out("albplaydiv", "No Album Selected"); }
            const sd = app.pdat.songsDict();
            const songs = apq.paths.map((p) => sd[p]);
            jt.out("albplaydiv", jt.tac2html(
                [["div", {cla:"albumtitlediv"},
                  [["span", {cla:"dsabspan"}, songs[0].ab],
                   " - ",
                   ["span", {cla:"dsarspan"}, songs[0].ar]]],
                 songs.map((song, idx) =>
                     makeAlbumSongDiv(song, idx, apq.idx))])); }
        function setPathsAndIndexFromSong (song) {
            apq.paths = Object.values(app.pdat.songsDict())
                .filter((s) => s.ar === song.ar && s.ab === song.ab)
                .sort(mgrs.alb.trackOrderComparator)  //sort, then dedupe
                .filter((s, idx, arr) => !idx || s.ti !== arr[idx - 1].ti)
                .map((s) => s.path);
            apq.idx = apq.paths.findIndex((p) => p === song.path); }
        function playAlbumFromIndex () {
            const sd = app.pdat.songsDict();
            const songs = apq.paths.map((p) => sd[p]);
            const remaining = songs.slice(apq.idx);
            apq.ts = new Date().toISOString();
            app.player.playSongQueue("deck.alb", remaining); }
        function verifyAlbumQueuedPlayback () {
            const np = app.player.nowPlayingSong();
            if(np) {
                apq.idx = apq.paths.findIndex((p) => p === np.path);
                if(apq.idx >= 0) {  //found currently playing on album
                    redrawAlbumDisplay(); }
                else {  //playing a different album now
                    setPathsAndIndexFromSong(np); } }
            else {  //nothing currrently playing
                if(!apq.paths.length || apq.idx >= apq.paths.length - 1) {
                    //no songs or already played the last song
                    mgrs.sas.togSuggestAlbums(true); }
                else {  //have songs and not on last track
                    mgrs.sas.togSuggestAlbums(false);
                    redrawAlbumDisplay();
                    playAlbumFromIndex(); } } }
        function restoreAlbumPlaybackSettings () {
            const deckset = app.pdat.uips("deck");
            deckset.seqmgr = deckset.seqmgr || "alb";  //default to alb if unset
            deckset.apq = deckset.apq || {};
            apq = deckset.apq;
            apq.paths = apq.paths || [];
            apq.ts = apq.ts || new Date().toISOString();
            if(!(apq.idx >= 0)) {  //undefined or non-numeric value
                apq.idx = -1; } }
        function digDatUpdated (/*digdat*/) {
            restoreAlbumPlaybackSettings();
            const deckset = app.pdat.uips("deck");
            if(deckset.seqmgr !== "alb") { return; }
            verifyAlbumQueuedPlayback(); }
    return {
        initialize: function () {
            app.pdat.addDigDatListener("deck.alb", digDatUpdated); },
        trackOrderComparator: function (a, b) {
            //sort by metadata disk number first
            if(a.mddn && !b.mddn) { return -1; }
            if(!a.mddn && b.mddn) { return 1; }
            if(a.mddn && b.mddn && a.mddn !== b.mddn) {
                return a.mddn - b.mddn; }
            //disk numbers equivalent, sort by track number
            if(a.mdtn && !b.mdtn) { return -1; }
            if(!a.mdtn && b.mdtn) { return 1; }
            if(a.mdtn && b.mdtn && a.mdtn !== b.mdtn) {
                return a.mdtn - b.mdtn; }
            //track numbers equivalent, sort by path
            return a.path.localeCompare(b.path); },
        playAlbum: function (song, fromBeginning) {
            mgrs.gen.setSongSeqMgrName("alb");  //verify set (search from csa)
            setPathsAndIndexFromSong(song);
            if(fromBeginning) {
                apq.idx = 0; }
            mgrs.sas.togSuggestAlbums(false);
            redrawAlbumDisplay();
            playAlbumFromIndex(); },
        playAlbumTrack: function (idx) {  //queue index, not track number
            //Calling playAlbum is long way around, but easy to follow
            const song = app.pdat.songsDict()[apq.paths[idx]];
            mgrs.alb.playAlbum(song); },
        playNextSong: function () {
            //rather ignore a skip button press than loop back to start
            if(apq.idx < apq.paths.length - 1) {
                apq.idx += 1;
                playAlbumFromIndex(); } },
        replayQueue: function () {
            playAlbumFromIndex(); },
        initDisplay: function () {
            jt.out("albdispdiv", jt.tac2html(
                [["div", {id:"albsuggsframediv"},
                  ["div", {id:"albsuggsdiv", style:"display:none"}]],
                 ["div", {id:"albsuggtogdiv"},
                  ["div", {id:"togsuggb"}]],
                 ["div", {id:"albplaydiv"}]]));
            mgrs.sas.initSuggestionsDisplay("albsuggsdiv","togsuggb");
            mgrs.sas.togSuggestAlbums(false); },
        activateDisplay: function () {
            if(!jt.byId("albsuggtogdiv")) {
                mgrs.alb.initDisplay(); }
            mgrs.util.setPanelResultHeight("albplaydiv");
            if(mgrs.gen.getSongSeqMgrName() === "alb") {
                verifyAlbumQueuedPlayback(); }
            else {  //sequence manager has changed, need to take control
                mgrs.gen.setSongSeqMgrName("alb");
                mgrs.alb.playAlbum(app.player.nowPlayingSong()); } }
    };  //end mgrs.alb returned functions
    }());


    //Search manager handles search the search display
    mgrs.srch = (function () {
        var qstr = "";  //current query string
        var songs = null;
        var rslt = null;
        var counts = null;
        var sfds = [
            {f:"ar", pn:"Artist", ck:true},
            {f:"ab", pn:"Album", ck:true},
            {f:"ti", pn:"Title", ck:true},
            {f:"genrejson", pn:"Genre", ck:true},
            {f:"nt", pn:"Notes", ck:true}];
        function updateCounts (ignore /*artist*/, album/*, title*/) {
            //A compilation with lots of artists on one album should be
            //counted as one album.  This might collapse "Greatest Hits"
            //from two different artists, but that's preferable.
            counts.abs[album] = true;
            //Func is called once for each matching song, so just increment.
            //This total may differ from the countspan total in the upper
            //right of the app if there are ignore folders.  That's ok.
            counts.sc += 1; }
        function searchSongs () {
            if(!songs) {
                songs = Object.values(app.pdat.songsDict())
                    .filter((s) => app.deck.isSearchable(s)); }
            //match start after space, dquote, or start of string. Wildcard ok.
            const rtx = "(\\s|\"|^)" + qstr.toLowerCase().replace("*", ".*");
            const srx = new RegExp(rtx, "i");
            const sfs = sfds.filter((fd) => fd.ck);
            rslt = {};  //reset search results
            counts = {abs:{}, sc:0};
            songs.forEach(function (s, idx) {
                const mf = sfs.find((fd) => s[fd.f] && s[fd.f].match(srx));
                if(mf) {  //one of the fields matched, verify rslt entry
                    rslt[s.ar] = rslt[s.ar] ||
                        {matched:(mf.f === "ar"),
                         t:"ar", si:idx, es:{}};
                    const artist = rslt[s.ar];  //add albums to artist
                    artist.es[s.ab] = artist.es[s.ab] ||
                        {matched:(mf.f === "ab" || s.ab.match(srx)),
                         t:"ab", si:idx, es:{}};
                    const album = artist.es[s.ab];  //add songs to album
                    album.es[s.ti] = album.es[s.ti] ||  //dupe possible
                        {matched:(mf.f === "ti" || s.ti.match(srx) ||
                                  mf === "nt" || s.ti.match(srx)),
                         t:"ti", si:idx, mddn:s.mddn, mdtn:s.mdtn,
                         path:s.path};
                    //const title = album.es[s.ti];
                    updateCounts(s.ar, s.ab, s.ti); } }); }
        function makeResultTAC (dict, context) {
            context = context || {lev:"0"};
            const sks = Object.keys(dict).sort(
                function (a, b) {
                    if(dict[a].t === "ti") {
                        return mgrs.alb.trackOrderComparator(dict[a],
                                                             dict[b]); }
                    else {
                        return a.localeCompare(b); } });
            return sks.map(function (fv, idx) {
                const det = dict[fv];
                const dln = {xpc:"",
                             val:["span", {cla:"srchresvspan"}, fv],
                             esdd:"block"};
                if(det.es) {  //need an expand/close control
                    dln.xpc = ["a", {cla:"srchxpctoga", href:"#close",
                                     onclick:mdfs("srch.togResExp", "event")},
                               "-"];
                    if(det.matched || context.parentMatched) {
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
                    const song = songs[det.si];
                    const elemid = "skst" + context.lev + "_" + idx;
                    const attrs = {href:"playsong", id:elemid,
                                   title:jt.escq(song.path),
                                   "data-fv":jt.escq(fv),
                                   onclick:mdfs("srch.playSong", det.si)};
                    if(!app.deck.isPlayable(song)) {
                        attrs.href = "unsupported";
                        attrs.cla = "noplaylinka";
                        attrs.onclick = mdfs("srch.unsuppSong", elemid); }
                    dln.val = ["a", attrs, dln.val]; }
                return ["div", {cla:"rslt" + det.t + "div"},
                        [dln.xpc,
                         dln.val,
                         (!det.es? "" : 
                          ["div", {cla:"rslt" + det.t + "childrendiv",
                                   style:"display:" + dln.esdd},
                           makeResultTAC(det.es, {
                               lev:context.lev + idx,
                               parentMatched:det.matched})])]]; }); }
    return {
        playAlbum: function (sidx) {
            mgrs.gen.dispMode("alb");
            mgrs.alb.playAlbum(songs[sidx], true); },
        playSong: function (sidx) {
            const song = songs[sidx];
            jt.log("srch.playSong " + JSON.stringify(song));
            mgrs.gen.dispMode("csa");
            mgrs.csa.playGivenSong(song); },
        unsuppSong: function (elemid) {
            const nsmsg = "Song format not supported by player";
            const elem = jt.byId(elemid);
            jt.log("srch.unsuppSong " + elemid + ": " + elem.title +
                   " (" + elem.dataset.fv + ")");
            if(elem.innerHTML === nsmsg) {
                elem.innerHTML = elem.title; }  //show path
            else if(elem.innerHTML === elem.title) {
                elem.innerHTML = elem.dataset.fv; }  //show title
            else {
                elem.innerHTML = nsmsg; } },
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
            jt.out("srchcountsdiv", jt.tac2html(
                [Object.entries(counts.abs).length, " albums, ",
                 counts.sc, " songs"]));
            jt.out("srchresdiv", jt.tac2html(makeResultTAC(rslt))); },
        setSearchQueryString: function (txt) {
            qstr = txt; },
        clearSearch: function () {
            jt.byId("srchin").value = "";
            mgrs.srch.updateSearchDisplay(); },
        fcheckchg: function (idx) {
            sfds[idx].ck = !sfds[idx].ck;
            mgrs.srch.updateSearchDisplay(); },
        initDisplay: function () {
            jt.out("srchdispdiv", jt.tac2html(
                [["div", {id:"srchctrlsdiv"},
                  [["div", {id:"srchcountsdiv"}],
                   ["input", {type:"text", id:"srchin", size:20,
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
        var stats = {};  //informational counts from song walk through
        function incrementPlayDispositionCount (disposition) {
            disposition = disposition || "noval";
            stats.pdc[disposition] = stats.pdc[disposition] || 0;
            stats.pdc[disposition] += 1; }
        function songDataUpdated () {
            stats = {ttl:0, tlp:0, pdc:{}};  //reset stats
            const songs = Object.values(app.pdat.songsDict())
                  .filter((s) => app.deck.isPlayable(s));
            pps = [];  //reset previously played songs
            songs.forEach(function (song) {
                stats.ttl += 1;
                if(song.lp) {  //filter for songs marked as played
                    stats.tlp += 1;
                    incrementPlayDispositionCount(song.pd);
                    pps.push(song); } });
            jt.log("deck.hst rebuilt from " + stats.tlp + "/" + stats.ttl +
                   " songs. " + JSON.stringify(stats.pdc));
            pps = pps.sort(function (a, b) {
                return b.lp.localeCompare(a.lp); })
                .slice(0, 100); }
    return {
        initialize: function () {
            app.pdat.addDigDatListener("deck.hst", songDataUpdated); },
        emptyQueueDisplay: function () {
            return "No songs played yet"; },
        songs: function () { return pps; },
        songByIndex: function (idx) { return pps[idx]; },
        playbackError: function (idx) {
            var playerr = "";
            const song = pps[idx];
            if(song.pd.startsWith("error")) {
                playerr = song.pd.slice(5).trim(); }
            return playerr; },
        //prepend the song to history so it can be accessed for playback
        noteSongPlayed: function (song) {
            pps = pps.filter((s) => s.path !== song.path);
            pps.unshift(song); },
        verifyDisplayContent: function () {
            if(!pps.length) {
                return jt.out("deckhistorydiv", "No songs played yet"); }
            mgrs.util.displayQueuedSongs("hst", "deckhistorydiv", pps); }
    };  //end mgrs.hst returned functions
    }());


    //hub service utility manager handles general hub communication processing
    //in support of specific platform svc implementations.
    mgrs.hsu = (function () {
        function writeUpdatedAccount (updacc) {
            var conf = app.pdat.configObj();
            var accts = conf.acctsinfo.accts;
            var aidx = accts.findIndex((a) => a.dsId === updacc.dsId);
            updacc.token = accts[aidx].token;
            accts[aidx] = updacc;
            app.pdat.writeConfig("deck.hsu.writeUpdatedAccount", function () {
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
                "lp", "pd", "pc"];    //copy most recent play info
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
                const dbo = app.pdat.dbObj();
                updsongs.forEach(function (s) {
                    updateLocalSong(dbo, s); });
                app.pdat.writeDigDat("deck.hsu.updateSynchronizedSongs"); } }
    };  //end mgrs.hsu returned functions
    }());


    //general manager is main interface for the module
    mgrs.gen = (function () {
        var mdms = [   //major display modes
            {mgr:"csa", name:"Autoplay", img:"deck.png"},
            {mgr:"alb", name:"Album", img:"album.png"},
            {mgr:"srch", name:"Search", img:"search.png"}];
        var songSeqMgrName = "alb";
    return {
        getSongSeqMgrName: function () { return songSeqMgrName; },
        setSongSeqMgrName: function (mgr) {
            songSeqMgrName = mgr;
            const deckset = app.pdat.uips("deck");
            deckset.seqmgr = mgr; },
        dispMode: function (mgrname, displayOnly) {
            mdms.forEach(function (dm) {
                jt.byId(dm.mgr + "mdmbdiv").className = "mdmbdiv";
                jt.byId(dm.mgr + "dispdiv").style.display = "none"; });
            jt.byId(mgrname + "mdmbdiv").className = "mdmbdivact";
            jt.byId(mgrname + "dispdiv").style.display = "block";
            if(!displayOnly) {
                mgrs[mgrname].activateDisplay(); } },  //setSongSeqMgrName
        currentlyPlayingSongChanged: function () {
            mgrs[songSeqMgrName].activateDisplay(); },
        playNextSong: function () {
            mgrs[songSeqMgrName].playNextSong(); },
        replayQueue: function () {
            mgrs[songSeqMgrName].replayQueue(); },
        initDisplay: function () {
            jt.out("pandeckdiv", jt.tac2html(
                [["div", {id:"deckheaderdiv"},
                  mdms.map((dm) =>
                      ["div", {cla:"mdmbdiv", id:dm.mgr + "mdmbdiv",
                               onclick:mdfs("gen.dispMode", dm.mgr)},
                       ["img", {cla:"mdmbimg inv", title:dm.name,
                                src:"img/" + dm.img,
                                onclick:mdfs("gen.dispMode", dm.mgr)}]])],
                 ["div", {id:"deckcontentdiv"},
                  mdms.map((dm) =>
                      ["div", {cla:"mdmdispdiv", id:dm.mgr + "dispdiv",
                               style:"display:none;"}])]]));
            mdms.forEach(function (dm) {
                if(mgrs[dm.mgr].initDisplay) { mgrs[dm.mgr].initDisplay(); }});
            mgrs.gen.dispMode(songSeqMgrName, "displayOnly"); },
        initialize: function () {
            app.pdat.addApresDataNotificationTask("deckDataInit", function () {
                const songcount = Object.values(app.pdat.songsDict()).length;
                app.top.dispCount(songcount, "avail");
                const deckset = app.pdat.uips("deck");
                const seqmgr = (deckset && deckset.seqmgr) || "alb";
                mgrs.gen.dispMode(seqmgr); }); }
    };  //end mgrs.gen returned functions
    }());

return {
    init: function () {
        mgrs.gen.initDisplay();
        Object.entries(mgrs).forEach(function ([name, mgr]) {
            if(mgr.initialize) {
                jt.log("initializing deck." + name);
                mgr.initialize(); } }); },
    filtersChanged: mgrs.csa.filtersChanged,
    currentlyPlayingSongChanged: mgrs.gen.currentlyPlayingSongChanged,
    playNextSong: mgrs.gen.playNextSong,  //player skip
    replayQueue: mgrs.gen.replayQueue,    //player sleep activation
    isUnrated: function (s) { return (!s.kws && s.el === 49 && s.al === 49); },
    isSearchable: function (s) {  //not Deleted or Ignore folder.
        //if you copy a song onto your phone and then can't find it, that's
        //exceptionally annoying.  Allow it to be found in search, but
        //report if it's not playable.
        return (!s.fq || !s.fq.match(/^[DI]/)); },
    isPlayable: function (s) {  //not Deleted, Unreadable, Ignore. okToPlay
        return ((!s.fq || !s.fq.match(/^[DUI]/)) &&
                (!app.svc.okToPlay || app.svc.okToPlay(s))); },
    isDeckable: function (s) {  //not Reference-only or Metadata-mismatch
        return (app.deck.isPlayable(s) &&
                (!s.fq || !s.fq.match(/^[RM]/))); },
    dispatch: function (mgrname, fname, ...args) {
        try {
            return mgrs[mgrname][fname].apply(app.deck, args);
        } catch(e) {
            jt.log("deck.dispatch " + mgrname + "." + fname + " " + e +
                   " " + e.stack);
        } }
};  //end of module returned functions
}());
