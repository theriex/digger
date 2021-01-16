/*global app, jt */
/*jslint browser, white, fudge, for, long */

app.db = (function () {
    "use strict";

    var dbo = null;
    var dbinfo = null;
    var dbstat = {currstat: "ready",
                  ready: "",
                  loading: "Loading Data...",
                  reading: "Reading Files...",
                  merging: "Merging Data..."};
    var deckstat = {filter:true, qstr:"", disp:"songs", toggles:{},
                    maxdecksel:1000, work:{status:"", timer:null},
                    ws:[],    //working set (array of songs to be played)
                    fcs:[],   //filter controls to apply 
                    pns:[]};  //play next songs (as selected from deck/history)
    var albumstat = null;


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


    function updateSavedSongData (song, contf) {
        var settings = app.filter.filters().map((filt) => filt.settings());
        var data = jt.objdata(song) + "&settings=" + JSON.stringify(settings);
        jt.call("POST", "/songupd", data,
                function (updsong) {
                    dbo.songs[updsong.path] = updsong;
                    var wssi = deckstat.ws.findIndex(
                        (s) => s.path === updsong.path);
                    if(wssi >= 0) {  //update working set song with latest copy
                        deckstat.ws[wssi] = updsong; }
                    contf(updsong); },
                function (code, errtxt) {
                    jt.out("updateSavedSongData " + code + ": " + errtxt); },
                jt.semaphore("db.updateSavedSongData"));
    }


    function errstat (src, code, errtxt) {
        var msg = src + " " + code + ": " + errtxt;
        jt.log(msg);
        jt.out("statspan", msg);
    }


    function fetchConfigInfo(contf) {
        jt.call("GET", "/config", null,
                function(configobj) {
                    dbinfo = configobj;
                    contf(); },
                function (code, errtxt) {
                    errstat("exp.fetchData", code, errtxt); },
                jt.semaphore("db.fetchConfigInfo"));
    }


    function mdfs (mgrfname, ...args) {
        var pstr = app.paramstr(args);
        mgrfname = mgrfname.split(".");
        var fstr = "app.db.managerDispatch('" + mgrfname[0] + "','" +
            mgrfname[1] + "'" + pstr + ")";
        if(pstr !== ",event") {  //don't return false from event hooks
            fstr = jt.fs(fstr); }
        return fstr;
    }


    //General container for all managers, used for dispatch
    var mgrs = {};


    //Keyword manager handles keywords in use for the library.
    mgrs.kwd = (function () {
        var uka = null;  //update keywords array (UI form data)
        var vizuka = null;  //ignored keywords filtered out
    return {
        verifyKeywordDefs: function () {
            if(dbo.kwdefs) { return; }
            dbo.kwdefs = {};
            dbo.keywords.forEach(function (k, i) {
                dbo.kwdefs[k] = {pos:i + 1, sc:0, ig:0}; }); },
        countSongKeywords: function () {
            Object.values(dbo.kwdefs).forEach(function (kd) { kd.sc = 0; });
            Object.values(dbo.songs).forEach(function (song) {
                song.kws = song.kws || "";
                song.kws.csvarray().forEach(function (kw) {
                    if(!dbo.kwdefs[kw]) {
                        dbo.kwdefs[kw] = {pos:0, sc:0, ig:0}; }
                    dbo.kwdefs[kw].sc += 1; }); }); },
        init: function () {
            mgrs.kwd.verifyKeywordDefs();
            mgrs.kwd.countSongKeywords(); },
        defsArray: function (actfirst) {
            var kds = Object.entries(dbo.kwdefs).map(function ([k, d]) {
                return {pos:d.pos, sc:d.sc, ig:d.ig, kw:k, dsc:d.dsc}; });
            kds = kds.filter((kd) => !kd.ig);
            kds.sort(function (a, b) {
                if(actfirst) {
                    if(a.pos && b.pos) { return a.pos - b.pos; }
                    if(a.pos && !b.pos) { return -1; }
                    if(!a.pos && b.pos) { return 1; } }
                return a.kw.localeCompare(b.kw); });
            return kds; },
        makePosSel: function (kw, pos) {
            var pivs = ["-", "1", "2", "3", "4"];  //position indicator values
            var ofs = 0;
            if(vizuka.length <= 4) {
                pivs = pivs.slice(1);
                ofs = 1; }
            return jt.tac2html(
                ["select", {id:"posel" + kw, title:"UI position of " + kw,
                            onchange:mdfs("kwd.posChange", kw)},
                 pivs.map((opt, i) => 
                     ["option", {value:i + ofs, 
                                 selected:jt.toru(pos === i + ofs)},
                      opt])]); },
        posChange: function (kw) {
            var ukd = uka.find((kd) => kd.kw === kw);
            var upv = Number(jt.byId("posel" + kw).value);
            var pkd = uka.find((kd) => kd.pos === upv);
            pkd.pos = ukd.pos;
            ukd.pos = upv;
            mgrs.kwd.redrawUpdateForm(); },
        makeTrash: function (kw, pos) {
            var html = ["img", {cla:"rowbuttonimg", src:"img/trashdis.png"}];
            if(!pos) {  //not currently selected as a display keyword
                html = ["a", {href:"#Ignore_" + kw,
                              onclick:mdfs("kwd.trashKeyword", kw)},
                        ["img", {cla:"rowbuttonimg", src:"img/trash.png"}]]; }
            return jt.tac2html(html); },
        trashKeyword: function (kw) {
            var ukd = uka.find((kd) => kd.kw === kw);
            ukd.ig = 1;
            mgrs.kwd.redrawUpdateForm(); },
        togKwdDesc: function (kw) {
            var kdd = jt.byId(kw + "descrdiv");
            if(kdd) {
                if(kdd.style.display === "none") {
                    kdd.style.display = "block"; }
                else {
                    kdd.style.display = "none"; } } },
        redrawUpdateForm: function () {
            vizuka = uka.filter((kd) => !kd.ig);
            jt.out("kwupdtablediv", jt.tac2html(
                ["table", {id:"kwdseltable"},
                 vizuka.map((kwd) =>
                     [["tr", {cla:"kwdtr"},
                       [["td", mgrs.kwd.makePosSel(kwd.kw, kwd.pos)],
                        ["td", ["a", {href:"#Describe" + kwd.kw,
                                      onclick:mdfs("kwd.togKwdDesc", kwd.kw)},
                                kwd.kw]],
                        ["td", kwd.sc],
                        ["td", mgrs.kwd.makeTrash(kwd.kw, kwd.pos)]]],
                      ["tr", {cla:"kwdesctr"},
                       [["td"],
                        ["td", {colspan:3},
                         ["div", {id:kwd.kw + "descrdiv", cla:"kddescrdiv",
                                  style:"display:none", contentEditable:true},
                          kwd.dsc || ""]]]]])])); },
        chooseKeywords: function () {
            mgrs.kwd.countSongKeywords();  //recount in case keyword was toggled
            uka = mgrs.kwd.defsArray();
            jt.out("dbdlgdiv", jt.tac2html(
                ["div", {id:"kwupdiv"},
                 [["div", {id:"kwupdtablediv"}],
                  ["div", {id:"kwupdstatdiv"}],
                  ["div", {cla:"dlgbuttonsdiv", id:"kwdefbdiv"},
                   ["button", {type:"button", id:"kwdefupdb",
                               onclick:mdfs("kwd.saveKeywordDefs")},
                    "Update"]]]]));
            mgrs.kwd.redrawUpdateForm(); },
        keywordDefsError: function () {
            //UI should not allow creating an invalid kwdefs state. Verify.
            var errmsg = "";
            if(uka.length < 4) {
                errmsg = "Four keywords required."; }
            var ords = [{n:"first", v:1}, {n:"second", v:2}, {n:"third", v:3},
                        {n:"fourth", v:4}];
            ords.reverse().forEach(function (ord) {
                if(!uka.find((kwd) => kwd.pos === ord.v)) {
                    errmsg = "Missing " + ord.n + " keyword."; } });
            if(errmsg) {
                jt.out("kwupdstatdiv", errmsg);
                jt.byId("kwdefupdb").disabled = false; }
            return errmsg; },
        saveKeywordDefs: function (context) {
            if(!context) {  //called from local form
                jt.byId("kwdefupdb").disabled = true;  //debounce
                jt.out("kwupdstatdiv", "Saving..."); }
            if(mgrs.kwd.keywordDefsError()) { return; }
            var ukds = {};
            uka.forEach(function (kd) {
                var descr = jt.byId(kd.kw + "descrdiv").innerText || "";
                ukds[kd.kw] = {pos:kd.pos, sc:kd.sc, ig:kd.ig, dsc:descr}; });
            var data = jt.objdata({kwdefs:JSON.stringify(ukds)});
            jt.call("POST", "/keywdsupd", data,
                    function () {
                        dbo.kwdefs = ukds;  //update local dbo data
                        mgrs.lib.togdlg("close");
                        app.player.managerDispatch("kwd", "rebuildToggles",
                                                   context);
                        app.filter.managerDispatch("btc", "rebuildControls"); },
                    function (code, errtxt) {
                        jt.out("kwupdstatdiv", String(code) + ": " + errtxt); },
                    jt.semaphore("kwd.saveKeywordDefs")); },
        same: function (kwa, kwb) {  //localeCompare base not yet on mobile
            return kwa.toLowerCase() === kwb.toLowerCase(); },
        addKeyword: function (kwd, context) {  //called from player
            uka = uka || mgrs.kwd.defsArray();
            var kd = uka.find((kd) => mgrs.kwd.same(kd.kw, kwd));
            if(kd) {  //already exists and not previously deleted, bump count
                kd.sc += 1; }
            else {  //not in current working set
                kd = dbo.kwdefs[kwd];
                if(kd) {  //previously existed, add adjusted copy
                    kd = {kw:kwd, pos:0, sc:kd.sc + 1, ig:0}; }
                else {  //brand new keyword
                    kd = {kw:kwd, pos:0, sc:1, ig:0}; }
                uka.push(kd); }
            mdfs("lib.togdlg", "close");  //in case open
            mgrs.kwd.saveKeywordDefs(context); },
        swapFilterKeyword: function (kwd, pos) {  //called from filter
            uka = uka || mgrs.kwd.defsArray();
            var prevkd = uka.find((kd) => kd.pos === pos);
            prevkd.pos = 0;
            var currkd = uka.find((kd) => kd.kw === kwd);
            currkd.pos = pos;
            mdfs("lib.togdlg", "close");  //in case open
            mgrs.kwd.saveKeywordDefs("swapFilterKeyword"); }
    };  //end of mgrs.kwd returned functions
    }());


    mgrs.igf = (function () {
        var igfo = null;  //igfo.ignoredirs is an array of strings
    return {
        igMusicFolders: function () {
            jt.out("dbdlgdiv", jt.tac2html(
                ["div", {id:"igfouterdiv"},
                 [["div", {id:"igfdiv"}],
                  ["div", {id:"igfindiv"}],
                  ["div", {id:"igfstatdiv"}],
                  ["div", {cla:"dlgbuttonsdiv", id:"igfbdiv"},
                   ["button", {type:"button", id:"igfaddb",
                               onclick:mdfs("igf.addIgnoreFolder")},
                    "Add"]]]]));
            mgrs.igf.updateIgnoreFiles(); },
        serialize: function (serialize) {
            if(serialize) {
                if(igfo) {
                    igfo.ignoredirs = JSON.stringify(igfo.ignoredirs); } }
            else {  //deserialize
                if(igfo) {
                    igfo.ignoredirs = JSON.parse(igfo.ignoredirs); } } },
        updateIgnoreFiles: function (afn) {  //posting null data works like GET
            jt.out("igfstatdiv", "Updating ignore files...");
            mgrs.igf.serialize(true);
            jt.call("POST", "/ignorefolders", jt.objdata(igfo),
                    function (ignoreFoldersObj) {
                        jt.out("igfstatdiv", "");
                        igfo = ignoreFoldersObj;
                        mgrs.igf.redrawIgnoreFolders(afn); },
                    function (ignore /*code*/, errtxt) {
                        mgrs.igf.serialize(false);
                        jt.out("igfstatdiv", errtxt); },
                    jt.semaphore("igf.updateIgnoreFiles")); },
        redrawIgnoreFolders: function (afn) {
            jt.out("igfdiv", jt.tac2html(
                ["table", {id:"igftable"},
                 igfo.ignoredirs.map((fname, idx) =>
                     ["tr", {cla:"igftr", id:"igftr" + idx},
                      [["td", fname],
                       ["td", ["a", {href:"#Remove", title:"Remove " + fname,
                                     onclick:mdfs("igf.removeIgnoreFolder",
                                                  fname)},
                               ["img", {cla:"rowbuttonimg",
                                        src:"img/trash.png"}]]]]])]));
            if(afn) {
                var tr = jt.byId("igftr" + igfo.ignoredirs.indexOf(afn));
                if(tr) {
                    tr.scrollIntoView();
                    window.scrollTo(0, 0); } }
            jt.out("igfindiv", jt.tac2html(
                [["label", {fo:"igfin"},
                  "Ignore " + igfo.musicPath + "/**/"],
                 ["input", {type:"text", id:"igfin", size:30}]]));
            jt.out("igfstatdiv", ""); },
        removeIgnoreFolder: function (foldername) {
            igfo.ignoredirs = igfo.ignoredirs.filter((fn) => fn !== foldername);
            mgrs.igf.updateIgnoreFiles(); },
        addIgnoreFolder: function () {
            var afn = jt.byId("igfin").value;
            if(!afn || !afn.trim() || igfo.ignoredirs.indexOf(afn) >= 0) {
                return mgrs.igf.redrawIgnoreFolders(); }
            igfo.ignoredirs.push(afn);
            igfo.ignoredirs.sort();
            mgrs.igf.updateIgnoreFiles(afn); }
    };  //end of mgrs.igf returned functions
    }());


    //Library manager deals with lib level actions and data
    mgrs.lib = {
        monitorReadTotal: function () {
            jt.call("GET", "/songscount", null,
                    function (info) {
                        jt.out("countspan", String(info.count) + " songs");
                        dbstat.currstat = info.status;
                        if(info.status === "reading") {  //work ongoing, monitor
                            jt.out("dbstatdiv", info.lastrpath);
                            setTimeout(mgrs.lib.monitorReadTotal, 500); }
                        else {  //read complete
                            jt.out("dbstatdiv", "");
                            mgrs.dk.updateDeck(); } },
                    function (code, errtxt) {
                        errstat("db.monitorReadTotal", code, errtxt); },
                    jt.semaphore("db.monitorReadTotal")); },
        readSongFiles: function () {
            jt.out("dbdlgdiv", "");  //clear confirmation prompt if displayed
            if(dbstat.currstat === "reading") {
                return; }  //already reading
            dbstat.currstat = "reading";
            setTimeout(mgrs.lib.monitorReadTotal, 800);  //monitor after GET
            jt.call("GET", "/dbread", null,
                    function (databaseobj) {
                        dbo = databaseobj;
                        mgrs.kwd.init();
                        jt.out("countspan", String(dbo.songcount) + " songs");
                        jt.out("dbstatdiv", "");
                        dbstat.currstat = "ready";
                        mgrs.dk.updateDeck(); },
                    function (code, errtxt) {
                        if(code !== 409) {  //read already in progress, ignore
                            errstat("db.readSongFiles", code, errtxt); } },
                    jt.semaphore("db.readSongFiles")); },
        timeEstimateReadText: function () {
            var et = "";
            if(dbo.scanstart && dbo.scanned) {
                jt.log("dbo.scanstart: " + dbo.scanstart);
                jt.log("  dbo.scanned: " + dbo.scanned);
                var start = jt.isoString2Time(dbo.scanstart);
                var end = jt.isoString2Time(dbo.scanned);
                var elapsed = end.getTime() - start.getTime();
                elapsed = Math.round(elapsed / (10 * 60)) / 100;
                et = "(last scan took about " + elapsed + " minutes)"; }
            return et; },
        togdlg: function (cmd) {
            if(dbstat.currstat !== "ready") { return; }
            var dlgdiv = jt.byId("dbdlgdiv");
            if(!cmd && dlgdiv.dataset.mode === "libact") {
                cmd = "close"; }
            if(cmd === "close") {
                dlgdiv.dataset.mode = "empty";
                dlgdiv.innerHTML = ""; }
            else {  //"open"
                dlgdiv.dataset.mode = "libact";
                mgrs.lib.writeDialogContent(); } },
        writeDialogContent: function () {
            if(!dbinfo) {
                jt.out("dbdlgdiv", "Fetching configuration info");
                return fetchConfigInfo(mgrs.lib.writeDialogContent); }
            jt.out("dbdlgdiv", jt.tac2html(
                [["div", {cla:"pathdiv"},
                  [["span", {cla:"pathlabelspan"}, "Music Files:"],
                   ["span", {cla:"pathspan"}, dbinfo.musicPath]]],
                 ["div", {cla:"pathdiv"},
                  [["span", {cla:"pathlabelspan"}, "Digger Data:"],
                   ["span", {cla:"pathspan"}, dbinfo.dbPath]]],
                 ["div", {cla:"dlgbuttonsdiv"},
                  [["button", {type:"button", id:"rfbutton",
                               title:"Read all files in the music folder",
                               onclick:mdfs("lib.reReadSongFiles")},
                    "Read Files"],
                   ["button", {type:"button", id:"igbutton",
                               title:"Ignore folders when reading music files",
                               onclick:mdfs("igf.igMusicFolders")},
                    "Ignore Folders"],
                   ["button", {type:"button", id:"mdbutton",
                               title:"Merge data from another Digger file",
                               onclick:mdfs("lib.mergeData")},
                    "Merge Data"],
                   ["button", {type:"button", id:"ckbutton",
                               title:"Choose keywords to use for filtering",
                               onclick:mdfs("kwd.chooseKeywords")},
                    "Choose Keywords"]]]])); },
        reReadSongFiles: function (confirmed) {
            if(confirmed) {
                return mgrs.lib.readSongFiles(); }
            jt.out("dbdlgdiv", jt.tac2html(
                [["div", {cla:"cldiv"}, "Confirm: Re-read all music files in"],
                 ["div", {cla:"statdiv", id:"musicfolderdiv"}],
                 ["div", {cla:"cldiv"}, mgrs.lib.timeEstimateReadText()],
                 ["div", {cla:"dlgbuttonsdiv"},
                  ["button", {type:"button",
                              onclick:mdfs("lib.reReadSongFiles", "confirmed")},
                   "Go!"]]]));
            jt.call("GET", "/songscount", null,
                    function (info) {
                        jt.out("musicfolderdiv", info.musicpath); },
                    function (code, errtxt) {
                        errstat("lib.reReadSongFiles", code, errtxt); },
                    jt.semaphore("lib.reReadSongFiles")); },
        mergeData: function () {
            jt.out("dbdlgdiv", jt.tac2html(
                [["div", {id:"mergefileformdiv"},
                  [["form", {action:"/mergefile", method:"post", id:"mergeform",
                             target:"subframe", enctype: "multipart/form-data"},
                    [["input", {type:"file", 
                                name:"mergefilein", id:"mergefilein"}],
                     ["input", {type:"hidden", name:"debug", value:"test"}]]],
                   ["iframe", {id:"subframe", name:"subframe", src:"/mergefile",
                               style:"display:none"}]]],
                 ["div", {cla:"dlgbuttonsdiv", id:"mergeformbuttonsdiv"},
                  ["button", {type:"submit", id:"mergebutton",
                              onclick:mdfs("lib.mergeClick")},
                   "Merge"]],
                 ["div", {id:"mergemsgdiv"}]])); },
        mergeClick: function () {
            dbstat.currstat = "merging";
            jt.out("mergeformbuttonsdiv", jt.tac2html(
                [["span", {cla:"statespan", id:"mergestatespan"},
                  "Uploading..."],
                 ["span", {cla:"counterlabel"}, "Read:"],
                 ["span", {cla:"countspan", id:"mergereadspan"}, "0"],
                 ["span", {cla:"counterlabel"}, "Merged:"],
                 ["span", {cla:"countspan", id:"mergemergedspan"}, "0"]]));
            setTimeout(mgrs.lib.monitorMergeProg, 500);
            jt.byId("mergeform").submit(); },
        monitorMergeProg: function () {
            var mf = jt.byId("subframe");
            if(mf) {
                var fc = mf.contentDocument || mf.contentWindow.document;
                if(fc && fc.body) {  //body unavail if error write in progress
                    var txt = fc.body.innerHTML;
                    if(txt.startsWith("Received")) {  //successful upload
                        jt.byId("mergefileformdiv").style.display = "none";
                        jt.call("GET", "/mergestat", null,
                                function (info) {
                                    mgrs.lib.updateMergeStatus(info);
                                    if(info.state === "merging") {
                                        setTimeout(mgrs.lib.monitorMergeProg,
                                                   500); } },
                                function (code, errtxt) {
                                    dbstat.currstat = "ready";
                                    jt.out("mergestatespan",
                                           "Merge process error");
                                    jt.out("mergemsgdiv", String(code) + ": " + 
                                           errtxt); },
                                jt.semaphore("lib.monitorMergeProg"));
                        return; }
                    if(txt.startsWith("Error")) {
                        dbstat.currstat = "ready";
                        jt.out("mergestatespan", "Upload error");
                        jt.out("mergemsgdiv", jt.tac2html(
                            [txt + "&nbsp; ",
                             ["button", {type:"button",
                                         onclick:mdfs("lib.mergeData")},
                              "Reset"]]));
                        return; } } }
            setTimeout(mgrs.lib.monitorMergeProg, 500); },
        updateMergeStatus: function (info) {
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
                                  onclick:jt.fs("app.db.init()")},
                       "Ok"]]])); } }
    };


    //Export manager handles process of exporting a playlist
    mgrs.exp = {
        togdlg: function () {
            if(dbstat.currstat !== "ready") { return; }
            var dlgdiv = jt.byId("dbdlgdiv");
            if(dlgdiv.dataset.mode === "download") {  //toggle dialog closed
                dlgdiv.dataset.mode = "empty";
                dlgdiv.innerHTML = "";
                return; }
            dlgdiv.dataset.mode = "download";
            mgrs.exp.writeDialogContent(); },
        writeDialogContent: function () {
            if(!dbinfo) {
                jt.out("dbdlgdiv", "Fetching configuration info");
                return fetchConfigInfo(mgrs.exp.writeDialogContent); }
            jt.out("dbdlgdiv", jt.tac2html(
                [["div", {cla:"pathdiv"},
                  [["span", {cla:"pathlabelspan"}, "Copy To:"],
                   ["span", {cla:"pathspan"}, dbinfo.exPath]]],
                 ["div", {id:"copyprocdiv"},
                  [["div", {cla:"expoptdiv"},
                    //user might adjust filtering after dialog opened, so
                    //either need to react to those adjustments in this dialog
                    //or go with static values.
                    [["input", {type:"number", id:"xttlin", size:3, value:20,
                                min:1, max:200}],
                     ["label", {fo:"xttlin"}, " songs from on deck"]]],
                   ["div", {cla:"expoptdiv"},
                    [["input", {type:"checkbox", id:"plcb", checked:"checked"}],
                     ["label", {fo:"plcb"}, "Make playlist "],
                     ["label", {fo:"m3ufin"}, " file "],
                     ["input", {type:"text", id:"m3ufin", value:"digger.m3u",
                                placeholder:"digger.m3u", size:10}]]],
                   ["div", {cla:"expoptdiv"},
                    [["input", {type:"checkbox", id:"fccb", checked:"checked"}],
                     ["label", {fo:"fccb"}, "Copy music files"]]],
                   ["div", {cla:"expoptdiv"},
                    [["input", {type:"checkbox", id:"mpcb", checked:"checked"}],
                     ["label", {fo:"mpcb"}, "Mark songs as played"]]],
                   ["div", {id:"exportstatusdiv"}],
                   ["div", {cla:"dlgbuttonsdiv", id:"exportbuttonsdiv"},
                    ["button", {type:"button", onclick:mdfs("exp.startCopy")},
                     "Copy Playlist"]]]]])); },
        startCopy: function () {
            var dat = {count:{id:"xttlin", vs:"value"},
                       writepl:{id:"plcb", vs:"checked"},
                       plfilename:{id:"m3ufin", vs:"value"},
                       copymusic:{id:"fccb", vs:"checked"},
                       markplayed:{id:"mpcb", vs:"checked"}};
            Object.entries(dat).forEach(function ([key, attrs]) {
                dat[key] = jt.byId(attrs.id)[attrs.vs]; });
            dat.songs = JSON.stringify(deckstat.ws.slice(0, dat.count)
                                       .map((s) => s.path));
            jt.call("POST", "/plistexp", jt.objdata(dat),
                    function (xob) {
                        mgrs.exp.updateExportStatus(xob); },
                    function (code, errtxt) {
                        jt.out("copyprocdiv", "Copy request failed " + code +
                               ": " + errtxt); },
                    jt.semaphore("exp.copyPlaylist")); },
        updateExportStatus: function (xob) {
            jt.out("copyprocdiv", xob.stat.state + " " + xob.stat.copied +
                   " of " + JSON.parse(xob.spec.songs).length);
            if(xob.stat.state === "Copying") {
                setTimeout(function () {
                    jt.call("GET", "/plistexp", null,
                            function (xob) {
                                mgrs.exp.updateExportStatus(xob); },
                            function (code, errtxt) {
                                jt.out("copyprocdiv", "Copy monitoring " +
                                       code + ": " + errtxt); },
                            jt.semaphore("exp.updateExportStatus")); },
                           400); }
            else if(xob.stat.state === "Done") {
                if(xob.spec.markplayed) {
                    JSON.parse(xob.spec.songs).forEach(function (path) {
                        dbo.songs[path].lp = new Date().toISOString(); });
                    mgrs.dk.updateDeck(); } } }
    };


    //Working set manager handles sourcing content for what's on deck.
    mgrs.ws = {
        rebuildWorkingSet: function () {
            deckstat.ws = [];
            deckstat.fcs = [];
            Object.keys(dbo.songs).forEach(function (path) {
                var song = dbo.songs[path];
                if(!song.fq.startsWith("D") && !song.fq.startsWith("U")) {
                    //song file eligible. Artist/Album/Title may be incomplete.
                    song.path = path;
                    deckstat.ws.push(song); } });
            mgrs.dk.appendInfoCount("Readable files"); },
        filterBySearchText: function () {
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
                mgrs.dk.appendInfoCount("Search Text"); } },
        filterByFilters: function () {
            if(deckstat.filter) {  //filtering is on, not bypassed
                app.filter.filters("active").forEach(function (ftr) {
                    deckstat.ws = deckstat.ws.filter((song) => ftr.match(song));
                    mgrs.dk.appendInfoCount(ftr.actname || ftr.pn); }); } },
        pullPNSFromWS: function () {
            deckstat.ws = deckstat.ws.filter(function (song) {
                return (deckstat.pns.indexOf(song) < 0); }); },
        sortByLastPlayed: function () {
            deckstat.ws.sort(function (a, b) {
                if(a.lp && !b.lp) { return 1; }
                if(!a.lp && b.lp) { return -1; }
                if(a.lp && b.lp) { return a.lp.localeCompare(b.lp); }
                return 0; }); },
        findEndShuffleIndex: function (arr) {
            var sh = {end:1};
            //extend shuffle to include all songs that haven't been played yet
            while(sh.end < arr.length - 1 && !arr[sh.end].lp) { sh.end += 1; }
            //extend shuffle into all songs played within a day of most recent
            if(arr[sh.end].lp) {
                sh.cutoff = new Date(
                    jt.isoString2Time(arr[sh.end].lp).getTime() +
                        (24 * 60 * 60 * 1000)).toISOString();
                while(sh.end < arr.length && arr[sh.end].lp < sh.cutoff) {
                    sh.end += 1; } }
            jt.log("shuffle from [1] to [" + sh.end + "]");
            return sh.end; },
        truncateAndShuffle: function () {
            deckstat.ws = deckstat.ws.slice(0, deckstat.maxdecksel);
            if(deckstat.ws.length <= 2) { return; }  //nothing to shuffle
            var endidx = mgrs.ws.findEndShuffleIndex(deckstat.ws);
            //Fisher-Yates shuffle deck from [1] to [endidx]
            var i; var j; var temp;
            for(i = endidx; i > 0; i -= 1) {
                j = Math.floor(Math.random() * i);
                temp = deckstat.ws[i];
                deckstat.ws[i] = deckstat.ws[j];
                deckstat.ws[j] = temp; } }
    };  //end mgrs.ws functions


    //Song options manager handles actions at the level of specific song
    mgrs.sop = {
        togOptions: function  (prefix, idx) {
            var optdiv = jt.byId("da" + prefix + idx);
            if(optdiv.innerHTML) {  //reset whatever content was there before
                optdiv.innerHTML = "";
                return; }
            if(prefix === "hst") {
                var song = deckstat.hist[idx];
                var playerr = app.player.playerr(song.path);
                if(playerr) {
                    optdiv.innerHTML = playerr;
                    return; } }
            var tac = [
                ["button", {type:"button", id:"deckplaynowb" + prefix + idx,
                            title:"Play now, replacing the current song",
                            onclick:mdfs("dk.playnow", prefix, idx)},
                 "Play Immediately"],
                ["button", {type:"button", id:"deckplaynextb" + prefix + idx,
                            title:"Play after current song finishes",
                            onclick:mdfs("dk.playnext", prefix, idx)},
                 "Play Next"],
                ["button", {type:"button", id:"deckremoveb" + prefix + idx,
                            title:"Remove current song from on deck",
                            onclick:mdfs("sop.rembuttons", prefix, idx)},
                 "Remove"]];
            if(prefix === "pns") {  //song is already in play next list
                tac.splice(1, 1); } //remove the play next button
            if(prefix === "hst") {  //song was previously played
                tac.splice(2, 1); } //remove the remove button
            optdiv.innerHTML = jt.tac2html(tac); },
        rembuttons: function (prefix, idx) {
            jt.out("da" + prefix + idx, jt.tac2html(
                ["div", {cla:"deckrembuttonsdiv"},
                 [["button", {type:"button", id:"drmpb" + prefix + idx,
                              title:"Move to bottom of collection play pool",
                              onclick:mdfs("dk.remove", "mp", prefix, idx)},
                   "Mark As Played"],
                  ["button", {type:"button", id:"drnsb" + prefix + idx,
                              title:"Remove from possible suggested songs",
                              onclick:mdfs("dk.remove", "ns", prefix, idx)},
                   "Never Suggest"]]])); },
        appendSongsToDisplay: function (prefix, songs, spec) {
            spec = spec || {divid:"decksongsdiv", title:"Play or Remove Song"};
            var songsdiv = jt.byId(spec.divid);
            songs.forEach(function (song, idx) {
                var elem = document.createElement("div");
                elem.className = "decksongdiv";
                var tac = mgrs.sop.songTitleTAC(song);
                tac[2] = [["a", {href:"#songactions", title:spec.title,
                                 onclick:mdfs("sop.togOptions", prefix, idx)},
                           tac[2]],
                          ["div", {cla:"decksongactdiv",
                                   id:"da" + prefix + idx}]];
                elem.innerHTML = jt.tac2html(tac);
                songsdiv.appendChild(elem); }); },
        displaySongs: function () {
            if(!deckstat.ws.length && !deckstat.pns.length) {
                jt.out("decksongsdiv", "No matching songs found.");
                return; }
            jt.out("decksongsdiv", "");
            mgrs.sop.appendSongsToDisplay("pns", deckstat.pns);
            mgrs.sop.appendSongsToDisplay("ws", deckstat.ws); },
        songTitleTAC: function (song) {
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
                     ["span", {cla:"dsabspan"}, song.ab || ""]]]; }
    };


    //Deck manager handles actions at affecting what's on deck to play.
    mgrs.dk = {
        remove: function (type, prefix, idx) {
            var song = deckstat[prefix][idx];
            if(type === "ns") {
                song.fq = "R"; }
            song.lp = new Date().toISOString();
            updateSavedSongData(song, function (updsong) {
                jt.log("dk.remove type:" + type + " " +
                       JSON.stringify(updsong)); });
            deckstat[prefix].splice(idx, 1);
            mgrs.sop.displaySongs(); },
        playnext: function (prefix, idx) {
            switch(prefix) {
            case "pns": break; //already queued to play next
            case "hst":
                if(deckstat.pns.indexOf(deckstat.hist[idx]) < 0) {
                    deckstat.pns.push(deckstat.hist[idx]); }
                mgrs.sop.togOptions(prefix, idx);  //hide button to ack click
                //deckstat.hist content cleaned up in popdeck
                break;
            default:
                deckstat.pns.push(deckstat.ws[idx]);
                deckstat.ws.splice(idx, 1); }
            mgrs.sop.displaySongs(); },
        playnow: function (prefix, idx) {
            var tmp;
            switch(prefix) {
            case "pns":  //song already in play next list
                if(idx !== 0) { //not up next, swap into first position
                    tmp = deckstat.pns[0];
                    deckstat.pns[0] = deckstat.pns[idx];
                    deckstat.pns[idx] = tmp; }
                break;
            case "hst":  //song not on deck, previously played
                deckstat.pns.unshift(deckstat.hist[idx]);
                //deckstat.hist content cleaned up in popdeck
                break;
            default:    //song in general working set
                deckstat.pns.unshift(deckstat.ws[idx]);  //prepend to pns
                deckstat.ws.splice(idx, 1); } //remove from ws
            app.player.next(); },
        appendInfoCount: function (phasename) {
            deckstat.fcs.push({filter:phasename, sc:deckstat.ws.length});
            var html = [];
            deckstat.fcs.forEach(function (stat) {
                html.push(["div", {cla:"dinfrecdiv"},
                           [["span", {cla:"dinfrectspan"},
                             stat.filter + ": "],
                            ["span", {cla:"dinfrecnspan"}, stat.sc]]]); });
            jt.out("deckinfodiv", jt.tac2html(html)); },
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
            case "history": mgrs.hist.verifyDisplayContent(); break; } },
        makeToggleControls: function () {
            var tgs = [
                {id:"togfiltb", ti:"Bypass filtering", w:46, h:23,
                 onimg:"img/filteron.png", offimg:"img/filteroff.png",
                 togf:function (state) {
                     if(state) {
                         jt.byId("panfiltcontentdiv").style.opacity = 1.0;
                         deckstat.filter = true; }
                     else {
                         jt.byId("panfiltcontentdiv").style.opacity = 0.3;
                         deckstat.filter = false; }
                     jt.log("deckstat.filter: " + deckstat.filter);
                     app.db.deckupd(); }},
                {id:"toginfob", ti:"Filtering Information",
                 onimg:"img/infoact.png", offimg:"img/info.png",
                 togf:function (state) {
                     mgrs.dk.showSection(state ? "info" : "songs"); }},
                {id:"togalb", ti:"Play Album",
                 onimg:"img/albumact.png", offimg:"img/album.png",
                 togf:function (state) {
                     mgrs.dk.showSection(state ? "album" : "songs"); }},
                {id:"toghistb", ti:"Song History",
                 onimg:"img/historyact.png", offimg:"img/history.png",
                 togf:function (state) {
                     mgrs.dk.showSection(state ? "history" : "songs"); }}];
            tgs.forEach(function (tg) {
                tg.tfc = deckstat.toggles;
                tg.w = tg.w || 20;
                tg.h = tg.h || 20;
                makeToggle(tg); }); },
        initElements: function () {
            jt.out("pandeckdiv", jt.tac2html(
                [["div", {id:"deckheaderdiv"},
                  [["div", {cla:"togbdiv", id:"togfiltb"}],
                   ["input", {type:"text", id:"srchin", size:18,
                              placeholder:"artist/album/song...",
                              value:deckstat.qstr,
                              oninput:jt.fs("app.db.deckupd()")}],
                   ["a", {href:"#search", title:"Search Songs",
                          onclick:jt.fs("app.db.deckupd()")},
                    ["img", {src:"img/search.png", cla:"ico20"}]],
                   ["div", {cla:"togbdiv", id:"toginfob"}],
                   ["div", {cla:"togbdiv", id:"togalb"}],
                   ["div", {cla:"togbdiv", id:"toghistb"}]]],
                 ["div", {id:"deckinfodiv", style:"display:none;"}],
                 ["div", {id:"deckalbumdiv", style:"display:none;"}],
                 ["div", {id:"deckhistorydiv", style:"display:none;"}],
                 ["div", {id:"decksongsdiv"}]]));
            mgrs.dk.makeToggleControls();
            deckstat.toggles.togfiltb(true); },
        updateDeck: function () {
            if(!app.filter.filtersReady()) {
                return; }  //ignore spurious calls before filter ready
            if(deckstat.work.status) {  //already ongoing
                if(deckstat.work.timer) {
                    clearTimeout(deckstat.work.timer);
                    deckstat.work.timer = null; }
                deckstat.work.timer = setTimeout(mgrs.dk.updateDeck, 1200);
                return; }
            deckstat.work.status = "updating";
            setTimeout(mgrs.dk.updateDeckSynchronous, 50); }, //yield to UI
        updateDeckSynchronous: function () {
            if(!jt.byId("deckheaderdiv")) {
                mgrs.dk.initElements(); }
            if(deckstat.toggles.infotimeout) {
                clearTimeout(deckstat.toggles.infotimeout);
                deckstat.toggles.infotimeout = null; }
            deckstat.toggles.toginfob(true);  //show status while working
            mgrs.ws.rebuildWorkingSet();  //initializes deckstat.ws/fcs
            mgrs.ws.filterBySearchText();
            mgrs.ws.filterByFilters();
            mgrs.ws.pullPNSFromWS();
            mgrs.ws.sortByLastPlayed();
            mgrs.ws.truncateAndShuffle();
            if(deckstat.ws.length) {  //show songs if any found
                app.player.deckUpdated();
                deckstat.toggles.infotimeout = setTimeout(function () {
                    deckstat.toggles.toginfob(false);
                    deckstat.toggles.infotimeout = null; }, 800); }
            mgrs.sop.displaySongs();
            deckstat.work.status = ""; },
        popSongFromDeck: function () {
            var song = mgrs.alb.albumPlayNext();
            if(song) {  //in album mode and had next track to play
                return mgrs.hist.addSongToHistory(song); }
            if(deckstat.pns.length > 0) {
                song = deckstat.pns[0];
                deckstat.pns = deckstat.pns.slice(1); }
            else if(deckstat.ws.length > 0) {
                song = deckstat.ws[0];
                deckstat.ws = deckstat.ws.slice(1); }
            if(song) {  //immediately mark as played so not re-retrieved
                app.player.noteprevplay(song.lp);
                song.lp = new Date().toISOString();
                updateSavedSongData(song, function (updsong) {
                    jt.log("updated last played " + updsong.path);
                    mgrs.dk.updateDeck(); }); }
            return mgrs.hist.addSongToHistory(song); }
    };


    mgrs.alb = {
        verifyAlbumStat: function (np) {
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
            return true; },
        updateDisplayContent: function () {
            var np = app.player.song();
            if(!mgrs.alb.verifyAlbumStat(np)) {
                return; }
            var html = [];
            albumstat.songs.forEach(function (song, idx) {
                var tn = idx + 1;
                var lh = ["a", {href:"#playsong" + tn, title:"Play track " + tn,
                                cla:"albumsonglink",
                                onclick:mdfs("alb.albumPlayNow", idx)},
                          song.ti];
                if(idx === albumstat.curridx) {  //unicode right arrow sketchy
                    lh = [["img", {src:"img/arrow12right.png",
                                   cla:"albumarrow"}],
                          song.ti]; }
                html.push(["div", {cla:"albumsongdiv"}, lh]); });
            jt.out("deckalbumdiv", jt.tac2html(
                [["div", {cla:"albumtitlediv"},
                  [["span", {cla:"dsabspan"}, np.ab],
                   " - ",
                   ["span", {cla:"dsarspan"}, np.ar]]],
                 html])); },
        albumPlayNow: function (idx) {
            albumstat.curridx = -1;
            albumstat.selidx = idx;
            app.player.next(); },
        albumPlayNext: function () {
            if(jt.byId("deckalbumdiv").style.display !== "block") {
                return null; }  //not in album play mode
            if(albumstat.curridx < 0) {  //clicked a specific album track
                albumstat.curridx = albumstat.selidx;
                mgrs.alb.updateDisplayContent();
                return albumstat.songs[albumstat.selidx]; }
            var nextidx = (albumstat.curridx + 1) % albumstat.songs.length;
            if(nextidx !== albumstat.selidx) {  //haven't played all tracks yet
                albumstat.curridx = nextidx;
                mgrs.alb.updateDisplayContent();
                return albumstat.songs[albumstat.curridx]; }
            //all tracks from album played, exit album mode.
            deckstat.toggles.togalb();
            return null; }
    };


    //History manager holds functions related to history update and tracking.
    mgrs.hist = {
        verifyDisplayContent: function () {
            if(deckstat.hs) { return; }  //already set up, content should be ok
            var cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);  //how far back
            cutoff = new Date(cutoff).toISOString();
            deckstat.hist = [];
            Object.keys(dbo.songs).forEach(function (path) {
                var song = dbo.songs[path];
                if(song.lp && song.lp >= cutoff) {
                    deckstat.hist.push(song); } });
            deckstat.hist.sort(function (a, b) {
                if(a.lp < b.lp) { return 1; }  //most recent first
                if(a.lp > b.lp) { return -1; }
                return 0; });
            if(!deckstat.hist.length) {
                jt.out("deckhistorydiv", "No recently played songs"); }
            else {
                jt.out("deckhistorydiv", "");
                mgrs.sop.appendSongsToDisplay("hst", deckstat.hist,
                                              {divid:"deckhistorydiv",
                                               title:"Play Song Again"}); } },
        addSongToHistory: function (song) {
            if(deckstat.hs) {  //history is being displayed
                var idx = deckstat.hs.indexOf(song);
                if(idx >= 0) {
                    deckstat.hs.splice(idx, 1); }
                deckstat.hs.unshift(song); }
            return song; }
    };


    function fetchData () {  //main db display elems and startup data fetch
        jt.out("pandbdiv", jt.tac2html(
            [["div", {id:"titlediv"},
              [app.hub.titleHTML(),
               ["span", {id:"countspan"}, dbstat.loading],
               ["a", {href:"#database", title:"Library Actions",
                      onclick:mdfs("lib.togdlg")},
                ["img", {cla:"buttonico", src:"img/recordcrate.png"}]],
               ["a", {href:"#copyplaylist", title:"Copy Deck To Playlist",
                      onclick:mdfs("exp.togdlg")},
                ["img", {cla:"buttonico", src:"img/export.png"}]]]],
             ["div", {id:"dbdlgdiv", "data-mode":"empty"}],
             ["div", {cla:"statdiv", id:"dbstatdiv"}]]));
        jt.call("GET", "/dbo", null,
                function (databaseobj) {
                    dbo = databaseobj;
                    mgrs.kwd.init();
                    jt.out("countspan", String(dbo.songcount) + " songs");
                    dbstat.currstat = "ready";
                    app.filter.init();
                    if(!dbo.scanned) {
                        mgrs.lib.readSongFiles(); }
                    else {
                        mgrs.dk.updateDeck(); } },
                function (code, errtxt) {
                    errstat("db.fetchData", code, errtxt); },
                jt.semaphore("db.fetchData"));
    }


return {

    init: function () { fetchData(); },
    data: function () { return dbo; },
    deckupd: function () { mgrs.dk.updateDeck(); },
    popdeck: function () { return mgrs.dk.popSongFromDeck(); },
    songTitleTAC: function (song) { return mgrs.sop.songTitleTAC(song); },
    updateSavedSongData: function (s, f) { updateSavedSongData(s, f); },
    managerDispatch: function (mgrname, fname, ...args) {
        //best to just crash on a bad reference, easier to see
        return mgrs[mgrname][fname].apply(app.db, args); }

};  //end of returned functions
}());

