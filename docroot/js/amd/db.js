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
    //var ws = [];  //The working set of available songs
    //when sorting the working set, prefer songs with segues to lower the
    //likelihood that the segued songs get overplayed relative to their
    //preceding tracks.


    function updateDeck () {
        jt.out("pandeckdiv", "Deck panel not implemented yet");
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


    function reReadSongFiles (confirmed) {
        if(confirmed) {
            return readSongFiles(); }
        jt.out("dbdlgdiv", jt.tac2html(
            [["div", {cla:"statdiv"}, "Confirm: Re-read all music files in"],
             ["div", {cla:"statdiv", id:"musicfolderdiv"}],
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
               ["a", {href:"#database", title:"Database Actions",
                      onclick:jt.fs("app.db.dbactions()")},
                ["img", {cla:"buttonico", src:"img/dbicon.png"}]]]],
             ["div", {id:"dbdlgdiv"}],
             ["div", {cla:"statdiv", id:"dbstatdiv"}]]));
        jt.call("GET", "/dbo", null,
                function (databaseobj) {
                    dbo = databaseobj;
                    jt.out("countspan", String(dbo.songcount) + " songs");
                    dbstat.currstat = "ready";
                    if(!dbo.scanned) {
                        readSongFiles(); }
                    else {
                        updateDeck(); } },
                function (code, errtxt) {
                    app.db.errstat("db.fetchData", code, errtxt); },
                jt.semaphore("db.fetchData"));
    }


return {

    init: function () {
        fetchData();
    },
    dbactions: function () { dbactions(); },
    errstat: function (src, code, errtxt) {
        var msg = src + " " + code + ": " + errtxt;
        jt.log(msg);
        jt.out("statspan", msg);
    },
    reread: function (confirmed) { reReadSongFiles(confirmed); },
    merge: function () { mergeData(); },
    mergeClick: function () { mergeClick(); }

};  //end of returned functions
}());

