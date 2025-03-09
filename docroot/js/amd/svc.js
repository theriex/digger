/*global app, jt, Spotify */
/*jslint browser, white, long, unordered */

//Server communications for local/web
app.svc = (function () {
    "use strict";

    var mgrs = {};  //general container for managers
    function mdfs (mgrfname, ...args) {  //module dispatch function string
        return app.util.dfs("svc", mgrfname, args);
    }

    ////////////////////////////////////////
    // Server running on same computer/LAN as browser
    ////////////////////////////////////////

    //local audio interface uses standard audio element.  The deck state
    //starts with the the currently playing song.  In the implementation
    //here, sq has only unlayed songs.
    mgrs.loa = (function () {
        var sq = [];    //queue of songs not played yet
        var np = null;  //now playing song
        const ape = {  //audioplayer event tracking
            seekedt:0,      //Date.now() of last "seeked" event notification
            cooloff:2000,   //2 second mousing about chill period
            endedtmo:null}; //timeout for "ended" event notification
        function apeSeeked () { ape.seekedt = Date.now(); }
        function apeEnded () {
            //avoid ending lots of times if throwing around the seek knob..
            if(Date.now() - ape.seekedt < ape.cooloff) {
                jt.log("apeEnded " + (ape.seekedt? "resetting" : "setting") +
                       " timer");
                if(ape.endedtmo) {
                    clearTimeout(ape.endedtmo); }
                ape.endedtmo = setTimeout(function () {
                    ape.endedtmo = null;
                    ape.seekedt = 0;
                    apeEnded(); }, ape.cooloff); }
            else {
                const player = jt.byId("playeraudio");
                const secsrem = player.duration - player.currentTime;
                if(secsrem * 1000 > ape.cooloff) {
                    //wait for another notification after secsrem seconds
                    jt.log("apeEnded ignoring ended notification with " +
                           secsrem + " seconds left to play"); }
                else {
                    jt.log("apeEnded calling playNextSong");
                    playNextSong("app.svc.audio.ended"); } } }
        function updateLpPcPdAndWrite (pwsid, song) {
            //caller passes latest persistent song referencre
            song.lp = new Date().toISOString();
            song.pc = song.pc || 0;
            song.pc += 1;
            song.pd = "played";
            app.pdat.writeDigDat(pwsid || "svc.loa.playNextSong"); }
        function playNextSong (pwsid) {
            const player = jt.byId("playeraudio");
            if(!sq.length) {
                app.player.notifySongChanged(np, "ended");
                //if you drag the seek past the end of the currently playing
                //track, then "ended" will be triggered but playback will
                //continue from position 0 (FF 133 MacOS 14.6.1).
                player.pause();  //avoid any unexpected continuation
                return jt.log("svc.loa.playNextSong no songs left in queue"); }
            np = sq.shift();
            np = app.pdat.songsDict()[np.path];
            updateLpPcPdAndWrite(pwsid, np);
            app.player.notifySongChanged(np, "playing");
            player.src = "/audio?path=" + jt.enc(np.path);
            //player.play returns a Promise, check result via then.
            player.play().then(
                function (ignore /*successvalue*/) {
                    jt.log("Playing " + np.path + " \"" + np.ti + "\""); },
                function (errorvalue) {
                    mgrs.loa.handlePlayerError(errorvalue); }); }
        function bumpPlayerLeftIfOverhang () {
            var player = jt.byId("playeraudio");
            var playw = player.offsetWidth;
            var maxw = jt.byId("panplaydiv").offsetWidth;
            maxw -= (2 * 6) + (2 * 8);  //padding and border
            if(playw > maxw) {
                const shift = Math.round(-0.5 * (playw - maxw));
                player.style.marginLeft = shift + "px"; } }
    return {
        initialize: function () {
            app.boot.addApresModulesInitTask("initAudioElement", function () {
                if(!jt.byId("playeraudio")) {
                    jt.out("audiodiv", jt.tac2html(
                        ["audio", {id:"playeraudio", controls:"controls",
                                   autoplay:"autoplay"},  //might not happen
                         "WTF? Your browser doesn't support audio.."]));
                    jt.on("playeraudio", "seeked", apeSeeked);
                    jt.on("playeraudio", "ended", apeEnded); }
                bumpPlayerLeftIfOverhang(); }); },
        playSongQueue: function (pwsid, songs) {
            if(np && np.path === songs[0].path) {  //already playing first song
                np = app.pdat.songsDict()[songs[0].path];
                sq = songs.slice(1);  //update queue with rest
                updateLpPcPdAndWrite(pwsid, np); }
            else {
                sq = songs;   //set queue including first song to play
                playNextSong(pwsid); } },
        requestPlaybackStatus: function () {
            setTimeout(function () {
                app.player.dispatch("uiu", "receivePlaybackStatus",
                                    {path:(np? np.path : ""),
                                     state:"playing"}); }, 50); },
        handlePlayerError: function (errval) {  //DOMException or text or obj
            const errmsg = String(errval);  //error name and detail text
            const song = app.player.nowPlayingSong();
            jt.log("mgrs.loa Play error " + errmsg + " " + song.path);
            //NotAllowedError is normal on app start. Autoplay is generally
            //disabled until the user has interacted with the player.
            if(errmsg.indexOf("NotAllowedError") >= 0) {
                const player = jt.byId("playeraudio");
                if(!player.duration) {  //clicking play should trigger error
                    jt.log("Song has no duration."); }
                return; }
            //NotSupportedError means file is unplayable by the current
            //player, but might be ok.  For example on MacOS, Safari handles
            //an .m4a but Firefox doesn't.  Best to continue to the next song,
            //assuming this is an anomaly and the next song will likely play.
            if((errmsg.indexOf("NotSupportedError") >= 0) ||
               (errmsg.indexOf("could not be decoded") >= 0)) {
                jt.log("mgrs.aud.handlePlayerError skipping song...");
                song.pd = "error " + jt.ellipsis(errmsg, 210);
                //Wait before continuing playback so it doesn't seem like
                //"play now" just played the wrong song.  Error is visible
                //from history view.  Possible to fail several songs in a row.
                setTimeout(playNextSong, 4000); } }
    };  //end mgrs.loa returned functions
    }());


    //Local manager handles local server interactions
    mgrs.loc = (function () {
        var loadproc = null;
        function errstat (src, code, errtxt) {
            var msg = src + " " + code + ": " + errtxt;
            jt.log(msg);
            jt.out("statspan", msg); }
        function timeEstimateReadText () {
            var et = "";
            const dbo = app.pdat.dbObj();
            if(dbo.scanstart && dbo.scanned) {
                jt.log("dbo.scanstart: " + dbo.scanstart);
                jt.log("  dbo.scanned: " + dbo.scanned);
                const start = jt.isoString2Time(dbo.scanstart);
                const end = jt.isoString2Time(dbo.scanned);
                const diffms = end.getTime() - start.getTime();
                const elapsed = Math.round(diffms / (10 * 60)) / 100;
                et = "(last scan took about " + elapsed + " minutes)"; }
            return et; }
        function confirmRead () {
            jt.out(loadproc.divid, jt.tac2html(
                [["div", {cla:"cldiv"}, "Confirm: Re-read all music files in"],
                 ["div", {cla:"statdiv", id:"musicfolderdiv"},
                  app.pdat.configObj.musicPath],
                 ["div", {cla:"cldiv"}, timeEstimateReadText()],
                 ["div", {cla:"dlgbuttonsdiv"},
                  [["button", {type:"button", onclick:mdfs("loc.cancelRead")},
                    "Cancel"],
                   ["button", {type:"button",
                               onclick:mdfs("loc.readSongFiles")},
                    "Go!"]]]])); }
        function checkForReadErrors (info) {
            if(info.status === "badMusicPath") {
                jt.err("bad musicPath " + info.musicpath);
                app.top.dispatch("cfg", "launch"); }
            else {
                app.top.dispatch("locla", "noteLibraryLoaded"); } }
        function monitorReadTotal () {
            jt.call("GET", app.util.cb("/songscount"), null,
                function (info) {
                    loadproc.stat = info.status;
                    if(info.status === "reading") {  //work ongoing, monitor
                        app.top.dispCount(info.count, "total");
                        jt.out(loadproc.divid, info.lastrpath);
                        setTimeout(monitorReadTotal, 300); }
                    else {  //read complete
                        mgrs.loc.cancelRead();  //clear loadproc
                        checkForReadErrors(info); } },
                function (code, errtxt) {
                    errstat("svc.loc.monitorReadTotal", code, errtxt); },
                jt.semaphore("svc.loc.monitorReadTotal")); }
        function rebuildSongData (updobj) {
            //updobj is up to date with app.pdat, but any changes or
            //additions done here need to be reflected in app.pdat to be
            //referenced or written by the rest of the app.
            app.top.dispCount(updobj.songcount, "total");
            Object.entries(updobj.songs).forEach(function ([path, song]) {
                if(!song.ar) {  //missing artist, ti probably full path
                    const pes = path.split("/");
                    song.ti = pes[pes.length - 1];
                    if(pes.length >= 3) {
                        song.ar = pes[pes.length - 3];
                        song.ab = pes[pes.length - 2]; }
                    else if(pes.length >= 2) {
                        song.ar = pes[pes.length - 2]; } }
                app.pdat.songsDict()[path] = song; });
            if(loadproc && loadproc.divid) {  //called from full rebuild
                jt.out(loadproc.divid, ""); }
            app.top.markIgnoreSongs();  //respect ignore folders
            const dbo = app.pdat.dbObj();
            dbo.scanned = new Date().toISOString();
            dbo.songcount = Object.keys(updobj.songs).length;
            dbo.songs = updobj.songs;
            app.pdat.writeDigDat("svc.loc.rebuildSongData"); }
    return {
        readConfig: function (contf, errf) {
            jt.call("GET", app.util.cb("/readConfig"), null,
                    contf, errf); },
        readDigDat: function (contf, errf) {
            jt.call("GET", app.util.cb("/readDigDat"), null,
                    contf, errf); },
        writeConfig: function (cfg, contf, errf) {
            var data = jt.objdata({cfg:JSON.stringify(cfg)});
            jt.call("POST", "/writeConfig", data, contf, errf,
                    jt.semaphore("svc.loc.writeConfig")); },
        writeDigDat: function (dbo, contf, errf) {
            var data = jt.objdata({dbo:JSON.stringify(dbo)});
            jt.call("POST", "/writeDigDat", data, contf, errf,
                    jt.semaphore("svc.loc.writeDigDat")); },
        loadLibrary: function (procdivid, cnf, procdonef) {
            procdivid = procdivid || "toponelinestatdiv";
            if(loadproc && loadproc.stat !== "ready") {
                return jt.log("loc.loadLibrary already in progress"); }
            loadproc = {divid:procdivid, donef:procdonef};
            if(!cnf) { return mgrs.loc.readSongFiles(); }
            confirmRead(); },
        readSongFiles: function () {
            jt.out("topdlgdiv", "");  //clear confirmation prompt if displayed
            if(loadproc.stat === "reading") {
                return; }  //already reading
            loadproc.stat = "reading";
            setTimeout(monitorReadTotal, 800);  //monitor after GET
            jt.call("GET", app.util.cb("/readsongs"), null, rebuildSongData,
                function (code, errtxt) {
                    if(code !== 409) {  //read already in progress, ignore
                        errstat("svc.loc.readSongFiles", code, errtxt); } },
                jt.semaphore("svc.loc.readSongFiles")); },
        cancelRead: function () {
            jt.out(loadproc.divid, "");
            loadproc = null; },
        changeConfig: function (configChangeFields, contf, errf) {
            jt.call("POST", "/cfgchg", jt.objdata(configChangeFields),
                    contf, errf, jt.semaphore("loc.changeConfig")); },
        passthroughHubCall: function (qname, reqnum, endpoint, verb, dat) {
            if(endpoint.startsWith("/")) {
                endpoint = endpoint.slice(1); }
            var callf = jt.call;
            if(verb.startsWith("raw")) {
                verb = verb.slice(3);
                callf = jt.request; }
            callf(verb, "hub" + verb.toLowerCase() + "-" + endpoint, dat,
                  function (res) {
                      app.top.dispatch("hcq", "hubResponse", qname, reqnum,
                                       200, JSON.stringify(res)); },
                  function (code, errdet) {
                      app.top.dispatch("hcq", "hubResponse", qname, reqnum,
                                       code, errdet); },
                  jt.semaphore("svc.loc." + endpoint)); },
        docContent: function (docurl, contf, errf) {
            const up = jt.objdata({docurl:jt.enc(docurl)});
            jt.request("GET", app.util.cb(app.util.dr("/doctext"), up, "day"),
                       null, contf, errf,
                       jt.semaphore("mgrs.loc.docContent")); }
    };  //end mgrs.loc returned functions
    }());
            

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
                jt.call("GET", app.util.cb("/plistexp"), null,
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


    ////////////////////////////////////////
    // DiggerHub server and web service audio
    ////////////////////////////////////////

    //Spotify audio interface
    //developer.spotify.com/documentation/web-playback-sdk/reference/
    mgrs.spa = (function () {
        var sdkstate = null;
        var playername = "Digger Spotify Player";
        var swpi = null;  //Spotify Web Player instance
        var pstat = "";   //current player status
        var pdid = "";    //Spotify Web Player device Id
        var pbi = {  //playback state information
            song:null,  //Digger song to be playing
            wpso:null,  //Latest returned WebPlayerState object
            pos:0,      //current play position ms
            dur:0,      //song duration ms
            state:""};  //"playing" or "paused"
        function pmsg (tac) {  //display a player message (major status or err)
            mgrs.spc.playerMessage(tac); }
    return {
        token: function (contf) {  //verify token info, or contf(token)
            return mgrs.spc.token(contf); },
        sdkload: function () {
            if(sdkstate === "loaded") { return true; }
            if(!sdkstate) {
                sdkstate = "loading";
                pmsg("Loading Spotify SDK...");
                window.onSpotifyWebPlaybackSDKReady = function () {
                    sdkstate = "loaded";
                    pmsg("Spotify Player Loaded. Starting...");
                    app.player.next(); };
                setTimeout(function () {  //this can take a while to load
                    var script = document.createElement("script");
                    script.id = "diggerspasdk";
                    script.async = true;
                    script.src = "https://sdk.scdn.co/spotify-player.js";
                    document.body.appendChild(script); },
                           50); }
            return false; },
        swpconn: function () {
            if(swpi && pstat === "connected") { return true; }
            if(!swpi) {
                pmsg("Creating Spotify Web Player...");
                swpi = new Spotify.Player({name:playername,
                                           getOAuthToken:mgrs.spa.token});
                mgrs.spa.addPlayerListeners(); }
            if(pstat !== "connecting") {  //not already trying to connect
                pmsg("Connecting to Spotify Web Player...");
                pstat = "connecting";
                swpi.connect().then(function (result) {
                    if(result) {  //result === true
                        pstat = "connected";
                        mgrs.spa.updatePlayState("paused");  //reset display
                        pmsg("Spotify Web Player Connected.");
                        //could still get an error if not premium or whatever
                        setTimeout(mgrs.spa.verifyPlaying, 500); }
                    else {
                        pstat = "connfail";
                        pmsg(["a", {href:"#Reconnect",
                                    onclick:jt.fs("app.player.next()")},
                              "Reconnect Spotify Web Player"]); } })
                    .catch(function (err) {
                        jt.log("swpconn swpi.connect catch: " + err); }); }
            return false; },
        getPlayerStatus: function () { return pstat; },
        verifyPlayer: function (contf) {
            if(pstat === "connected") {
                if(mgrs.spc.tokenTimeOk()) {
                    return contf(); }
                pstat = "tokexpired"; }
            //Need to verify signin before getting token. No login on main page
            //prior to launch anymore.
            const steps = ["token", "sdkload", "swpconn"];
            if(steps.every((step) => mgrs.spa[step]())) {
                contf(); } },
        autoplayErr: function (err, mtxt) {
            jt.log("autoplayErr " + err + ": " + mtxt);
            if(mgrs.spc.isRefreshToken()) {
                mgrs.slp.startSleep("Token renewed, autoplay disabled."); } },
        addPlayerListeners: function () {
            var listeners = {
                "ready":function (obj) {  //obj has only the device_id in it
                    pdid = obj.device_id;
                    mgrs.spa.verifyPlaying(); },
                "not_ready":function (obj) {
                    pdid = obj.device_id;
                    pstat = "notready";
                    pbi.state = "";  //will need to call playSong again
                    pmsg("Spotify Web Player not ready. Reconnecting...");
                    //mgrs.spc.refreshToken();  //not available
                    app.player.next(); },
                "player_state_changed":function (obj) {
                    mgrs.spa.noteWebPlaybackState(obj); }};
            var errors = {
                initialization_error:"Spotify Web Player initialization failed",
                authentication_error:"Spotify Premium authentication failed",
                account_error:"Could not validate Spotify Premium account",
                playback_error:"Spotify Track playback failed"};
            var makeErrorFunction = function (err, txt) {
                return function (msg) {
                    var mtxt = msg.message || "No Spotify message text";
                    if(mtxt.toLowerCase().includes("autoplay")) {
                        return mgrs.spa.autoplayErr(err, mtxt); }
                    pstat = err;
                    swpi.disconnect();  //returns a promise. Ignoring.
                    pmsg([txt + ": " + mtxt + " ",
                          ["a", {href:"#Retry",
                                 onclick:jt.fs("app.player.next()")},
                           "Retry"]]); }; };
            Object.entries(errors).forEach(function ([err, txt]) {
                listeners[err] = makeErrorFunction(err, txt); });
            Object.entries(listeners).forEach(function ([e, f]) {
                var added = swpi.addListener(e, f);
                jt.log("Spotify " + e + " listener: " + added); }); },
        noteWebPlaybackState: function (wpso) {
            if(!wpso) { return; }  //ignore if seek crashes
            if(pbi.spid && wpso.track_window.current_track.id !== pbi.spid) {
                mgrs.spa.switchToSpotifyTrack(wpso); }  //changed from Spotify
            pbi.wpso = wpso;  //object may be live, but helpful for debug
            pbi.state = (pbi.wpso.paused ? "paused" : "playing");
            pbi.pos = pbi.wpso.position;
            pbi.dur = pbi.wpso.duration;
            const st = pbi.wpso.track_window.current_track;
            pbi.spid = st.id;
            pbi.det = {title:st.name, artist:st.artists[0].name,
                       album:st.album.name};
            mgrs.spa.updatePlayState(pbi.state); },
        spotifyTrackDetails: function () {
            return pbi.det || {title:"", artist:"", album:""}; },
        switchToSpotifyTrack: function (/*wpso*/) {
            mgrs.cmt.toggleTuningOpts("off");
            mgrs.cmt.toggleCommentDisplay("off");
            mgrs.cmt.toggleSongShare("off");
            // const st = wpso.track_window.current_track;
            // const tid = "z:" + st.id;
            // pmso.song = {dsId:"spotify" + tid, ti:st.name,
            //              ar:st.artists[0].name, ab:st.album.name,
            //              spdn:(st.disc_number || 1),
            //              sptn:(st.track_number || 1), spid:tid,
            //              srcid:1, //reserved value for Spotify sourced Songs
            //              al:49, el:49, kws:"", rv:5, fq:"N", nt:"", pc:1,
            //              lp:new Date().toISOString()};
            // mgrs.web.addSongsToPool([updsong]);
            mgrs.uiu.updateSongDisplay(); },
        refreshPlayState: function () {
            swpi.getCurrentState().then(function (wpso) {
                if(!wpso) {  //might be dead, might be still setting up
                    pbi.rpsfails = (pbi.rpsfails || 0) + 1;
                    if(pbi.rpsfails < 3) {
                        jt.log("rpsfail " + pbi.rpsfails + " retrying...");
                        return setTimeout(mgrs.spa.refreshPlayState, 500); }
                    jt.log("rpsfail assuming token expired");
                    pstat = "retriesexceeded";
                    pmsg("Spotify Web Player disconnected. Reconnecting...");
                    return app.player.next(); }
                mgrs.spa.noteWebPlaybackState(wpso); }); },
        updatePlayState: function (state) {
            pbi.state = state;
            mgrs.plui.updateTransportControls(pbi); },
        pause: function () {
            swpi.pause().then(function () {
                mgrs.spa.updatePlayState("paused"); }); },
        resume: function () {
            swpi.resume().then(function () {
                mgrs.spa.updatePlayState("playing"); }); },
        seek: function (ms) {
            ms = ms || 1;  //Spotify seek doesn't like zero milliseconds
            swpi.seek(ms).then(function () {
                mgrs.spa.updatePlayState(pbi.state, ms, pbi.dur); }); },
        verifyPlaying: function () {
            app.top.dispatch("webla", "spimpNeeded", "playstart");
            if(pbi.state !== "playing") {
                if(pbi.song) {
                    return mgrs.spa.playSong(pbi.song); }
                app.player.next(); } },
        handlePlayFailure: function (stat, err) {
            const msg = stat + ": " + err;
            mgrs.spc.playerMessage("Playback failed " + msg);
            mgrs.spa.pause();  //stop playback of previously loaded song
            const odiv = jt.byId("mediaoverlaydiv");
            odiv.style.top = (jt.byId("playertitle").offsetHeight + 2) + "px";
            odiv.style.display = "block";
            odiv.innerHTML = "Song currently unavailable, skipping...";
            setTimeout(function () {
                jt.out("mediaoverlaydiv", "");
                jt.byId("mediaoverlaydiv").style.display = "none";
                app.player.next(); }, 3000);
            mgrs.web.playbackError({type:"spid", spid:pbi.song.spid,
                                    error:msg}); },
        playSong: function (song) {
            pbi.song = song;
            if(pstat !== "connected" || !pdid) {
                return; }  //playback starts after connection setup complete.
            //autoplay is generally blocked, but may happen if the state is
            //refreshed after hitting the play button.
            pbi.spuri = "spotify:track:" + pbi.song.spid.slice(2);
            mgrs.spc.sjc(`me/player/play?device_id=${pdid}`,
                         "PUT", {uris:[pbi.spuri]},
                         function () {
                             jt.log("Playing " + pbi.spuri); },
                         mgrs.spa.handlePlayFailure); }
    };  //end mgrs.spa returned functions
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
            img.src = app.util.dr(source); },
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
            jt.call("POST", app.util.dr("/api/spabimp"), app.util.authdata(dat),
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



    //Web manager handles web server interaction
    mgrs.web = (function () {
        //var libs = {};  //active libraries to match against for song retrieval
        var pool = {};  //locally cached songs by title/artist/album key
        var lastfvsj = null;  //most recent fetch values json
        var digdat = null;
    return {
        readConfig: function (contf/*, errf*/) {
            //bootstrap from nothing. persistent settings restored on sign-in.
            contf(""); },
        readDigDat: function (contf/*, errf*/) {
            digdat = digdat || {songs:{}};
            jt.request("GET", app.util.cb(app.util.dr("/api/version"),
                                          "", "day"), null,
                function (version) {
                    digdat.version = version;
                    contf(digdat); },
                function (code, errtxt) {
                    jt.log("svc.web.readDigDat " + code + ": " + errtxt);
                    digdat.version = app.fileVersion();
                    contf(digdat); }); },
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
        initialSetup: function () {
            app.login.dispatch("ap", "signInUsingCookie",
                function (atk) {
                    var acct = app.top.dispatch("hcu", "deserializeAccount",
                                                atk[0]);
                    app.top.dispatch("aaa", "setCurrentAccount",
                                     acct, atk[1]);
                    app.pdat.svcModuleInitialized(); },
                function () {  //not signed in
                    app.pdat.svcModuleInitialized(); }); },
        addSongsToPool: function (songs) {
            songs.forEach(function (song) {
                const sk = mgrs.web.key(song);
                if(pool[sk]) {
                    app.util.copyUpdatedSongData(pool[sk], song); }
                else {
                    pool[sk] = song; } }); },
        reflectUpdatedSongIfInPool: function (song) {
            var sk = mgrs.web.key(song);
            if(pool[sk]) {
                app.util.copyUpdatedSongData(pool[sk], song); } },
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
            //not adding automatic suggestions via fvsj.fanidcsv.  Get
            //suggestions directly from selected fan(s) in your group.
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
            const ps = app.util.authdata({fvs:fvsj});
            jt.call("GET", app.util.cb(app.util.dr("/api/songfetch"), ps), null,
                    function (songs) {
                        mgrs.web.addSongsToPool(songs);
                        contf(pool); },
                    errf,
                    jt.semaphore("mgrs.web.fetchSongs")); },
        fetchAlbum: function (song, contf, errf) {
            mgrs.spab.fetchAlbum(song, contf, errf); },
        passthroughHubCall: function (qname, reqnum, endpoint, verb, dat) {
            jt.call(verb, "/api/" + endpoint, dat,
                    function (res) {
                        app.top.dispatch("hcq", "hubResponse", qname, reqnum,
                                         200, JSON.stringify(res)); },
                    function (code, errdet) {
                        app.top.dispatch("hcq", "hubResponse", qname, reqnum,
                                         code, errdet); },
                    jt.semaphore("svc.web." + endpoint)); },
        writeConfig: function (cfg, contf) {
            //nothing to do, account info already saved on server
            setTimeout(function () { contf(cfg); }, 50); },
        postSupportRequest: function (subj, body, contf, errf) {
            var data = app.util.authdata({subj:jt.enc(subj),
                                          body:jt.enc(body)});
            jt.call("POST", "/api/emsupp", data, contf, errf,
                    jt.semaphore("mgrs.web.emsupp")); },
        playbackError: function (data) {
            jt.call("POST", "/api/playerr", app.util.authdata(data),
                    function () {
                        jt.log("playbackError reported " +
                               JSON.stringify(data)); },
                    function () {
                        jt.log("playbackError reporting failed."); }); },
        docContent: function (docurl, contf, errf) {
            const up = jt.objdata({docurl:jt.enc(docurl)});
            jt.request("GET", app.util.cb(app.util.dr("/api/doctext"), up,
                                          "day"),
                       null, contf, errf,
                       jt.semaphore("mgrs.web.docContent")); }
    };  //end mgrs.web returned functions
    }());


    //general manager is main interface for app logic
    mgrs.gen = (function () {
        var platconf = {
            hdm: "loc",   //host data manager "loc" or "web", default local
            musicPath: "editable",  //can change where music files are found
            dbPath: "editable",  //can change where rating info is saved
            urlOpenSupp: true,  //ok to open urls in new tab
            defaultCollectionStyle: "permanentCollection",
            audsrc: "Browser",   //audio source for music
            audmgr: "loa"};      //audio manager for playback calls
        var dwurl = "https://diggerhub.com/digger";
        var hdm = "loc";  //host data manager.  either loc or web
        function isLocalDev (url) {
            return url &&
                url.match(/https?:\/\/(localhost|127.0.0.1):80\d\d\/digger/); }
        function initplat (overhdm) {
            if(overhdm) {
                platconf.hdm = overhdm; }
            else {
                const url = window.location.href.toLowerCase();
                if(url.startsWith(dwurl) || isLocalDev(url)) {
                    platconf.hdm = "web";
                    //support different web audio via app.startParams values
                    platconf.audmgr = "spa";
                    platconf.audsrc = "Spotify"; }
                else {  //localhost or LAN
                    platconf.hdm = "loc"; } }
            hdm = platconf.hdm; }
    return {
        initialize: function (overhdm) {
            initplat(overhdm);
            if(hdm === "loc") {
                app.pdat.addApresDataNotificationTask("svc.loc.loadLibrary",
                                                      mgrs.loc.loadLibrary); }
            Object.entries(mgrs).forEach(function ([name, mgr]) {
                if(name !== "gen" && mgr.initialize) {
                    jt.log("initializing svc." + name);
                    mgr.initialize(); } });
            app.pdat.svcModuleInitialized(); },
        plat: function (key) { return platconf[key]; },
        readConfig: function (contf, errf) {
            mgrs[hdm].readConfig(contf, errf); },
        readDigDat: function (contf, errf) {
            mgrs[hdm].readDigDat(contf, errf); },
        writeConfig: function (config, ignore/*optobj*/, contf, errf) {
            mgrs[hdm].writeConfig(config, contf, errf); },
        writeDigDat: function (digdat, ignore/*optobj*/, contf, errf) {
            mgrs[hdm].writeDigDat(digdat, contf, errf); },
        passthroughHubCall: function (qname, reqnum, endpoint, verb, dat) {
            mgrs[hdm].passthroughHubCall(qname, reqnum, endpoint, verb, dat); },
        docContent: function (docurl, contf) {
            mgrs[hdm].docContent(docurl, contf, function (code, errtxt) {
                contf("Doc error " + code + ": " + errtxt); }); },
        loadLibrary: function (libname, divid, cnf, donef) {
            switch(libname) {
            case "local": return mgrs.loc.loadLibrary(divid, cnf, donef);
            default: jt.log("Unknown libname: " + libname); } },
        copyToClipboard: function (txt, contf, errf) {
            navigator.clipboard.writeText(txt).then(contf, errf); }
    };  //end mgrs.gen returned functions
    }());

return {
    init: function (overhdm) { mgrs.gen.initialize(overhdm); },
    plat: function (key) { return mgrs.gen.plat(key); },
    readConfig: mgrs.gen.readConfig,
    readDigDat: mgrs.gen.readDigDat,
    writeConfig: mgrs.gen.writeConfig,
    writeDigDat: mgrs.gen.writeDigDat,
    playSongQueue: function (pwsid, sq) {
        mgrs[mgrs.gen.plat("audmgr")].playSongQueue(pwsid, sq); },
    requestPlaybackStatus: function () {
        mgrs[mgrs.gen.plat("audmgr")].requestPlaybackStatus(); },
    passthroughHubCall: mgrs.gen.passthroughHubCall,
    copyToClipboard: mgrs.gen.copyToClipboard,
    docContent: function (du, cf) { mgrs.gen.docContent(du, cf); },
    topLibActionSupported: function () { return true; },
    extensionInterface: function (name) { switch(name) {
        case "edconf": return mgrs.loc;
        case "libload": return mgrs.loc;
        case "hublocal": return mgrs.web;
        case "spotcall": return mgrs.spc;
        case "copyexp": return mgrs.cpx;
        default: return null; } }
};  //end of returned functions
}());
