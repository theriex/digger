/*global app, jt */
/*jslint browser, white, fudge, for, long */

app.db = (function () {
    "use strict";

    var dbo = null;
    var dbstat = {currstat: "quiet",
                  quiet: "",
                  loading: "Loading Data...",
                  reading: "Reading Files..."};
    //var ws = [];  //The working set of available songs
    //when sorting the working set, prefer songs with segues to lower the
    //likelihood that the segued songs get overplayed relative to their
    //preceding tracks.


    function updateDeck () {
        jt.out("pandeckdiv", "Deck panel not implemented yet");
    }


    function setDBState(state) {
        dbstat.currstat = state;
        jt.out("statspan", dbstat[state]);
        if(state === "quiet" || state === "ready") {
            app.togdivdisp("dbctrlsdiv", "none");
            jt.byId("rfbutton").disabled = false;
            jt.byId("mdbutton").disabled = false; }
        else {  //some kind of work ongoing
            app.togdivdisp("dbctrlsdiv", "block");
            jt.byId("rfbutton").disabled = true;
            jt.byId("mdbutton").disabled = true; }
    }


    function mergeData () {
        jt.err("db.mergeData not implemented yet");
    }


    function monitorReadTotal () {
        jt.call("GET", "/songscount", null,
                function (info) {
                    jt.out("countspan", String(info.count) + " songs");
                    setDBState(info.status);
                    if(info.status === "reading") {  //work ongoing, monitor
                        setTimeout(monitorReadTotal, 500); }
                    else {  //read complete
                        updateDeck(); } },
                function (code, errtxt) {
                    app.db.errstat("db.monitorReadTotal", code, errtxt); },
                jt.semaphore("db.monitorReadTotal"));
    }


    function readSongFiles () {
        if(dbstat.currstat === "reading") {
            return; }  //already reading
        setDBState("reading");
        setTimeout(monitorReadTotal, 800);  //monitor following server call
        jt.call("GET", "/dbread", null,
                function (databaseobj) {
                    dbo = databaseobj;
                    jt.out("countspan", String(dbo.songcount) + " songs");
                    setDBState("quiet");
                    updateDeck(); },
                function (code, errtxt) {
                    if(code !== 409) {  //read already in progress, ignore
                        app.db.errstat("db.readSongFiles", code, errtxt); } },
                jt.semaphore("db.readSongFiles"));
    }


    function fetchData () {
        jt.out("pandbdiv", jt.tac2html(
            [["div", {id:"titlediv"},
              [["span", {cla:"titlespan"}, "Digger"],
               ["span", {id:"countspan"}],
               ["a", {href:"#database", title:"Database Actions",
                      onclick:jt.fs("app.togdivdisp('dbctrlsdiv')")},
                ["img", {cla:"buttonico", src:"img/dbicon.png"}]]]],
             ["div", {id:"dbctrlsdiv"},
              [["span", {id:"statspan"}],
               ["button", {type:"button", id:"rfbutton",
                           onclick:jt.fs("app.db.reread()")},
                "Read Files"],
               ["button", {type:"button", id:"mdbutton",
                           onclick:jt.fs("app.db.merge()")},
                "Merge Data"]]]]));
        setDBState("loading");
        jt.call("GET", "/dbo", null,
                function (databaseobj) {
                    dbo = databaseobj;
                    jt.out("countspan", String(dbo.songcount) + " songs");
                    setDBState("quiet");
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
    errstat: function (src, code, errtxt) {
        var msg = src + " " + code + ": " + errtxt;
        jt.log(msg);
        app.togdivdisp("dbctrlsdiv", "block");
        jt.out("statspan", msg);
    },
    reread: function () { readSongFiles(); },
    merge: function () { mergeData(); }

};  //end of returned functions
}());

