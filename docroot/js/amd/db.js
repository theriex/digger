/*global app, jt */
/*jslint browser, white, fudge, for, long */

app.db = (function () {
    "use strict";

    var dbo = null;
    var dbstat = {currstat: "ready",
                  ready: "",
                  loading: "Loading Data...",
                  reading: "Reading Files...",
                  merging: "Merging Data..."};
    var deckstat = {filter:true, qstr:"", disp:"songs", toggles:{},
                    maxdecksel:1000, work:{status:"", timer:null},
                    ws:[], fcs:[], pns:[],
                    fqps:["N", "P", "B", "Z", "O"]};
    var albumstat = null;


    function verifyAlbumStat (np) {
        if(!np) {
            albumstat = null;
            return jt.out("deckalbumdiv", "No song currently playing"); }
        if(!np.ab) {
            albumstat = null;
            return jt.out("deckalbumdiv", "Album info not available"); }
        if(albumstat && albumstat.ab === np.ab && albumstat.ar === np.ar) {
            return true; }
        albumstat = {ab:np.ab, ar:np.ar, songs:[]};
        Object.keys(dbo.songs).forEach(function (path) {
            var song = dbo.songs[path];
            if(song.ab === np.ab) {
                albumstat.songs.push(song); } });
        albumstat.songs.sort(function (a, b) {
            if(a.path < b.path) { return -1; }
            if(a.path > b.path) { return 1; }
            return 0; });
        albumstat.songs.forEach(function (song, idx) {
            if(song.ti === np.ti) {
                albumstat.selidx = idx;  //selected from deck or by click
                albumstat.curridx = idx; } });
        return true;
    }


    function updateAlbumDisplayContent () {
        var np = app.player.song();
        if(!verifyAlbumStat(np)) {
            return; }
        var html = [];
        albumstat.songs.forEach(function (song, idx) {
            var tn = idx + 1;
            var lh = ["a", {href:"#playsong" + tn, title:"Play track " + tn,
                            cla:"albumsonglink",
                            onclick:jt.fs("app.db.albumplay(" + idx + ")")},
                      song.ti];
            if(idx === albumstat.curridx) {  //unicode right arrow is sketchy
                lh = [["img", {src:"img/arrow12right.png", cla:"albumarrow"}],
                      song.ti]; }
            html.push(["div", {cla:"albumsongdiv"}, lh]); });
        jt.out("deckalbumdiv", jt.tac2html(
            [["div", {cla:"albumtitlediv"},
              [["span", {cla:"dsabspan"}, np.ab],
               " - ",
               ["span", {cla:"dsarspan"}, np.ar]]],
             html]));
    }


    function albumPlayNow (idx) {
        albumstat.curridx = -1;
        albumstat.selidx = idx;
        app.player.next();
    }


    function albumPlayNext () {
        if(jt.byId("deckalbumdiv").style.display !== "block") {
            return null; }  //not in album play mode
        if(albumstat.curridx < 0) {  //clicked a specific album track to play
            albumstat.curridx = albumstat.selidx;
            updateAlbumDisplayContent();
            return albumstat.songs[albumstat.selidx]; }
        var nextidx = (albumstat.curridx + 1) % albumstat.songs.length;
        if(nextidx !== albumstat.selidx) {  //haven't played all tracks yet
            albumstat.curridx = nextidx;
            updateAlbumDisplayContent();
            return albumstat.songs[albumstat.curridx]; }
        //all tracks from album played, exit album mode.
        deckstat.toggles.togalb();
        return null;
    }


    function makeToggle (spec) {
        var div = jt.byId(spec.id);
        div.style.display = "inline-block";
        div.style.position = "relative";
        spec.h = spec.h || 20;
        spec.w = spec.w || 40;
        div.style.height = spec.h + "px";
        div.style.width = spec.w + "px";
        div.style.verticalAlign = "middle";
        div.style.cursor = "pointer";
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
                onimg.style.opacity = 1.0;
                offimg.style.opacity = 0.0;
                if(!reflectonly) {
                    spec.togf(true); } }
            else {  //turn off
                onimg.style.opacity = 0.0;
                offimg.style.opacity = 1.0;
                if(!reflectonly) {
                    spec.togf(false); } } };
        jt.on(div, "click", function (ignore /*event*/) {
            var offimg = jt.byId(spec.id + "offimg");
            spec.tfc[spec.id](offimg.style.opacity > 0); });
    }


    function showDeckSection (showing) {
        showing = showing || "songs";
        var sections = ["songs", "album", "info"];
        var buttons = ["", "togalb", "toginfob"];
        sections.forEach(function (section, idx) {
            var togbf = deckstat.toggles[buttons[idx]];
            if(section === showing) {  //button is already toggled on
                jt.byId("deck" + section + "div").style.display = "block"; }
            else {
                jt.byId("deck" + section + "div").style.display = "none";
                if(togbf) {
                    togbf("", true); } } });
        deckstat.disp = showing;
        if(showing === "album") {
            updateAlbumDisplayContent(); }
    }


    function makeDeckToggleControls () {
        makeToggle({id:"togfiltb", w:46, h:20, tfc:deckstat.toggles,
                    togf:function (state) {
                        if(state) {
                            jt.byId("panfiltcontentdiv").style.opacity = 1.0;
                            deckstat.filter = true; }
                        else {
                            jt.byId("panfiltcontentdiv").style.opacity = 0.3;
                            deckstat.filter = false; }
                        jt.log("deckstat.filter: " + deckstat.filter);
                        app.db.deckupd(); },
                    onimg:"img/filteron.png", onlabel:"",
                    offimg:"img/filteroff.png", offlabel:""});
        makeToggle({id:"togalb", w:20, h:20, tfc:deckstat.toggles,
                    togf:function (state) {
                        // if(state) { showDeckSection("songs"); }
                        // else { showDeckSection("album"); } }
                        showDeckSection(state ? "album" : "songs"); },
                    onimg:"img/albumact.png", onlabel:"",
                    offimg:"img/album.png", offlabel:""});
        makeToggle({id:"toginfob", w:20, h:20, tfc:deckstat.toggles,
                    togf:function (state) {
                        showDeckSection(state ? "info" : "songs"); },
                    onimg:"img/infoact.png", onlabel:"",
                    offimg:"img/info.png", offlabel:""});
    }


    function initDeckElements () {
        jt.out("pandeckdiv", jt.tac2html(
            [["div", {id:"deckheaderdiv"},
              [["div", {cla:"togbdiv", id:"togfiltb"}],
               ["input", {type:"text", id:"srchin", size:23,
                          placeholder:"artist/album/song...",
                          value:deckstat.qstr,
                          oninput:jt.fs("app.db.deckupd()")}],
               ["a", {href:"#search", title:"Search Songs",
                      onclick:jt.fs("app.db.deckupd()")},
                ["img", {src:"img/search.png", cla:"ico20"}]],
               ["div", {cla:"togbdiv", id:"togalb"}],
               ["div", {cla:"togbdiv", id:"toginfob"}]]],
             ["div", {id:"deckinfodiv", style:"display:none;"}],
             ["div", {id:"deckalbumdiv", style:"display:none;"}],
             ["div", {id:"decksongsdiv"}]]));
        makeDeckToggleControls();
        deckstat.toggles.togfiltb(true);
    }


    function updateDeckInfoDisplay (phasename) {
        deckstat.fcs.push({filter:phasename, sc:deckstat.ws.length});
        var html = [];
        deckstat.fcs.forEach(function (stat) {
            html.push(["div", {cla:"dinfrecdiv"},
                       [["span", {cla:"dinfrectspan"},
                         stat.filter + ": "],
                        ["span", {cla:"dinfrecnspan"}, stat.sc]]]); });
        jt.out("deckinfodiv", jt.tac2html(html));
    }


    function recalcFrequencyCutoffs () {
        var day = 24 * 60 * 60 * 1000;
        var now = Date.now();
        deckstat.freqlim = {
            N:{days:1},
            P:{days:1},
            W:{days:7},  //used for playprio
            M:{days:30}, //used for playprio
            B:{days:dbo.waitcodedays.O || 90},
            Z:{days:dbo.waitcodedays.Z || 180},
            O:{days:dbo.waitcodedays.O || 365}};
        Object.keys(deckstat.freqlim).forEach(function (key) {
            var flim = deckstat.freqlim[key];
            flim.iso = new Date(now - (flim.days * day)).toISOString(); });
    }


    //Shuffling can cause starvation of unplayed tracks.  Assign a play
    //priority sort bucket value based on when the song was last played.
    function setSongPlayPriority (song) {
        song.playprio = 0;  //not played yet, or older than a year
        if(song.lp) {
            var prios = ["O", "Z", "B", "M", "W", "P"];
            song.playprio = prios.findIndex(
                (flk) => song.lp < deckstat.freqlim[flk].iso);
            if(song.playprio < 0) {
                song.playprio = prios.length; } }
    }


    function rebuildWorkingSet () {
        deckstat.ws = [];
        deckstat.fcs = [];
        recalcFrequencyCutoffs();        
        Object.keys(dbo.songs).forEach(function (path) {
            var song = dbo.songs[path];
            if(!song.fq.startsWith("D") && !song.fq.startsWith("U")) {
                //song file eligible. Artist/Album/Title may be incomplete.
                song.path = path;
                setSongPlayPriority(song);
                deckstat.ws.push(song); } });
        updateDeckInfoDisplay("Readable files");
    }


    function filterBySearchText () {
        var st = jt.byId("srchin").value || "";
        st = st.toLowerCase().trim();
        if(st) {
            deckstat.ws = deckstat.ws.filter(function (song) {
                if((song.ar && song.ar.toLowerCase().indexOf(st) >= 0) ||
                   (song.ab && song.ab.toLowerCase().indexOf(st) >= 0) ||
                   (song.ti && song.ti.toLowerCase().indexOf(st) >= 0) ||
                   (song.path.toLowerCase().indexOf(st) >= 0) ||
                   (song.kws && song.kws.toLowerCase().indexOf(st) >= 0)) {
                    return true; }
                return false; });
            updateDeckInfoDisplay("Search Text"); }
    }


    function filterByFilters () {
        if(deckstat.filter) {  //filtering is on, not bypassed
            app.filter.filters().forEach(function (filt) {
                deckstat.ws = deckstat.ws.filter((song) => filt.match(song));
                updateDeckInfoDisplay(filt.pn); }); }
    }


    function pullPNSFromWS () {
        deckstat.ws = deckstat.ws.filter(function (song) {
            return (deckstat.pns.indexOf(song) < 0); });
    }


    function sortByLastPlayedAndFrequency () {
        //the rating is a filter, not a sort criteria.
        var fqps = deckstat.fqps;
        deckstat.ws.sort(function (a, b) {
            //sort by last played, oldest first
            if(a.lp && !b.lp) { return 1; }
            if(!a.lp && b.lp) { return -1; }
            if(a.lp && b.lp) {
                if(a.lp < b.lp) { return -1; }
                if(a.lp > b.lp) { return 1; } }
            //if last played is the same, sort by frequency
            if(a.fq && b.fq) {
                var afqi = fqps.indexOf(a.fq);
                if(afqi < 0) { afqi = fqps.length; }
                var bfqi = fqps.indexOf(b.fq); 
                if(bfqi < 0) { bfqi = fqps.length; }
                return afqi - bfqi; }
            return 0; });
    }


    function frequencyEligible (song) {
        if(!song.lp) {  //not played yet (just imported)
            return true; }
        if(deckstat.fqps.indexOf(song.fq) < 0) { //"R" or invalid fq value
            return false; }
        var lim = deckstat.freqlim[song.fq].iso;
        return song.lp < lim;
    }


    function truncateAndShuffle () {
        if(deckstat.ws.length <= 2) { return; }  //not enough to work with
        //truncate to a reasonable size pool if very large
        deckstat.ws = deckstat.ws.slice(0, deckstat.maxdecksel);
        //eliminate all recently played stuff if filtering
        var idx = deckstat.ws.length - 1;
        if(deckstat.filter) {
            while(!frequencyEligible(deckstat.ws[idx])) {
                idx -= 1; }
            if(idx < deckstat.ws.length - 1) {  //filtered at least one item
                deckstat.ws = deckstat.ws.slice(0, idx); } }
        updateDeckInfoDisplay("Deck Pool");
        //shuffle
        idx = deckstat.ws.length; var randidx; var tmp;
        while(idx !== 0) {  //leave first element (oldest) alone
            randidx = Math.floor(Math.random() * idx);
            idx -= 1;
            tmp = deckstat.ws[idx];
            deckstat.ws[idx] = deckstat.ws[randidx];
            deckstat.ws[randidx] = tmp; }
        //bucket sort to avoid starvation of older tracks on deck pop
        deckstat.ws.sort(function (a, b) {
            return a.playprio - b.playprio; });
    }


    function songTitleTAC (song) {
        //fill artist/album/title from path if needed
        if(!(song.ar && song.ab && song.ti)) {  //shouldn't happen often
            var pes = song.path.split("/");
            song.ti = pes[pes.length - 1];
            if(pes.length >= 3) {
                song.ar = pes[pes.length - 3];
                song.ab = pes[pes.length - 2]; }
            else if(pes.length >= 2) {
                song.ar = pes[pes.length - 2]; } }
        var sep = " - ";
        return ["div", {cla:"songtitlediv"},
                [["span", {cla:"dstispan"}, song.ti],
                 sep,
                 ["span", {cla:"dsarspan"}, song.ar || "???"],
                 sep,
                 ["span", {cla:"dsabspan"}, song.ab || ""]]];
    }


    function appendSongsToDisplay (prefix, songs) {
        var songsdiv = jt.byId("decksongsdiv");
        songs.forEach(function (song, idx) {
            var elem = document.createElement("div");
            elem.className = "decksongdiv";
            var tac = songTitleTAC(song);
            tac[2] = [["a", {href:"#songactions", title:"Play or Remove Song",
                             onclick:jt.fs("app.db.songopts('" + 
                                           prefix + "'," + idx + ")")},
                       tac[2]],
                      ["div", {cla:"decksongactdiv", id:"da" + prefix + idx}]];
            elem.innerHTML = jt.tac2html(tac);
            songsdiv.appendChild(elem); });
    }


    function displaySongs () {
        if(!deckstat.ws.length && !deckstat.pns.length) {
            jt.out("decksongsdiv", "No matching songs found.");
            return; }
        jt.out("decksongsdiv", "");
        appendSongsToDisplay("pns", deckstat.pns);
        appendSongsToDisplay("ws", deckstat.ws);
    }


    function toggleSongOptions (prefix, idx) {
        var optdiv = jt.byId("da" + prefix + idx);
        if(optdiv.innerHTML) {  //reset whatever content was there before
            optdiv.innerHTML = "";
            return; }
        var tac = [
            ["button", {type:"button", id:"deckplaynowb" + prefix + idx,
                         title:"Play now, replacing the current song",
                         onclick:jt.fs("app.db.playnow('" + 
                                       prefix + "'," + idx + ")")},
              "Play Immediately"],
             ["button", {type:"button", id:"deckplaynextb" + prefix + idx,
                         title:"Play after current song finishes",
                         onclick:jt.fs("app.db.playnext('" +
                                       prefix + "'," + idx + ")")},
              "Play Next"],
             ["button", {type:"button", id:"deckremoveb" + prefix + idx,
                         title:"Remove current song from on deck",
                         onclick:jt.fs("app.db.rembuttons('" +
                                       prefix + "'," + idx + ")")},
              "Remove"]];
        if(prefix === "pns") {  //song is already in play next list
            tac.splice(1, 1); } //remove the play next button
        optdiv.innerHTML = jt.tac2html(tac);
    }


    function deckPlayNow (prefix, idx) {
        if(prefix === "pns") {  //song already in play next list
            if(idx !== 0) { //not up next, swap into first position
                var tmp = deckstat.pns[0];
                deckstat.pns[0] = deckstat.pns[idx];
                deckstat.pns[idx] = tmp; } }
        else {  //song in general working set, not in play next list
            deckstat.pns.unshift(deckstat.ws[idx]);  //prepend to pns
            deckstat.ws.splice(idx, 1); } //remove from ws
        app.player.next();
    }


    function deckPlayNext (ignore /*prefix*/, wsidx) {
        //No "Play Next" button if already queued to play next
        deckstat.pns.push(deckstat.ws[wsidx]);
        deckstat.ws.splice(wsidx, 1);
        displaySongs();
    }


    function deckRemoveButtons (prefix, idx) {
        jt.out("da" + prefix + idx, jt.tac2html(
            ["div", {cla:"deckrembuttonsdiv"},
             [["button", {type:"button", id:"drmpb" + prefix + idx,
                          title:"Move to bottom of collection play pool",
                          onclick:jt.fs("app.db.deckremove('mp','" +
                                        prefix + "'," + idx + ")")},
               "Mark As Played"],
              ["button", {type:"button", id:"drnsb" + prefix + idx,
                          title:"Remove from possible suggested songs",
                          onclick:jt.fs("app.db.deckremove('ns','" +
                                        prefix + "'," + idx + ")")},
               "Never Suggest"]]]));
    }


    function updateSavedSongData (song, contf) {
        jt.call("POST", "/songupd", jt.objdata(song),
                function (updsong) {
                    dbo[updsong.path] = updsong;
                    contf(updsong); },
                function (code, errtxt) {
                    jt.out("deckDoRemove " + code + ": " + errtxt); },
                jt.semaphore("db.updateSavedSongData"));
    }


    function deckDoRemove (type, prefix, idx) {
        var song = deckstat[prefix][idx];
        if(type === "ns") {
            song.fq = "R"; }
        song.lp = new Date().toISOString();
        updateSavedSongData(song, function (updsong) {
            jt.log("deckDoRemove type:" + type + " " + 
                   JSON.stringify(updsong)); });
        deckstat[prefix].splice(idx, 1);
        displaySongs();
    }


    function updateDeckSynchronous () {
        if(!jt.byId("deckheaderdiv")) {
            initDeckElements(); }
        if(deckstat.toggles.infotimeout) {
            clearTimeout(deckstat.toggles.infotimeout);
            deckstat.toggles.infotimeout = null; }
        deckstat.toggles.toginfob(true);  //show status while working
        rebuildWorkingSet();  //initializes deckstat.ws/fcs
        filterBySearchText();
        filterByFilters();
        pullPNSFromWS();
        sortByLastPlayedAndFrequency();
        truncateAndShuffle();
        if(deckstat.ws.length) {  //show songs if any found
            app.player.deckUpdated();
            deckstat.toggles.infotimeout = setTimeout(function () {
                deckstat.toggles.toginfob(false);
                deckstat.toggles.infotimeout = null; }, 800); }
        displaySongs();
        deckstat.work.status = "";
    }


    function updateDeck () {
        if(!app.filter.filtersReady()) {
            return; }  //ignore spurious calls before filter is done setting up
        if(deckstat.work.status) {  //already ongoing
            if(deckstat.work.timer) {
                clearTimeout(deckstat.work.timer);
                deckstat.work.timer = null; }
            deckstat.work.timer = setTimeout(updateDeck, 1200);
            return; }
        deckstat.work.status = "updating";
        setTimeout(updateDeckSynchronous, 50);  //time consuming, yield to UI
    }


    function popSongFromDeck () {
        var song = albumPlayNext();
        if(song) {  //in album mode and had next track to play
            return song; }
        if(deckstat.pns.length > 0) {
            song = deckstat.pns[0];
            deckstat.pns = deckstat.pns.slice(1); }
        else if(deckstat.ws.length > 0) {
            song = deckstat.ws[0];
            deckstat.ws = deckstat.ws.slice(1); }
        if(song) {  //immediately mark as played so the song is not re-retrieved
            song.lp = new Date().toISOString();
            updateSavedSongData(song, function (updsong) {
                jt.log("updated last played " + updsong.path);
                updateDeck(); }); }
        return song;
    }


    function mergeData () {
        jt.out("dbdlgdiv", jt.tac2html(
            [["div", {id:"mergefileformdiv"},
              [["form", {action:"/mergefile", method:"post", id:"mergeform",
                         target:"subframe", enctype: "multipart/form-data"},
                [["input", {type:"file", name:"mergefilein", id:"mergefilein"}],
                 ["input", {type:"hidden", name:"debug", value:"test"}]]],
               ["iframe", {id:"subframe", name:"subframe", src:"/mergefile",
                           style:"display:none"}]]],
             ["div", {cla:"dlgbuttonsdiv", id:"mergeformbuttonsdiv"},
              ["button", {type:"submit", id:"mergebutton",
                          onclick:jt.fs("app.db.mergeClick()")},
               "Merge"]],
             ["div", {id:"mergemsgdiv"}]]));
    }


    function updateMergeStatus (info) {
        jt.log("updateMergeStatus " + info.state);
        dbstat.currstat = info.state;
        jt.out("mergereadspan", String(info.idx));
        jt.out("mergemergedspan", String(info.merged));
        jt.out("mergestatespan", info.state.capitalize());
        if(info.state === "failed") {
            dbstat.currstat = "ready";
            jt.out("mergemsgdiv", info.errmsg); }
        else if(info.state === "ready") {  //ack merge msg and reload data
            jt.out("dbdlgdiv", jt.tac2html(
                ["div", {cla:"cldiv"},
                 [String(info.merged) + " ratings merged. ",
                  ["button", {type:"button",
                              onclick:jt.fs("app.db.init()")}, "Ok"]]])); }
    }


    function monitorMergeProgress () {
        var mf = jt.byId("subframe");
        if(mf) {
            var fc = mf.contentDocument || mf.contentWindow.document;
            if(fc && fc.body) {  //body unavailable if error write in progress
                var txt = fc.body.innerHTML;
                if(txt.startsWith("Received")) {  //successful upload
                    jt.byId("mergefileformdiv").style.display = "none";
                    jt.call("GET", "/mergestat", null,
                            function (info) {
                                updateMergeStatus(info);
                                if(info.state === "merging") {
                                    setTimeout(monitorMergeProgress, 500); } },
                            function (code, errtxt) {
                                dbstat.currstat = "ready";
                                jt.out("mergestatespan", "Merge process error");
                                jt.out("mergemsgdiv", String(code) + ": " + 
                                       errtxt); },
                            jt.semaphore("db.monitorMergeProgress"));
                    return; }
                if(txt.startsWith("Error")) {
                    dbstat.currstat = "ready";
                    jt.out("mergestatespan", "Upload error");
                    jt.out("mergemsgdiv", jt.tac2html(
                        [txt + "&nbsp; ",
                         ["button", {type:"button",
                                     onclick:jt.fs("app.db.merge()")},
                          "Reset"]]));
                    return; } } }
        setTimeout(monitorMergeProgress, 500);
    }


    function mergeClick () {
        dbstat.currstat = "merging";
        jt.out("mergeformbuttonsdiv", jt.tac2html(
            [["span", {cla:"statespan", id:"mergestatespan"}, "Uploading..."],
             ["span", {cla:"counterlabel"}, "Read:"],
             ["span", {cla:"countspan", id:"mergereadspan"}, "0"],
             ["span", {cla:"counterlabel"}, "Merged:"],
             ["span", {cla:"countspan", id:"mergemergedspan"}, "0"]]));
        setTimeout(monitorMergeProgress, 500);
        jt.byId("mergeform").submit();
    }


    function monitorReadTotal () {
        jt.call("GET", "/songscount", null,
                function (info) {
                    jt.out("countspan", String(info.count) + " songs");
                    dbstat.currstat = info.status;
                    if(info.status === "reading") {  //work ongoing, monitor
                        jt.out("dbstatdiv", info.lastrpath);
                        setTimeout(monitorReadTotal, 500); }
                    else {  //read complete
                        jt.out("dbstatdiv", "");
                        updateDeck(); } },
                function (code, errtxt) {
                    app.db.errstat("db.monitorReadTotal", code, errtxt); },
                jt.semaphore("db.monitorReadTotal"));
    }


    function readSongFiles () {
        jt.out("dbdlgdiv", "");  //clear confirmation prompt if displayed
        if(dbstat.currstat === "reading") {
            return; }  //already reading
        dbstat.currstat = "reading";
        setTimeout(monitorReadTotal, 800);  //monitor following server call
        jt.call("GET", "/dbread", null,
                function (databaseobj) {
                    dbo = databaseobj;
                    jt.out("countspan", String(dbo.songcount) + " songs");
                    jt.out("dbstatdiv", "");
                    dbstat.currstat = "ready";
                    updateDeck(); },
                function (code, errtxt) {
                    if(code !== 409) {  //read already in progress, ignore
                        app.db.errstat("db.readSongFiles", code, errtxt); } },
                jt.semaphore("db.readSongFiles"));
    }


    function timeEstimateReadText () {
        var et = "";
        if(dbo.scanstart && dbo.scanned) {
            var start = jt.isoString2Time(dbo.scanstart);
            var end = jt.isoString2Time(dbo.scanned);
            var elapsed = end.getTime() - start.getTime();
            elapsed = Math.round(elapsed / (1000 * 60));
            et = "(last scan took around " + elapsed + " minutes)"; }
        return et;
    }


    function reReadSongFiles (confirmed) {
        if(confirmed) {
            return readSongFiles(); }
        jt.out("dbdlgdiv", jt.tac2html(
            [["div", {cla:"cldiv"}, "Confirm: Re-read all music files in"],
             ["div", {cla:"statdiv", id:"musicfolderdiv"}],
             ["div", {cla:"cldiv"}, timeEstimateReadText()],
             ["div", {cla:"dlgbuttonsdiv"},
              ["button", {type:"button",
                          onclick:jt.fs("app.db.reread('confirmed')")},
               "Go!"]]]));
        jt.call("GET", "/songscount", null,
                function (info) {
                    jt.out("musicfolderdiv", info.musicpath); },
                function (code, errtxt) {
                    app.db.errstat("db.reReadSongFiles", code, errtxt); },
                jt.semaphore("db.reReadSongFiles"));
    }


    function redrawKeywordSelectionDlg () {
        var html = [];
        dbstat.kwds.forEach(function (kwd, idx) {
            var bc = "kwdtogoff";
            var selnum = dbstat.selks.indexOf(kwd);
            if(selnum < 0) {
                selnum = ""; }
            else {
                selnum += 1;
                bc = "kwdtogon"; }
            html.push(["div", {cla:"kwseldiv"},
                       [["span", {cla:"kwdselnum"}, selnum],
                        ["button", {type:"button", cla:bc,
                                    onclick:jt.fs("app.db.selkw(" + idx + ")")},
                         kwd]]]); });
        html.push(["div", {cla:"dlgbuttonsdiv", id:"restartwithseldiv"},
                   ["button", {type:"button", id:"restartwskb",
                               onclick:jt.fs("app.db.choosekeys('apply')")},
                    "Restart With Selected Keywords"]]);
        jt.out("dbdlgdiv", jt.tac2html(html));
    }


    function selectKeyword (idx) {
        //the idea is you click 4 keywords in the order you want them
        var kwd = dbstat.kwds[idx];
        var selremi = Math.max(dbstat.selks.indexOf(kwd), 0);
        dbstat.selks.splice(selremi, 1);
        dbstat.selks.push(kwd);
        redrawKeywordSelectionDlg();
    }


    function chooseKeywords (cmd) {
        if(cmd === "apply") {  //restart app with new keywords
            jt.byId("restartwskb").disabled = true;  //debounce
            var datobj = {keywords:dbstat.selks.join(",")};
            jt.call("POST", "/keywdsupd", jt.objdata(datobj),
                    function () {
                        jt.log("chooseKeywords update successful");
                        dbo = null;  //reset so no interim reads of old data
                        app.init2(); },
                    function (code, errtxt) {
                        jt.out("dbdlgdiv", String(code) + ": " + errtxt); },
                    jt.semaphore("db.chooseKeywords"));
            return; }
        dbstat.kwds = ["Morning", "Office", "Workout", "Dance"];
        dbstat.selks = [];
        dbo.keywords.forEach(function (kwd) {
            dbstat.selks.push(kwd);
            if(dbstat.kwds.indexOf(kwd) < 0) {
                dbstat.kwds.push(kwd); } });
        app.player.otherkwds().csvarray().forEach(function (kwd) {
            if(dbstat.kwds.indexOf(kwd) < 0) {
                dbstat.kwds.push(kwd); } });
        redrawKeywordSelectionDlg();
    }


    function dbactions () {
        switch(dbstat.currstat) {
        case "ready":
            if(jt.byId("rfbutton")) {  //cancel action display
                jt.out("dbdlgdiv", "");
                break; }
            jt.out("dbdlgdiv", jt.tac2html(
                ["div", {cla:"dlgbuttonsdiv"},
                 [["button", {type:"button", id:"rfbutton",
                              title:"Read all files in the music folder",
                              onclick:jt.fs("app.db.reread()")},
                   "Read Files"],
                  ["button", {type:"button", id:"mdbutton",
                              title:"Merge data from another digdat.json file",
                              onclick:jt.fs("app.db.merge()")},
                   "Merge Data"],
                  ["button", {type:"button", id:"ckbutton",
                              title:"Choose keywords to use for filtering",
                              onclick:jt.fs("app.db.choosekeys()")},
                   "Choose Keywords"]]]));
            break;
        default: 
            jt.log("dbactions ignored dbstat.currstat " + dbstat.currstat); }
    }


    function fetchData () {  //main db display elems and initial data fetch
        jt.out("pandbdiv", jt.tac2html(
            [["div", {id:"titlediv"},
              [["span", {cla:"titlespan"}, "Digger"],
               ["span", {id:"countspan"}, dbstat.loading],
               ["a", {href:"#database", title:"Library Actions",
                      onclick:jt.fs("app.db.dbactions()")},
                ["img", {cla:"buttonico", src:"img/recordcrate.png"}]]]],
             ["div", {id:"dbdlgdiv"}],
             ["div", {cla:"statdiv", id:"dbstatdiv"}]]));
        jt.call("GET", "/dbo", null,
                function (databaseobj) {
                    dbo = databaseobj;
                    jt.out("countspan", String(dbo.songcount) + " songs");
                    dbstat.currstat = "ready";
                    app.filter.init();
                    if(!dbo.scanned) {
                        readSongFiles(); }
                    else {
                        updateDeck(); } },
                function (code, errtxt) {
                    app.db.errstat("db.fetchData", code, errtxt); },
                jt.semaphore("db.fetchData"));
    }


