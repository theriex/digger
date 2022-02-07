/*global app, jt */
/*jslint browser, white, long, unordered */

//Server communications for local/web
app.svc = (function () {
    "use strict";

    var mgrs = {};  //general container for managers
    function mdfs (mgrfname, ...args) {  //module dispatch function string
        return app.dfs("svc", mgrfname, args);
    }
    function errstat (src, code, errtxt) {
        var msg = src + " " + code + ": " + errtxt;
        jt.log(msg);
        jt.out("statspan", msg);
    }
    //!UNPACKED BY appdat.py unescape_song_fields
    //!EQUIVALENT CODE IN ../../../server/hub.js
    //Even a serialized song can run afoul of web security rules due to
    //paths, titles or other fields containing parenthetical expressions or
    //other triggering patterns.  For UPLOAD, remove any problematic temp
    //fields and escape whatever triggers security blocks.
    function txSong (song) {
        var delflds = ["mrd", "smti", "smar", "smab"];
        //THIS MUST MATCH appdat.py unescape_song_fields
        var escflds = ["path", "ti", "ar", "ab", "nt"];
        //Web Security Reserved Words that must be escaped to be let through
        var wsrw = ["having", "select", "union"];
        song = JSON.parse(JSON.stringify(song));
        delflds.forEach(function (fld) { delete song[fld]; });
        escflds.forEach(function (fld) {  //replace parens with HTML chars
            if(song[fld]) {
                song[fld] = song[fld].replace(/\(/g, "ESCOPENPAREN");
                song[fld] = song[fld].replace(/\)/g, "ESCCLOSEPAREN");
                song[fld] = song[fld].replace(/'/g, "ESCSINGLEQUOTE");
                song[fld] = song[fld].replace(/&/g, "ESCAMPERSAND");
                wsrw.forEach(function (rw) {
                    song[fld] = song[fld].replace(
                        new RegExp(rw, "gi"), function (match) {
                            const rev = match.split("").reverse().join("");
                            return "WSRW" + rev; }); });
            } });
        return song;
    }
    function txSongJSON (song) { return JSON.stringify(txSong(song)); }
    function txSongsJSON (songs) {
        songs = songs.map((song) => txSong(song));
        return JSON.stringify(songs);
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


    //Spotify call manager provides factored api utilities.
    //Only the Implicit Grant Flow seems to work for web app clients.
    //developer.spotify.com/documentation/general/guides/scopes/
    mgrs.spc = (function () {
        var tokflds = ["state", "access_token", "token_type", "expires_in"];
        var toki = {  //APIs fail if attempted with inadequate privs.
            scopes:["streaming",           //required for web playback
                    "user-read-email",     //required for web playback
                    "user-read-private",   //required for web playback
                    "ugc-image-upload",    //put a digger icon on gen playlist
                    "user-read-recently-played",  //avoid repeating
                    "user-read-playback-state",  //external pause, duration
                    //user-top-read should not be needed
                    //app-remote-control iOS/Android only
                    "playlist-modify-public",  //create digger playlist
                    "user-modify-playback-state",  //pause playback from digger
                    "playlist-modify-private", //create digger playlist
                    //user-follow-modify should not be needed
                    "user-read-currently-playing", //play nice w/app, import
                    //user-follow-read should not be needed
                    //user-library-modify should not be needed
                    //user-read-playback-position is for Episodes/Shows
                    "playlist-read-private", //warn before overwrite name
                    "user-library-read",   //import
                    "playlist-read-collaborative"],  //name check, import
            refresh:false, useby:""};
        function pmsg (tac) {  //display a player message (init status or err)
            jt.log("pmsg: " + tac);
            jt.out("audiodiv", jt.tac2html(["div", {id:"pmsgdiv"}, tac])); }
    return {
        playerMessage: function (tac) { pmsg(tac); },
        isRefreshToken: function () { return toki.refresh; },
        tokenTimeOk: function () {
            if(toki.access_token) {
                if(new Date().toISOString() < toki.useby) {
                    return true; }
                jt.log("token expired " + toki.useby); }
            return false; },
        token: function (contf) {  //verify token info, or contf(token)
            if(mgrs.spc.tokenTimeOk()) {
                if(contf) {  //probably called from spotify player
                    setTimeout(function () {
                        contf(toki.access_token); }, 50); }
                return true; }
            const acct = app.login.getAuth();  //server inits acct.hubdat.spa
            const state = app.startParams.state || "";
            if(state && state.slice(3) === acct.token) {  //spotify called back
                if(state.startsWith("ref")) {  //note this was a token refresh
                    toki.refresh = true; }
                tokflds.forEach(function (fld) {  //set or clear token info
                    toki[fld] = app.startParams[fld];
                    app.startParams[fld] = ""; });
                if(app.startParams.error) {  //audiodiv is main app msg space
                    jt.out("audiodiv", "Spotify token retrieval failed: " +
                           app.startParams.error);
                    return false; }
                toki.useby = new Date(
                    //shave off a few seconds to allow time to play next song
                    Date.now() + ((toki.expires_in - 4) * 1000)).toISOString();
                window.history.replaceState({}, document.title, "/digger");
                return true; }  //done handling spotify callback
            pmsg("Redirecting to Spotify for access token...");
            if(!app.docroot.startsWith("https://diggerhub.com")) {
                pmsg(["Spotify authorization redirect only available from ",
                      ["a", {href:"https://diggerhub.com"}, "diggerhub.com"]]);
                return false; }
            const ststr = (toki.access_token? "ref" : "new") + acct.token;
            const params = {client_id:acct.hubdat.spa.clikey,
                            response_type:"token",
                            redirect_uri:acct.hubdat.spa.returi,
                            state:ststr,
                            scope:toki.scopes.join(" ")};
            var spurl = "https://accounts.spotify.com/authorize?" +
                jt.objdata(params);
            window.location.href = spurl;
            return false; },
        sjc: function (relurl, meth, bod, contf, errf) {
            if(bod) {  bod = JSON.stringify(bod); }
            errf = errf || function (stat, msg) {
                jt.log("spc.sjc error " + relurl + ": " + stat + ": " + msg);
                jt.log("    " + meth + " " + bod); };
            fetch("https://api.spotify.com/v1/" + relurl, {
                method:meth, body:bod, headers:{
                    "Authorization":`Bearer ${toki.access_token}`,
                    "Content-Type":"application/json"}})
                .then(function (resp) {
                    if(!resp.ok) {
                        return {error:{status:resp.status,
                                       message:resp.statusText}}; }
                    if(resp.status === 204) {  //No Content
                        return {status:"No Content"}; }
                    return resp.json(); })
                .then(function (obj) {
                    if(obj.error) {
                        return errf(obj.error.status, obj.error.message); }
                    if(contf) {
                        contf(obj); }})
                .catch(function (err) {
                    errf("call failed", err); }); },
        userprof: function (contf) {
            if(toki.userprof) {
                setTimeout(function () { contf(toki.userprof); }, 50);
                return; }
            mgrs.spc.sjc("me", "GET", null,
                         function (obj) {
                             toki.userprof = obj;
                             contf(toki.userprof); }); },
        //on success, the image may still be being processed by Spotify.
        upldimg: function (relurl, source, contf, errf) {
            var img = document.createElement("img");  //equiv new Image();
            img.crossOrigin = "Anonymous";  //must be set or canvas "tainted"
            img.onload = function () {  //convert to base64 after bitmap ready
                var canvas = document.createElement("canvas");
                var ctx = canvas.getContext("2d");
                canvas.height = img.naturalHeight;
                canvas.width = img.naturalWidth;
                jt.log("spc.upldimg " + img.src + " " + img.naturalWidth +
                       " x " + img.naturalHeight);
                ctx.drawImage(img, 0, 0);
                const du = canvas.toDataURL("image/jpeg");
                const b64dat = du.replace(/^data:image.+;base64,/, "");
                jt.log("b64dat length: " + b64dat.length);
                mgrs.spc.upldimgb64(relurl, b64dat, contf, errf); };
            img.src = app.dr(source); },
        upldimgb64: function (relurl, b64dat, contf, errf) {
            errf = errf || function (stat, msg) {
                jt.log("spc.upldimgb64 error " + stat + ": " + msg); };
            fetch("https://api.spotify.com/v1/" + relurl, {
                method:"PUT", body:b64dat, headers:{
                    "Authorization":`Bearer ${toki.access_token}`,
                    "Content-Type":"image/jpeg"}})
                .then(function (resp) {
                    if(!resp.ok) {
                        return errf(resp.status, resp.statusText); }
                    if(contf) {
                        contf(); }})
                .catch(function (err) {
                    errf("img upload failed", err); }); }
    };  //end mgrs.spc returned functions
    }());


    //Spotify album manager handles fetching album songs for a track.
    //Album songs available on Spotify change over time, runtime cache only.
    //developer.spotify.com/documentation/web-api/reference/#category-albums
    mgrs.spab = (function () {
        var tinfs = {};  //track info objects by song id
        var absgs = {};  //album song arrays by spotify album id
        var abinfs = {}; //album info objects by track id
    return {
        fetchAlbum: function (song, contf, errf) {
            var tinf = tinfs[song.dsId];
            if(!tinf) {
                return mgrs.spc.sjc(`tracks/${song.spid.slice(2)}`, "GET", null,
                    function (obj) {
                        tinfs[song.dsId] = obj;
                        mgrs.spab.fetchAlbum(song, contf, errf); }, errf); }
            const songs = absgs[tinf.album.id];
            if(songs) {  //already looked this up before
                return songs; }  //done
            const abinf = abinfs[tinf.album.id];
            if(!abinf) {
                return mgrs.spc.sjc(`albums/${tinf.album.id}`, "GET", null,
                    function (obj) {
                        abinfs[tinf.album.id] = obj;
                        mgrs.spab.fetchAlbum(song, contf, errf); }, errf); }
            const cabi = {album:abinf.name,
                          artists:abinf.artists.map((a) => a.name),
                          tracks:abinf.tracks.items.map(function (t) {
                              return {name:t.name, tid:t.id,
                                      dn:t.disc_number, tn:t.track_number}; })};
            const dat = {abinf:JSON.stringify(cabi)};
            jt.call("POST", app.dr("/api/spabimp"), app.svc.authdata(dat),
                    function (songs) {  //all songs now in hub db
                        var pool = mgrs.web.songs();
                        var merged = [];
                        songs.forEach(function (song) {
                            var pk = mgrs.web.key(song);
                            if(!pool[pk]) {
                                pool[pk] = song; }
                            else {  //already have song, verify spid/mod
                                pool[pk].spid = song.spid;
                                pool[pk].modified = song.modified; }
                            merged.push(pool[pk]); });
                        absgs[tinf.album.id] = merged;
                        contf(song, merged); },
                    errf,
                    jt.semaphore("mgrs.spab.fetchAlbum")); }
    };  //end mgrs.spab returned functions
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
                        jt.out("countspan", String(info.count) + "&nbsp;songs");
                        loadproc.stat = info.status;
                        if(info.status === "reading") {  //work ongoing, monitor
                            jt.out(loadproc.divid,
                                   jt.ellipsis(info.lastrpath, 40));
                            jt.out("decksongsdiv", "Importing music...");
                            setTimeout(mgrs.loc.monitorReadTotal, 500); }
                        else {  //read complete
                            //app.deck.updateDeck(); handled by dbread return
                            mgrs.loc.cancelRead();  //clear loadproc
                            mgrs.loc.checkForReadErrors(info); } },
                    function (code, errtxt) {
                        errstat("svc.loc.monitorReadTotal", code, errtxt); },
                    jt.semaphore("svc.loc.monitorReadTotal")); },
        checkForReadErrors: function (info) {
            if(info.status === "badMusicPath") {
                jt.err("bad musicPath " + info.musicpath);
                app.top.dispatch("cfg", "launch"); }
            else {
                app.top.dispatch("locla", "noteLibraryLoaded"); } },
        rebuildSongData: function (databaseobj) {
            dbo = databaseobj;
            jt.out("countspan", String(dbo.songcount) + "&nbsp;songs");
            Object.entries(dbo.songs).forEach(function ([path, song]) {
                if(!song.ar) {  //missing artist, ti probably full path
                    const pes = path.split("/");
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
                const start = jt.isoString2Time(dbo.scanstart);
                const end = jt.isoString2Time(dbo.scanned);
                const diffms = end.getTime() - start.getTime();
                const elapsed = Math.round(diffms / (10 * 60)) / 100;
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
            var lsi = song.path.lastIndexOf("/");  //last separator index
            if(lsi < 0) {
                lsi = song.path.lastIndexOf("\\"); }
            const pp = song.path.slice(0, lsi + 1);  //path prefix
            const abs = Object.values(dbo.songs)  //album songs
            //simple ab match won't work (e.g. "Greatest Hits").  ab + ar fails
            //if the artist name varies (e.g. "main artist featuring whoever".
                .filter((s) => s.path.startsWith(pp))
                .sort(function (a, b) {  //assuming filename start with track#
                    return a.path.localeCompare(b.path); });
            contf(song, abs); },
        majorError: function (code, errtxt) {
            if(!code && !errtxt) { //local server unreachable
                jt.out("modindspan", "offline");
                jt.err("Digger server unavailable. Close this page and launch the Digger app."); }
            else {
                jt.err("/songupd failed " + code + ": " + errtxt); } },
        updateSong: function (song, contf) {
            jt.call("POST", "/songupd", jt.objdata(song),
                    function (res)  {
                        var updsong = res[0];
                        mgrs.gen.copyUpdatedSongData(song, updsong);
                        jt.out("modindspan", "");  //turn off indicator light
                        app.top.dispatch("a2h", "syncToHub");  //sched sync
                        if(contf) {
                            contf(updsong); } },
                    function (code, errtxt) {
                        mgrs.loc.majorError(code, errtxt); },
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
        addFriend: function (mfem, contf, errf) {
            jt.call("POST", "/addmusf", app.svc.authdata({mfaddr:mfem}),
                    function (accts) {
                        const ca = app.top.dispatch("locam", "getAccount");
                        app.top.dispatch("locam", "noteReturnedCurrAcct",
                                         accts[0], ca.token);
                        contf(accts); },
                    errf, jt.semaphore("svc.loc.addFriend")); },
        createFriend: function (dat, contf, errf) {
            jt.call("POST", "/createmusf", app.svc.authdata(dat),
                    function (results) {
                        const ca = app.top.dispatch("locam", "getAccount");
                        app.top.dispatch("locam", "noteReturnedCurrAcct",
                                         results[0], ca.token);
                        contf(results); },
                    errf, jt.semaphore("svc.loc.createFriend")); },
        friendContributions: function (contf, errf) {
            jt.call("POST", "/mfcontrib", app.svc.authdata(),
                    function (results) {
                        const ca = app.top.dispatch("locam", "getAccount");
                        app.top.dispatch("locam", "noteReturnedCurrAcct",
                                         results[0], ca.token);
                        results.slice(1).forEach(function (song) {
                            mgrs.loc.noteUpdatedSongData(song); });
                        contf(results.length - 1); },
                    errf, jt.semaphore("svc.loc.friendContributions")); },
        clearFriendRatings: function (friendid, contf, errf) {
            jt.call("POST", "/mfclear", app.svc.authdata({mfid:friendid}),
                    function (results) {
                        results.forEach(function (song) {
                            mgrs.loc.noteUpdatedSongData(song); });
                        contf(results.length); },
                    errf, jt.semaphore("svc.loc.clearFriendRatings")); },
        loadInitialData: function (contf, errf) {
            jt.call("GET", app.cb("/startdata"), null,
                    function (startdata) {
                        config = startdata.config;
                        dbo = startdata.songdata;
                        mgrs.gen.initialDataLoaded();
                        jt.out("countspan", String(dbo.songcount) +
                               "&nbsp;songs");
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
        var lastfvsj = null;  //most recent fetch values json
    return {
        key: function (song) {
            if(!song.path) {  //history filters by path, verify value exists
                song.path = song.ti + (song.ar || "") + (song.ab || "");
                song.path = song.path.replace(/[\s'"]/g, ""); }
            return song.path; },
        songs: function () { return pool; },
        makeStartData: function (auth) {
            //account has added hubVersion, diggerVersion fields
            return {config:{acctsinfo:{currid:auth.dsId, accts:[auth]}},
                    songdata:{version:auth.hubVersion,
                              songs:pool}}; },
        loadInitialData: function (contf, ignore /*errf*/) {
            var auth = app.login.getAuth();
            if(!auth) {  //Can't use web player if not signed in, redirect home
                const hm = window.location.href.split("/").slice(0,3).join("/");
                jt.out("outercontentdiv", jt.tac2html(
                    ["a", {href:hm}, "Sign in required."]));
                setTimeout(function () { window.location.href = hm; }, 2000);
                return; }
            mgrs.gen.initialDataLoaded();
            jt.out("countspan", "DiggerHub");
            jt.byId("countspan").style.fontStyle = "italic";
            jt.byId("countspan").style.opacity = 0.6;
            contf(mgrs.web.makeStartData(auth)); },
        addSongsToPool: function (songs) {
            songs.forEach(function (song) {
                const sk = mgrs.web.key(song);
                if(pool[sk]) {
                    mgrs.gen.copyUpdatedSongData(pool[sk], song); }
                else {
                    pool[sk] = song; } }); },
        reflectUpdatedSongIfInPool: function (song) {
            var sk = mgrs.web.key(song);
            if(pool[sk]) {
                mgrs.gen.copyUpdatedSongData(pool[sk], song); } },
        poolAvailable: function () {
            var startOfDay = Date.now() - (24 * 60 * 60 * 1000);
            startOfDay = new Date(startOfDay).toISOString();
            const pa = Object.values(pool).filter((s) => s.lp < startOfDay);
            return pa.length; },
        fetchSongs: function (contf, errf) {  //retrieve more songs
            var fvsj = app.filter.summary();
            if(fvsj.ddst === "newest") {
                return mgrs.web.callSongFetch(JSON.stringify(fvsj),
                                              contf, errf); }
            return mgrs.web.fetchDeckSongs(fvsj, contf, errf); },
        fetchDeckSongs: function (fvsj, contf, errf) {
            var mfids = app.top.dispatch("mfnd", "musicFriendsIdCSV");
            if(mfids !== fvsj.friendidcsv) {  //clear friend suggested songs
                Object.entries(pool).forEach(function ([sk, song]) {
                    if(song.dsId.startsWith("fr")) {
                        delete pool[sk]; } }); }
            fvsj.friendidcsv = mfids;  //include friend suggestions in fetch
            fvsj.startsongid = app.startParams.songid || "";
            fvsj = JSON.stringify(fvsj);
            if(lastfvsj && lastfvsj === fvsj &&   //if no change in search, and
               mgrs.web.poolAvailable() > 100) {  //enough songs available,
                setTimeout(function () {          //return the existing pool
                    contf(pool); }, 200); }       //to save server calls.
            else {
                lastfvsj = fvsj;
                mgrs.web.callSongFetch(fvsj, contf, errf); } },
        callSongFetch: function (fvsj, contf, errf) {
            const ps = app.svc.authdata({fvs:fvsj});
            jt.call("GET", app.cb(app.dr("/api/songfetch"), ps), null,
                    function (songs) {
                        mgrs.web.addSongsToPool(songs);
                        contf(pool); },
                    errf,
                    jt.semaphore("mgrs.web.fetchSongs")); },
        fetchAlbum: function (song, contf, errf) {
            mgrs.spab.fetchAlbum(song, contf, errf); },
        updateSong: function (song, contf) {
            var dat = {songdat:txSongJSON(song)};
            jt.call("POST", "/api/songupd", app.svc.authdata(dat),
                    function (res) {
                        var updsong = res[0];
                        mgrs.gen.copyUpdatedSongData(song, updsong);
                        //title may have had a '+' if original from friend
                        app.player.dispatch("aud", "updateSongTitleDisplay");
                        if(contf) {
                            contf(updsong); } },
                    function (code, errtxt) {
                        jt.err("songupd failed " + code + ": " + errtxt); },
                    jt.semaphore("mgrs.web.updateSong")); },
        updateMultipleSongs: function (updss, contf, errf) {
            var updobj = {songs:txSongsJSON(updss)};  //100 songs ~= 61k
            jt.call("POST", "api/multiupd", app.svc.authdata(updobj),
                    contf, errf, jt.semaphore("mgrs.web.updateMulti")); },
        addFriend: function (mfem, contf, errf) {
            jt.call("POST", "/api/addmusf", app.svc.authdata({mfaddr:mfem}),
                    function (results) {
                        var digacc = app.refmgr.deserialize(results[0]);
                        contf(app.login.dispatch("act", "noteUpdatedAccount",
                                                 digacc)); },
                    errf,
                    jt.semaphore("mgrs.web.addFriend")); },
        createFriend: function (dat, contf, errf) {
            jt.call("POST", "/api/createmusf", app.svc.authdata(dat),
                    function (results) {
                        var digacc = app.refmgr.deserialize(results[0]);
                        contf(app.login.dispatch("act", "noteUpdatedAccount",
                                                 digacc)); },
                    errf,
                    jt.semaphore("mgrs.web.createFriend")); },
        friendContributions: function (contf, errf) {
            jt.call("POST", "/api/mfcontrib", app.svc.authdata(),
                    function (results) {
                        var digacc = app.refmgr.deserialize(results[0]);
                        digacc = app.login.dispatch("act", "noteUpdatedAccount",
                                                    digacc);
                        mgrs.web.addSongsToPool(results.slice(1));
                        contf(results.length - 1); },
                    errf, jt.semaphore("mgrs.web.friendContributions")); },
        clearFriendRatings: function (friendid, contf, errf) {
            jt.call("POST", "/api/mfclear", app.svc.authdata({mfid:friendid}),
                    function (results) {
                        results.forEach(function (song) {
                            mgrs.web.reflectUpdatedSongIfInPool(song); });
                        contf(); },
                    errf, jt.semaphore("mgrs.web.clearFriendRatings")); },
        getSongTotals: function (contf, errf) {
            jt.call("POST", "/api/songttls", app.svc.authdata(),
                    function (results) {
                        var digacc = app.refmgr.deserialize(results[0]);
                        contf(app.login.dispatch("act", "noteUpdatedAccount",
                                                 digacc)); },
                    errf,
                    jt.semaphore("mgrs.web.getSongTotals")); },
        spotifyImport: function (datformat, items, contf, errf) {
            var data = app.svc.authdata({dataformat:datformat,
                                         items:JSON.stringify(items)});
            jt.call("POST", "/api/impsptracks", data,
                    function (results) {
                        var digacc = app.refmgr.deserialize(results[0]);
                        results[0] = app.login.dispatch(
                            "act", "noteUpdatedAccount", digacc);
                        contf(results); },
                    errf, jt.semaphore("mgrs.web.impsptracks")); },
        postSupportRequest: function (subj, body, contf, errf) {
            var data = app.svc.authdata({subj:jt.enc(subj),
                                         body:jt.enc(body)});
            jt.call("POST", "/api/emsupp", data, contf, errf,
                    jt.semaphore("mgrs.web.emsupp")); },
        playbackError: function (data) {
            jt.call("POST", "/api/playerr", app.svc.authdata(data),
                    function () {
                        jt.log("playbackError reported " +
                               JSON.stringify(data)); },
                    function () {
                        jt.log("playbackError reporting failed."); }); }
    };  //end mgrs.web returned functions
    }());


    //general manager is main interface for app logic
    mgrs.gen = (function () {
        var dwurl = "https://diggerhub.com/digger";
        var hdm = "loc";  //host data manager.  either loc or web
        var songfields = ["dsType", "batchconv", "aid", "ti", "ar", "ab",
                          "el", "al", "kws", "rv", "fq", "lp", "nt",
                          "dsId", "modified"];
        function isLocalDev (url) {
            return url &&
                url.match(/https?:\/\/(localhost|127.0.0.1):80\d\d\/digger/); }
    return {
        getHostDataManager: function () { return hdm; },
        initialDataLoaded: function () {
            //Setting the filter values triggers a call to app.deck.update
            //which rebuilds the deck and starts the player.
            var uims = ["top",     //reflect login name
                        "filter"];  //reflect settings used for song retrieval
            uims.forEach(function (uim) { app[uim].initialDataLoaded(); }); },
        initialDataFailed: function (code, errtxt) {
            jt.err("Initial data load failed " + code + ": " + errtxt); },
        initialize: function () {
            var url = window.location.href.toLowerCase();
            if(url.startsWith(dwurl) || isLocalDev(url)) {
                hdm = "web"; }
            else {  //localhost or LAN
                hdm = "loc"; }
            //background image fails to load after redirect Mac FF 88.0.1
            const cssbg = "url('" + app.dr("/img/panelsbg.png") + "')";
            jt.byId("contentdiv").style.backgroundImage = cssbg;
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
            jt.log("updateSong " + song.dsId + " " + song.ti);
            mgrs[hdm].updateSong(song, contf); },
        updateMultipleSongs: function (songs, contf, errf) {
            mgrs[hdm].updateMultipleSongs(songs, contf, errf); },
        copyUpdatedSongData: function (song, updsong) {
            songfields.forEach(function (fld) {
                if(updsong.hasOwnProperty(fld)) {  //don't copy undefined values
                    song[fld] = updsong[fld]; } }); },
        authdata: function (obj) { //return obj post data, with an/at added
            var digacc = app.top.dispatch("gen", "getAccount");
            var authdat = jt.objdata({an:digacc.email, at:digacc.token});
            if(obj) {
                authdat += "&" + jt.objdata(obj); }
            return authdat; },
        addFriend: function (mfem, contf, errf) {
            mgrs[hdm].addFriend(mfem, contf, errf); },
        createFriend: function (dat, contf, errf) {
            mgrs[hdm].createFriend(dat, contf, errf); },
        friendContributions: function (contf, errf) {
            mgrs[hdm].friendContributions(contf, errf); },
        clearFriendRatings: function (mfid, contf, errf) {
            mgrs[hdm].clearFriendRatings(mfid, contf, errf); }
    };  //end mgrs.gen returned functions
    }());

return {
    init: function () { mgrs.gen.initialize(); },
    hostDataManager: function () { return mgrs.gen.hostDataManager(); },
    songs: function () { return mgrs.gen.songs(); },
    fetchSongs: function (cf, ef) { mgrs.gen.fetchSongs(cf, ef); },
    fetchAlbum: function (s, cf, ef) { mgrs.gen.fetchAlbum(s, cf, ef); },
    updateSong: function (song, contf) { mgrs.gen.updateSong(song, contf); },
    authdata: function (obj) { return mgrs.gen.authdata(obj); },
    txSong: function (sg) { return txSong(sg); },
    dispatch: function (mgrname, fname, ...args) {
        return mgrs[mgrname][fname].apply(app.svc, args); }
};  //end of returned functions
}());
