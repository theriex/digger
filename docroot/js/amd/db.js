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
                    maxsel:200, ws:[], fcs:[], fqps:["N", "P", "B", "Z", "O"]};


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
        spec.tfc[spec.id] = function (activate) {
            var onimg = jt.byId(spec.id + "onimg");
            var offimg = jt.byId(spec.id + "offimg");
            if(activate) {
                onimg.style.opacity = 1.0;
                offimg.style.opacity = 0.0;
                spec.togf(true); }
            else {  //turn off
                onimg.style.opacity = 0.0;
                offimg.style.opacity = 1.0;
                spec.togf(false); } };
        jt.on(div, "click", function (ignore /*event*/) {
            var offimg = jt.byId(spec.id + "offimg");
            spec.tfc[spec.id](offimg.style.opacity > 0); });
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
               ["div", {cla:"togbdiv", id:"toginfob"}]]],
             ["div", {id:"deckinfodiv", style:"display:none;"}],
             ["div", {id:"decksongsdiv"}]]));
        makeToggle({id:"togfiltb", w:46, h:20, tfc:deckstat.toggles,
                    togf:function (state) {
                        if(state) {
                            jt.byId("panfiltdiv").style.opacity = 1.0;
                            deckstat.filter = true; }
                        else {
                            jt.byId("panfiltdiv").style.opacity = 0.3;
                            deckstat.filter = false; }
                        jt.log("deckstat.filter: " + deckstat.filter);
                        app.db.deckupd(); },
                    onimg:"img/filteron.png", onlabel:"",
                    offimg:"img/filteroff.png", offlabel:""});
        makeToggle({id:"toginfob", w:20, h:20, tfc:deckstat.toggles,
                    togf:function (state) {
                        if(state) {
                            jt.byId("deckinfodiv").style.display = "block";
                            jt.byId("decksongsdiv").style.display = "none";
                            deckstat.disp = "info"; }
                        else {
                            jt.byId("deckinfodiv").style.display = "none";
                            jt.byId("decksongsdiv").style.display = "block";
                            deckstat.disp = "songs"; } },
                    onimg:"img/infoact.png", onlabel:"",
                    offimg:"img/info.png", offlabel:""});
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


    function rebuildWorkingSet () {
        deckstat.ws = [];
        deckstat.fcs = [];
        Object.keys(dbo.songs).forEach(function (path) {
            var song = dbo.songs[path];
            if(!song.fq.startsWith("D") && !song.fq.startsWith("U")) {
                //song file eligible. Artist/Album/Title may be incomplete.
                song.path = path;
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
                   (song.path.toLowerCase().indexOf(st) >= 0)) {
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


    function sortByLastPlayedAndFrequency () {
        var fqps = deckstat.fqps;
        deckstat.ws.sort(function (a, b) {
            //sort by last played, oldest first
            if(a.lp < b.lp) { return -1; }
            if(a.lp > b.lp) { return 1; }
            var afqi = fqps.indexOf(a.fq); if(afqi < 0) { afqi = fqps.length; }
            var bfqi = fqps.indexOf(b.fq); if(bfqi < 0) { bfqi = fqps.length; }
            return afqi - bfqi; });
    }


    function recalcFrequencyCutoffs () {
        var day = 24 * 60 * 60 * 1000;
        var now = Date.now();
        deckstat.freqlim = {
            N:{days:1},
            P:{days:1},
            B:{days:dbo.waitcodedays.O || 90},
            Z:{days:dbo.waitcodedays.Z || 180},
            O:{days:dbo.waitcodedays.O || 365}};
        Object.keys(deckstat.freqlim).forEach(function (key) {
            var flim = deckstat.freqlim[key];
            flim.iso = new Date(now - (flim.days * day)).toISOString(); });
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
        //eliminate all recently played stuff if we have enough to work with
        if(deckstat.ws.length <= 2) { return; }
        recalcFrequencyCutoffs();
        var idx = deckstat.ws.length - 1;
        while(deckstat.filter && !frequencyEligible(deckstat.ws[idx])) {
            idx -= 1; }
        idx = Math.min(1000, idx);
        deckstat.ws = deckstat.ws.slice(0, idx);
        updateDeckInfoDisplay("Deck Pool");
        //shuffle
        idx = deckstat.ws.length; var randidx; var tmp;
        while(idx !== 0) {  //leave first element alone
            randidx = Math.floor(Math.random() * idx);
            idx -= 1;
            tmp = deckstat.ws[idx];
            deckstat.ws[idx] = deckstat.ws[randidx];
            deckstat.ws[randidx] = tmp; }
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


    function displaySongs () {
        if(!deckstat.ws.length) {
            jt.out("decksongsdiv", "No matching songs found.");
            return; }
        var songsdiv = jt.byId("decksongsdiv");
        songsdiv.innerHTML = "";
        deckstat.ws.forEach(function (song) {
            var elem = document.createElement("div");
            elem.className = "decksongdiv";
            elem.innerHTML = jt.tac2html(songTitleTAC(song));
            songsdiv.appendChild(elem); });
    }


    function updateDeck () {
        if(!app.filter.filtersReady()) {
            return; }  //ignore spurious calls before filter is done setting up
        if(!jt.byId("deckheaderdiv")) {
            initDeckElements(); }
        if(deckstat.toggles.infotimeout) {
            clearTimeout(deckstat.toggles.infotimeout);
            deckstat.toggles.infotimeout = null; }
        deckstat.toggles.toginfob(true);  //show status while working
        rebuildWorkingSet();  //initializes deckstat.ws/fcs
        filterBySearchText();
        filterByFilters();
        sortByLastPlayedAndFrequency();
        truncateAndShuffle();
        if(deckstat.ws.length) {  //show songs if any found
            app.player.deckUpdated();
            deckstat.toggles.infotimeout = setTimeout(function () {
                deckstat.toggles.toginfob(false);
                deckstat.toggles.infotimeout = null; }, 800); }
        displaySongs();
    }


    function popSongFromDeck () {
        if(!deckstat.ws || !deckstat.ws.length) { return null; }
        var song = deckstat.ws[0];
        deckstat.ws = deckstat.ws.slice(1);
        //immediately mark as played so the song is not re-retrieved
        song.lp = new Date().toISOString();
        jt.call("POST", "/songupd", jt.objdata(song),
                function (updsong) {
                    jt.log("updated last played " + updsong.path);
                    updateDeck(); },
                function (code, errtxt) {
                    jt.out("popSongFromDeck upderr " + code + ": " + errtxt); },
                jt.semaphore("db.popSongFromDeck"));
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
                   "Merge Data"]]]));
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
    data: function () { return dbo; },
    deckupd: function () { updateDeck(); },
    popdeck: function () { return popSongFromDeck(); },
    songTitleTAC: function (song) { return songTitleTAC(song); }

};  //end of returned functions
}());

