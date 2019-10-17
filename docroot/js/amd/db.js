/*global app, jt */
/*jslint browser, white, fudge, for, long */

app.db = (function () {
    "use strict";

    var dbo = null;

    function fetchData () {
        jt.out("countspan", "Loading Data...");
        jt.call("GET", "/dbo", null,
                function (databaseobj) {
                    dbo = databaseobj;
                    jt.out("countspan", String(dbo.songs.length) + " songs"); },
                function (code, errtxt) {
                    jt.log("db.fetchData " + code + ": " + errtxt); },
                jt.semaphore("db.fetchData"));
    }


return {

    init: function () {
        fetchData();
        jt.out("pandbdiv", "Database panel not implemented yet");
        jt.out("pandeckdiv", "Deck panel not implemented yet");
    }

};  //end of returned functions
}());