return {

    init: function () { fetchData(); },
    dbactions: function () { dbactions(); },
    errstat: function (src, code, errtxt) {
        var msg = src + " " + code + ": " + errtxt;
        jt.log(msg);
        jt.out("statspan", msg);
    },
    reread: function (confirmed) { reReadSongFiles(confirmed); },
    merge: function () { mergeData(); },
    mergeClick: function () { mergeClick(); },
    choosekeys: function (mode) { chooseKeywords(mode); },
    selkw: function (idx) { selectKeyword(idx); },
    data: function () { return dbo; },
    deckupd: function () { updateDeck(); },
    popdeck: function () { return popSongFromDeck(); },
    songTitleTAC: function (song) { return songTitleTAC(song); },
    songopts: function (prefix, idx) { toggleSongOptions(prefix, idx); },
    playnow: function (prefix, idx) { deckPlayNow(prefix, idx); },
    playnext: function (prefix, idx) { deckPlayNext(prefix, idx); },
    rembuttons: function (prefix, idx) { deckRemoveButtons(prefix, idx); },
    deckremove: function (t, p, i) { deckDoRemove(t, p, i); },
    updateSavedSongData: function (s, f) { updateSavedSongData(s, f); },
    albumplay: function (idx) { albumPlayNow(idx); }

};  //end of returned functions
}());

