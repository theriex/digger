/*global app, jt */
/*jslint browser, white, fudge, long */


//Server communications for local/web
app.svc = (function () {
    "use strict";

    var mgrs = {};  //general container for managers
    function mdfs (mgrfname, ...args) {  //module dispatch function string
        return app.dfs("top", mgrfname, args);
    }
    function errstat (src, code, errtxt) {
        var msg = src + " " + code + ": " + errtxt;
        jt.log(msg);
        jt.out("statspan", msg);
    }


    //Copy export manager copies local songs to local export area
    mgrs.cpx = (function () {
        var cfs = null;
    return {
        statusUpdate: function (xob) {
            if(!xob || !xob.stat) {
                return cfs.errf(400, "No stat info available"); }
            switch(xob.stat.state) {
            case "Failed": return cfs.errf(400, xob.stat.errmsg);
            case "Done": jt.log("cpx export completed."); return cfs.contf(xob);
            default: //"Copying"
                cfs.statf(xob);
                mgrs.cpx.monitorExportStatus(xob); } },
        monitorExportStatus: function () {
            setTimeout(function () {
                jt.call("GET", app.cb("/plistexp"), null,
                        mgrs.cpx.statusUpdate,
                        cfs.errf,
                        jt.semaphore("cpx.monitorExportStatus")); },
                       250); },
        exportSongs: function (dat, statusfunc, contfunc, errfunc) {
            cfs = {statf:statusfunc, contf:contfunc, errf:errfunc};
            jt.call("POST", "/plistexp", jt.objdata(dat),
                    function () { jt.log("cpx export started"); }, cfs.errf,
                    jt.semaphore("exp.copyPlaylist"));
            mgrs.cpx.monitorExportStatus(); }
    };  //end mgrs.cpx returned functions
    }());


    //Local manager handles local server interaction
    mgrs.loc = (function () {
        var config = null;
        var dbo = null;
        var loadproc = null;
    return {
        monitorReadTotal: function () {
            jt.call("GET", app.cb("/songscount"), null,
                    function (info) {
                        jt.out("countspan", String(info.count) + " songs");
                        loadproc.stat = info.status;
                        if(info.status === "reading") {  //work ongoing, monitor
                            jt.out(loadproc.divid, info.lastrpath);
                            setTimeout(mgrs.loc.monitorReadTotal, 500); }
                        else {  //read complete
                            //app.deck.updateDeck(); handled by dbread return
                            jt.out(loadproc.divid, ""); } },
                    function (code, errtxt) {
                        errstat("svc.loc.monitorReadTotal", code, errtxt); },
                    jt.semaphore("svc.loc.monitorReadTotal")); },
        rebuildSongData: function (databaseobj) {
            dbo = databaseobj;
            jt.out("countspan", String(dbo.songcount) + " songs");
            Object.entries(dbo.songs).forEach(function ([path, song]) {
                if(!song.ar) {  //missing artist, ti probably full path
                    var pes = path.split("/");
                    song.ti = pes[pes.length - 1];
                    if(pes.length >= 3) {
                        song.ar = pes[pes.length - 3];
                        song.ab = pes[pes.length - 2]; }
                    else if(pes.length >= 2) {
                        song.ar = pes[pes.length - 2]; } } });
            app.top.markIgnoreSongs();
            app.top.rebuildKeywords();
            if(loadproc && loadproc.divid) {  //called from full rebuild
                jt.out(loadproc.divid, ""); }
            app.deck.update("rebuildSongData"); },
        readSongFiles: function () {
            jt.out("topdlgdiv", "");  //clear confirmation prompt if displayed
            if(loadproc.stat === "reading") {
                return; }  //already reading
            loadproc.stat = "reading";
            setTimeout(mgrs.loc.monitorReadTotal, 800);  //monitor after GET
            jt.call("GET", app.cb("/dbread"), null,
                    function (databaseobj) {
                        mgrs.loc.rebuildSongData(databaseobj); },
                    function (code, errtxt) {
                        if(code !== 409) {  //read already in progress, ignore
                            errstat("svc.loc.readSongFiles", code, errtxt); } },
                    jt.semaphore("svc.loc.readSongFiles")); },
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
        cancelRead: function () {
            jt.out(loadproc.divid, "");
            loadproc = null; },
        confirmRead: function () {
            jt.out(loadproc.divid, jt.tac2html(
                [["div", {cla:"cldiv"}, "Confirm: Re-read all music files in"],
                 ["div", {cla:"statdiv", id:"musicfolderdiv"},
                  config.musicPath],
                 ["div", {cla:"cldiv"}, mgrs.loc.timeEstimateReadText()],
                 ["div", {cla:"dlgbuttonsdiv"},
                  [["button", {type:"button", onclick:mdfs("loc.cancelRead")},
                    "Cancel"],
                   ["button", {type:"button",
                               onclick:mdfs("loc.readSongFiles")},
                    "Go!"]]]])); },
        loadLibrary: function (procdivid, cnf, procdonef) {
            procdivid = procdivid || "topdlgdiv";
            if(loadproc && loadproc.stat !== "ready") {
                return jt.log("loc.loadLibrary already in progress"); }
            loadproc = {divid:procdivid, donef:procdonef};
            if(!cnf) { return mgrs.loc.readSongFiles(); }
            mgrs.loc.confirmRead(); },
        getConfig: function () { return config; },
        noteUpdatedAcctsInfo: function(acctsinfo) {
            config.acctsinfo = acctsinfo; },
        writeConfig: function (configChangeFields, contf, errf) {
            jt.call("POST", "/cfgchg", jt.objdata(configChangeFields),
                    contf, errf, jt.semaphore("loc.writeConfig")); },
        songs: function () { return dbo.songs; },
        fetchSongs: function (contf, ignore /*errf*/) {
            setTimeout(function () {
                contf(dbo.songs); }, 200); },
        fetchAlbum: function (song, contf) {
            var abs = Object.values(dbo.songs)
                .filter((s) => s.ab === song.ab)
                .sort(function (a, b) {
                    return a.path.localeCompare(b.path); });
            contf(song, abs); },
        updateSong: function (song, contf) {
            jt.call("POST", "/songupd", jt.objdata(song),
                    function (updsong)  {
                        mgrs.gen.copyUpdatedSongData(song, updsong);
                        app.top.dispatch("a2h", "syncToHub");  //sched sync
                        if(contf) {
                            contf(updsong); } },
                    function (code, errtxt) {
                        jt.err("/songupd failed " + code + ": " + errtxt); },
                    jt.semaphore("mgrs.loc.updateSong")); },
        noteUpdatedSongData: function (updsong) {  //already saved, reflect loc
            var song = dbo.songs[updsong.path];
            if(song) {  //hub sync might send something not available locally
                mgrs.gen.copyUpdatedSongData(song, updsong); } },
        updateAccount: function (acctsinfo, contf, errf) {
            var data = jt.objdata({acctsinfo:JSON.stringify(acctsinfo)});
            jt.call("POST", "/acctsinfo", data, contf, errf,
                    jt.semaphore("svc.loc.updateAccount")); },
        hubSyncDat: function (data, contf, errf) {
            jt.call("POST", "/hubsync", data, contf, errf,
                    jt.semaphore("svc.loc.hubSynchronize")); },
        updateHubAccount: function (data, contf, errf) {
            jt.call("POST", "/updacc", data, contf, errf,
                    jt.semaphore("svc.loc.updateHubAccount")); },
        emailPwdReset: function (data, contf, errf) {
            jt.call("GET", app.cb("/mailpwr", data), null, contf, errf,
                    jt.semaphore("svc.loc.emailPwdReset")); },
        signInOrJoin: function (endpoint, data, contf, errf) {
            //endpoint is either /newacct or /acctok
            jt.call("POST", "/" + endpoint, data, contf, errf,
                    jt.semaphore("svc.loc.signInOrJoin")); },
        fetchGuideData: function (gid, params, contf, errf) {
            jt.call("GET", app.cb("/guidedat", params), null, contf, errf,
                    jt.semaphore("svc.loc.fetchGuideData" + gid)); },
        mergeGuideData: function (gid, params, contf, errf) {
            jt.call("GET", app.cb("/ratimp", params), null, contf, errf,
                    jt.semaphore("svc.loc.mergeGuideData" + gid)); },
        removeGuideRatings: function (gid, params, contf, errf) {
            jt.call("GET", app.cb("/gdclear", params), null, contf, errf,
                    jt.semaphore("svc.loc.removeGuideRatings" + gid)); },
        addGuide: function (data, contf, errf) {
            jt.call("POST", "/addguide", data, contf, errf,
                    jt.semaphore("svc.loc.addGuide")); },
        loadInitialData: function (contf, errf) {
            jt.call("GET", app.cb("/startdata"), null,
                    function (startdata) {
                        config = startdata.config;
                        dbo = startdata.songdata;
                        mgrs.gen.initialDataLoaded();
                        jt.out("countspan", String(dbo.songcount) + " songs");
                        if(!dbo.scanned) {
                            setTimeout(mgrs.loc.loadLibrary, 50); }
                        contf(); },
                    errf,
                    jt.semaphore("svc.loc.loadInitialData")); }
    };  //end mgrs.loc returned functions
    }());
            

    //Web manager handles web server interaction
    mgrs.web = (function () {
        //var libs = {};  //active libraries to match against for song retrieval
        var pool = {};  //locally cached songs by title/artist/album key
    return {
        key: function (song) {
            var key = song.ti + (song.ar || "") + (song.ab || "");
            key = key.replace(/[\s'"]/g, "");
            return key; },
        songs: function () { return pool; }
    };  //end mgrs.web returned functions
    }());


    //general manager is main interface for app logic
    mgrs.gen = (function () {
        var dwurl = "https://diggerhub.com/digger";
        var hdm = "loc";  //host data manager.  either loc or web
        var songfields = ["dsType", "batchconv", "aid", "ti", "ar", "ab",
                          "el", "al", "kws", "rv", "fq", "lp", "nt",
                          "dsId", "modified"];
    return {
        initialDataLoaded: function () {
            //Setting the filter values triggers a call to app.deck.update
            //which rebuilds the deck and starts the player.
            var uims = ["top",     //reflect login name
                        "filter"];  //reflect settings used for song retrieval
            uims.forEach(function (uim) { app[uim].initialDataLoaded(); }); },
        initialDataFailed: function (code, errtxt) {
            jt.err("Initial data load failed " + code + ": " + errtxt); },
        initialize: function () {
            if(window.location.href.toLowerCase().startsWith(dwurl)) {
                hdm = "web"; }
            else {  //localhost or LAN
                hdm = "loc"; }
            //At a minimum, load the current account so settings are available.
            setTimeout(function () {
                mgrs[hdm].loadInitialData(mgrs.gen.initialDataLoaded,
                                          mgrs.gen.initialDataFailed); },
                       200); },
        hostDataManager: function () { return hdm; },
        loadLibrary: function (libname, divid, cnf, donef) {
            switch(libname) {
            case "local": return mgrs.loc.loadLibrary(divid, cnf, donef);
            default: jt.log("Unknown libname: " + libname); } },
        songs: function () {  //return currently cached songs
            return mgrs[hdm].songs(); },
        fetchSongs: function (contf, errf) {  //retrieve more songs
            mgrs[hdm].fetchSongs(contf, errf); },
        fetchAlbum: function (song, contf, errf) {
            mgrs[hdm].fetchAlbum(song, contf, errf); },
        updateSong: function (song, contf) {
            mgrs[hdm].updateSong(song, contf); },
        copyUpdatedSongData: function (song, updsong) {
            songfields.forEach(function (fld) {
                if(updsong[fld]) {  //don't copy undefined values
                    song[fld] = updsong[fld]; } }); }
    };  //end mgrs.gen returned functions
    }());

return {
    init: function () { mgrs.gen.initialize(); },
    hostDataManager: function () { return mgrs.gen.hostDataManager(); },
    songs: function () { return mgrs.gen.songs(); },
    fetchSongs: function (cf, ef) { mgrs.gen.fetchSongs(cf, ef); },
    fetchAlbum: function (s, cf, ef) { mgrs.gen.fetchAlbum(s, cf, ef); },
    updateSong: function (song, contf) { mgrs.gen.updateSong(song, contf); },
    dispatch: function (mgrname, fname, ...args) {
        return mgrs[mgrname][fname].apply(app.svc, args); }
};  //end of returned functions
}());

