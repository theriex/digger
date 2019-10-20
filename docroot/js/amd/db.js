/*global app, jt */
/*jslint browser, white, fudge, for, long */

app.db = (function () {
    "use strict";

    var dbo = null;
    var dbstat = {quiet: "",
                  loading: "Loading Data...",
                  reading: "Reading Files..."};
    //var ws = [];  //The working set of available songs
    //when sorting the working set, prefer songs with segues to lower the
    //likelihood that the segued songs get overplayed relative to their
    //preceding tracks.


    function updateDeck () {
        jt.out("pandeckdiv", "Deck panel not implemented yet");
    }


    function monitorReadTotal () {
        jt.call("GET", "/songscount", null,
                function (count) {
                    if(dbo.status === dbstat.reading) {  //work still ongoing
                        jt.out("countspan", String(count) + " songs");
                        setTimeout(monitorReadTotal, 500); } },
                function (code, errtxt) {
                    app.db.errstat("db.monitorReadTotal", code, errtxt); },
                jt.semaphore("db.monitorReadTotal"));
    }


    function readSongFiles () {
        if(dbo.status === dbstat.reading) {
            return; }  //already reading
        dbo.status = dbstat.reading;
        jt.out("statspan", dbstat.reading);
        monitorReadTotal();
        jt.call("GET", "/dbread", null,
                function (databaseobj) {
                    dbo = databaseobj;  //dbo.status unset
                    jt.out("countspan", String(dbo.songcount) + " songs");
                    jt.out("statspan", "");
                    updateDeck(); },
                function (code, errtxt) {
                    app.db.errstat("db.readSongFiles", code, errtxt); },
                jt.semaphore("db.readSongFiles"));
    }


    function fetchData () {
        jt.out("pandbdiv", jt.tac2html(
            [["div", {id:"titlediv"},
              [["span", {cla:"titlespan"}, "Digger"],
               ["span", {id:"countspan"}],
               ["span", {id:"statspan"}, "Loading Data..."]]],
             ["div", {id:"dbctrlsdiv"}]]));
        jt.call("GET", "/dbo", null,
                function (databaseobj) {
                    dbo = databaseobj;
                    jt.out("countspan", String(dbo.songcount) + " songs");
                    jt.out("statspan", "");
                    if(!dbo.scanned) {
                        readSongFiles(); }
                    else {
                        monitorReadTotal();
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
        jt.out("statspan", msg); }

};  //end of returned functions
}());

