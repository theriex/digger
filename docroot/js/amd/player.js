/*global app, jt, Spotify */
/*jslint browser, white, for, long, unordered */

app.player = (function () {
    "use strict";

    var stat = null;   //initializeDisplay sets initial values for state vars
    var ctrls = null;
    var playerrs = {};

    const mgrs = {};  //general container for managers
    function mdfs (mgrfname, ...args) {  //module dispatch function string
        return app.dfs("player", mgrfname, args);
    }

    //This could be a call where the song is no longer displayed, or an
    //interim save triggered from ongoing user interaction.  In the first
    //case there are no relevant UI elements left, in the second case the
    //user may have continued to interact with the display while the save
    //was ongoing and the UI elements should not be disturbed.  Even if the
    //save fails, the UI state cannot be touched since there is nothing to
    //revert back to.  A save failure basically never happens for local
    //storage, and for web it would most likely be a well timed network
    //hiccup or a server failure.  Not much to be done.  Log what was saved.
    function saveSongDataIfModified (ignoreupdate) {
        if(!stat.songModified) { return; }  //save not needed
        if(!ignoreupdate) {  //saving the working song
            //optimistically mark as saved.  If more changes there will
            //be another save call.
            stat.songModified = false; }
        app.deck.saveSongs(stat.song, true,
            function (upds) {
                jt.out("modindspan", "");
                jt.log("song data updated " + JSON.stringify(upds)); },
            function (code, errtxt) {
                stat.songModified = true;  //hopefully next try will work
                jt.err("song save failed " + code + ": " + errtxt); });
    }


    function noteSongModified () {
        if(!stat.song) { return; }
        stat.songModified = true;
        //deck.dk.markSongPlayed has already updated lp and pc, but if the
        //song has been been synced already, then its modified value will
        //now be greater than lp, and it won't sync again.  Update the lp
        //to trigger resync.  Leave the pc alone.
        stat.song.lp = new Date().toISOString();
        jt.out("playtitletextspan",  //ti/ar/ab might have changed
               app.deck.dispatch("sop", "songIdentHTML", stat.song));
        jt.out("modindspan", "mod");
        if(stat.modtimer) {
            clearTimeout(stat.modtimer); }
        stat.modtimer = setTimeout(saveSongDataIfModified, 2200);
    }


    mgrs.rat = (function () {
        const imgw = 110;       //scaled width of 5 stars image
        const imgh = 22;        //scaled height of 5 stars image
        const stw = imgw / 5;   //width of one star
        function adjustRatingFromPosition (x, ignore /*y*/, pa) {
            //jt.log("adjustRatingFromPosition x: " + x + ", pa: " + pa);
            if(pa) {
                const nrv = Math.round((x / stw) * 2);
                const psw = Math.round((nrv * stw) / 2);
                jt.byId("playerstarseldiv").style.width = psw + "px";
                if(stat.song && pa !== "reflectonly") {
                    const cv = stat.song.rv;
                    stat.song.rv = nrv;
                    if(cv !== stat.song.rv) {
                        noteSongModified(); } } } }
    return {
        adjustPositionFromRating: function (rv) {
            adjustRatingFromPosition(Math.round((rv * stw) / 2),
                                     0, "relectonly"); },
        makeRatingValueControl: function () {
            const starstyle = "width:" + imgw + "px;height:" + imgh + "px;";
            jt.out("rvdiv", jt.tac2html(
                ["div", {cla:"ratstarscontainerdiv", style:starstyle},
                 ["div", {cla:"ratstarsanchordiv"},
                  [["div", {cla:"ratstarbgdiv"},
                    ["img", {src:"img/stars425x86g.png", style:starstyle}]],
                   ["div", {cla:"ratstarseldiv", id:"playerstarseldiv"},
                    ["img", {src:"img/stars425x86.png", style:starstyle}]],
                   ["div", {id:"ratstardragdiv", style:starstyle}]]]]));
            ctrls.rat = {stat:{pointingActive:false,
                               maxxlim:imgw, roundpcnt:5}};
            app.filter.movelisten("ratstardragdiv", ctrls.rat.stat,
                                  adjustRatingFromPosition);
            adjustRatingFromPosition(0, 0, "reflectonly"); }  //init empty
    };  //end mgrs.rat returned functions
    }());


    //local audio interface uses standard audio element
    mgrs.loa = (function () {
    return {
        verifyPlayer: function (contf) {
            if(!jt.byId("playeraudio")) {
                jt.out("audiodiv", jt.tac2html(
                    ["audio", {id:"playeraudio", controls:"controls",
                               autoplay:"autoplay"},  //may or may not happen
                     "WTF? Your browser doesn't support audio.."]));
                jt.on("playeraudio", "ended", app.player.next); }
            mgrs.loa.bumpPlayerLeftIfOverhang();
            contf(); },
        bumpPlayerLeftIfOverhang: function  () {
            var player = jt.byId("playeraudio");
            var playw = player.offsetWidth;
            var maxw = jt.byId("panplaydiv").offsetWidth;
            maxw -= (2 * 6) + (2 * 8);  //padding and border
            if(playw > maxw) {
                const shift = Math.round(-0.5 * (playw - maxw));
                player.style.marginLeft = shift + "px"; } },
        handleNotAllowedError: function () {
            var player = jt.byId("playeraudio");
            if(!player.duration) {
                jt.log("Song has no duration."); } },
        playSong: function (song) {
            var player = jt.byId("playeraudio");
            player.src = "/audio?path=" + jt.enc(song.path);
            //player.play returns a Promise, check result via then.
            player.play().then(
                function (ignore /*successvalue*/) {
                    jt.log("Playing " + song.path); },
                function (errorvalue) {
                    mgrs.aud.handlePlayerError(errorvalue); });
            app.top.dispatch("locla", "libimpNeeded"); },
        sleep: function (count, cmd, cbf) {
            jt.log("mgrs.loa.sleep " + count + ", " + cmd);
            if(cmd === "cancel") {
                app.player.next(); }
            if(cbf) {  //might not be provided on cancel.  Call back if given.
                cbf(cmd); } }  //deck already limited to sleep queue max
    };  //end mgrs.loa returned functions
    }());


    //Player UI manager creates and maintains a playback UI in audiodiv
    mgrs.plui = (function () {
        var state = "paused";
        var bimg = "img/play.png";
        var prog = {pos:0, dur:0, w:200, left:16, //CSS pluiprogbgdiv left
                    divs:["pluiprogbgdiv", "pluiprogclickdiv"],
                    tickcount:1, svco:null};
        function mmss (ms) {
            var sep = ":";
            ms = Math.round(ms / 1000);
            const secs = ms % 60;
            if(secs <= 9) {
                sep += "0"; }
            return String(Math.floor(ms / 60)) + sep + secs; }
        function tickf () { //poll to react to external play/pause/skip etc
            // jt.log("tickf " + prog.tickcount + " " + state + " " +
            //        prog.pos + " of " + prog.dur);
            prog.ticker = null;  //always clear hearbeat indicator
            if(!prog.tickcount      //call for status if it's been 4 seconds
               || (state === "playing" &&  //or playing and close to start/end
                   ((prog.pos < 2000) ||
                    (prog.dur - prog.pos < 2000)))) {
                prog.svco.refreshPlayState(); }
            if(state === "playing") {  //tick 1 sec fwd
                prog.pos = Math.min(prog.pos + 1000, prog.dur); }
            mgrs.plui.updatePosIndicator();  //reflect new position
            prog.tickcount = (prog.tickcount + 1) % 4;
            if(jt.byId("pluidiv")) { //interface still available
                prog.ticker = setTimeout(tickf, 1000); } }
    return {
        verifyHeartbeat: function () {
            if(!prog.ticker) {  //restart heartbeat
                prog.tickcount = 1;
                prog.ticker = setTimeout(tickf, 1000); } },
        reflectPlaybackState: function (pbs, skiptick) {
            mgrs.plui.verifyInterface();
            if((pbs === "paused") ||  //may be resumed via external controls
               (pbs === "ended"))  {  //showing a pause ctrl makes no sense
                bimg = "img/play.png"; }
            else {  //playing
                bimg = "img/pause.png"; }
            jt.byId("pluibimg").src = bimg;
            if(!skiptick) {
                mgrs.plui.verifyHeartbeat();
                mgrs.plui.updatePosIndicator(); } }, //reflect position
        togglePlaybackState: function () {
            if(state === "paused") {
                prog.svco.resume();
                state = "playing"; }
            else {  //playing
                prog.svco.pause();
                state = "paused"; }
            mgrs.plui.reflectPlaybackState(state); },
        seek: function (event) {
            var clickrect = event.target.getBoundingClientRect();
            var x = event.clientX - clickrect.left;
            var ms = Math.round(x / prog.w * prog.dur);
            if(ms < 5000) { ms = 0; }  //close enough, restart from beginning
            prog.svco.seek(ms); },
        stopTicker: function () {
            if(prog.ticker) {
                clearTimeout(prog.ticker);
                prog.ticker = null; } },
        updatePosIndicator: function () {
            //update progress bar
            var prw = 0; var progdiv = jt.byId("pluiprogdiv");
            if(!progdiv) {
                return jt.log("updatePosIndicator quitting since no progdiv"); }
            if(prog.dur) {
                prog.pos = Math.min(prog.pos, prog.dur);  //don't overrun end
                prw = Math.round((prog.pos / prog.dur) * prog.w); }
            progdiv.style.width = prw + "px";
            //update time readout and position
            jt.out("pluitimeposdiv", mmss(prog.pos));
            jt.out("pluitimedurdiv", mmss(prog.dur));
            const posdiv = jt.byId("pluiposdiv");
            posdiv.style.width =
                (jt.byId("pluitimeposdiv").getBoundingClientRect().width +
                 jt.byId("pluitimesepdiv").getBoundingClientRect().width +
                 jt.byId("pluitimedurdiv").getBoundingClientRect().width +
                 6) + "px";
            const posw = posdiv.getBoundingClientRect().width;
            const left = (prog.left + prw) - Math.floor(posw / 2);
            posdiv.style.left = left + "px"; },
        initInterface: function () {
            if(!jt.byId("audiodiv")) {
                return jt.log("mgrs.plui.initInterface has no audiodiv"); }
            jt.out("audiodiv", jt.tac2html(
                ["div", {id:"pluidiv"},
                 [["div", {id:"pluibdiv"},
                   ["img", {id:"pluibimg", src:bimg,
                            onclick:mdfs("plui.togglePlaybackState")}]],
                  ["div", {id:"pluiprogdispdiv"},
                   [["div", {id:"pluiprogbgdiv"}],
                    ["div", {id:"pluiprogdiv"}],
                    ["div", {id:"pluiposdiv",
                             onclick:mdfs("plui.togglePlaybackState")},
                     [["div", {id:"pluitimeposdiv"}, "0:00"],
                      ["div", {id:"pluitimesepdiv"}, "|"],
                      ["div", {id:"pluitimedurdiv"}, "0:00"]]],
                    ["div", {id:"pluiprogclickdiv",
                             onclick:mdfs("plui.seek", "event")}]]]]]));
            prog.divs.forEach(function (divid) {
                jt.byId(divid).style.width = prog.w + "px"; });
            mgrs.plui.updatePosIndicator(); },
        verifyInterface: function () {
            if(!jt.byId("pluidiv")) { //interface not set up yet
                mgrs.plui.initInterface(); }
            if(prog.svco) {  //no tickf until service control object set
                mgrs.plui.verifyHeartbeat(); } },
        updateDisplay: function (svco, pbstate, position, duration) {
            prog.svco = svco;
            prog.pos = position;
            prog.dur = duration;
            mgrs.plui.verifyInterface();
            app.spacebarhookfunc = mgrs.plui.togglePlaybackState;
            //ticker may have stopped if playing new song.  state can change
            //due to external controls like bluetooth.  monitor to react.
            if(state !== pbstate) {
                jt.log("player.plui.updateDisplay reflecting: " + pbstate);
                state = pbstate;
                mgrs.plui.reflectPlaybackState(state); }
            mgrs.plui.updatePosIndicator(); }
    };  //end mgrs.plui returned functions
    }());


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
            app.svc.dispatch("spc", "playerMessage", tac); }
    return {
        token: function (contf) {  //verify token info, or contf(token)
            return app.svc.dispatch("spc", "token", contf); },
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
                if(app.svc.dispatch("spc", "tokenTimeOk")) {
                    return contf(); }
                pstat = "tokexpired"; }
            //Need to verify signin before getting token. No login on main page
            //prior to launch anymore.
            const steps = ["token", "sdkload", "swpconn"];
            if(steps.every((step) => mgrs.spa[step]())) {
                contf(); } },
        autoplayErr: function (err, mtxt) {
            jt.log("autoplayErr " + err + ": " + mtxt);
            if(app.svc.dispatch("spc", "isRefreshToken")) {
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
                    //app.svc.dispatch("spc", "refreshToken");  //not available
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
        switchToSpotifyTrack: function (wpso) {
            mgrs.cmt.toggleTuningOpts("off");
            mgrs.cmt.toggleCommentDisplay("off");
            mgrs.cmt.toggleSongShare("off");
            const st = wpso.track_window.current_track;
            const tid = "z:" + st.id;
            stat.song = {dsId:"spotify" + tid, ti:st.name,
                         ar:st.artists[0].name, ab:st.album.name,
                         spdn:(st.disc_number || 1),
                         sptn:(st.track_number || 1), spid:tid,
                         srcid:1, //reserved value for Spotify sourced Songs
                         al:49, el:49, kws:"", rv:5, fq:"N", nt:"", pc:1,
                         lp:new Date().toISOString()};
            app.deck.saveSongs(stat.song, true, function (updsong) {
                app.svc.dispatch("web", "addSongsToPool", [updsong]);
                app.deck.dispatch("hst", "noteSongPlayed", updsong);
                //deck should be notified and possibly rebuilt
                mgrs.aud.updateSongDisplay(); }); },
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
            mgrs.plui.updateDisplay(mgrs.spa, pbi.state, pbi.pos, pbi.dur); },
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
            app.svc.dispatch("spc", "playerMessage", "Playback failed " + msg);
            mgrs.spa.pause();  //stop playback of previously loaded song
            const odiv = jt.byId("mediaoverlaydiv");
            odiv.style.top = (jt.byId("playertitle").offsetHeight + 2) + "px";
            odiv.style.display = "block";
            odiv.innerHTML = "Song currently unavailable, skipping...";
            setTimeout(function () {
                jt.out("mediaoverlaydiv", "");
                jt.byId("mediaoverlaydiv").style.display = "none";
                app.player.next(); }, 3000);
            app.svc.dispatch("web", "playbackError",
                             {type:"spid", spid:pbi.song.spid, error:msg}); },
        playSong: function (song) {
            pbi.song = song;
            if(pstat !== "connected" || !pdid) {
                return; }  //playback starts after connection setup complete.
            //autoplay is generally blocked, but may happen if the state is
            //refreshed after hitting the play button.
            pbi.spuri = "spotify:track:" + pbi.song.spid.slice(2);
            app.svc.dispatch("spc", "sjc", `me/player/play?device_id=${pdid}`,
                             "PUT", {uris:[pbi.spuri]},
                             function () {
                                 jt.log("Playing " + pbi.spuri); },
                             mgrs.spa.handlePlayFailure); }
    };  //end mgrs.spa returned functions
    }());


    //Mobile device general audio interface
    mgrs.mob = (function () {
        var pbi = null; //playback state information
        var debouncing = false;
        var pscf = null;  //playback status callback func
        function updatePBI (status) {
            stat.stale = null;
            pbi.state = status.state;  //"playing"/"paused"/"ended"
            pbi.pos = status.pos;  //current play position ms
            pbi.dur = status.dur || pbi.dur;  //song duration if provided
            mgrs.slp.updateStatusInfo(pbi.state, pbi.pos, pbi.dur, status.path);
            debouncing = false; }
        function clearSongDisplay () {
            mgrs.cmt.toggleTuningOpts("off");
            mgrs.cmt.resetDisplay("mob clear");  //close comment if open
            jt.out("playtitletextspan", "---"); }
        function handleStatusQueryCallback (status) {
            jt.log("handleStatusQueryCallback status.path: " + status.path);
            const cbf = pscf;
            pscf = null;
            if(status.path && !status.song) {  //discovered a playing song
                const sd = app.deck.dispatch("sdt", "getSongsDict");
                if(sd && sd[status.path]) {
                    status.song = sd[status.path];
                    jt.log("handleStatusQueryCallback song found " +
                           status.song.ti);
                    stat.song = status.song;  //needed for playback display
                    app.deck.dispatch("dk", "removeFromDeck", status.path);
                    pbi = {song:status.song};  //init or reset to current song
                    updatePBI(status);
                    mgrs.aud.verifyPlayer(function () {
                        mgrs.aud.updateSongDisplay();
                        mgrs.plui.updateDisplay(mgrs.mob, pbi.state, pbi.pos,
                                                pbi.dur);
                        app.deck.playbackStatus(status); }); } }
            cbf(status); }  //call back whether song found or not
    return {
        ////calls from svc.mp
        notePlaybackStatus: function (status) {
            pbi.treceive = Date.now();  //note latency
            if(stat.stale && stat.stale.path === status.path) {
                return jt.log("mob.nPS ignoring stale stat from prev song"); }
            if(stat.song && (!status.path || !status.state ||
                             status.state === "unknown")) {
                jt.log("mob.notePlaybackStatus retrying bad status return: " +
                       JSON.stringify(status) + ", stat: " +
                       JSON.stringify(stat));
                return mgrs.mob.refreshPlayState(); }
            if(pscf) {  //checkIfPlaying call return, not tickf
                return handleStatusQueryCallback(status); }
            if(stat.song && stat.song.path === status.path) {
                if(pbi.state !== status.state) {
                    mgrs.plui.reflectPlaybackState(status.state); }
                updatePBI(status);
                mgrs.plui.updateDisplay(mgrs.mob, pbi.state, pbi.pos, pbi.dur);
                app.deck.playbackStatus(status); }  //album positioning
            else {  //song changed. most likely svc has moved forward N songs.
                updatePBI(status);
                clearSongDisplay();
                app.svc.loadDigDat(function (dbo) {  //load updated song(s) lp
                    dbo.dbts = new Date().toISOString();  //for stale data chk
                    stat.song = dbo.songs[status.path];
                    if(!stat.song) {  //foreign media, or wait for media read
                        return jt.log("mob.nPS ignoring unknown song media"); }
                    mgrs.cmt.resetDisplay("PBI");  //update comment indicator
                    mgrs.aud.updateSongDisplay();  //update controls display
                    app.deck.popForward(stat.song.path);
                    app.deck.rebuildHistory(); }); } },
        handlePlayFailure: function (errstat, errtxt) {
            //mobile should not encounter unsupported media types, so all
            //media should generally play.  Could be a deleted file, or media
            //service is bad broke or audio display is dead or whatever.
            var dispmsg = jt.tac2html(
                [errstat + ": " + errtxt + "&nbsp; ", 
                 ["a", {href:"#rebuild",
                        onclick:app.dfs("svc", "loc.loadLibrary",
                                        ["topdlgdiv", "rebuild"])},
                  "Rebuild Library"]]);
            const perms = ["EACCES", "(Permission denied)"];
            if(perms.some((p) => errtxt.indexOf(p) >= 0)) {
                const dtxt = ", msg: ";
                const ridx = errtxt.indexOf(dtxt);
                if(ridx > 0) {  //have previous path in message
                    dispmsg = (errtxt.slice(0, ridx + dtxt.length) +
                               "Permission denied"); } }
            jt.out("mediadiv", dispmsg); },
        ////calls from mgrs.plui
        refreshPlayState: function () {  //calls back to notePlaybackStatus
            //use timeout to yield to plui tickf processing
            setTimeout(function () {
                pbi = pbi || {};
                pbi.tsend = Date.now() + 100;
                app.svc.dispatch("mp", "requestStatusUpdate"); }, 100); },
        pause: function () {
            //jt.log("mgrs.mob.pause debouncing " + debouncing);
            if(!debouncing) {
                mgrs.plui.reflectPlaybackState("paused");
                debouncing = true;
                app.svc.dispatch("mp", "pause"); } },
        resume: function () {
            //jt.log("mgrs.mob.resume debouncing " + debouncing);
            if(!debouncing) {
                mgrs.plui.reflectPlaybackState("playing", "noticker");
                debouncing = true;
                app.svc.dispatch("mp", "resume"); } },
        seek: function (ms) {
            app.svc.dispatch("mp", "seek", ms); },
        sleep: function (count, cmd, cbf) {
            app.svc.dispatch("mp", "sleep", count, cmd, cbf); },
        ////calls from mgrs.aud
        playSong: function (ps) {
            pbi = {song:ps, pos:0, dur:ps.duration || 0, state:"playing"};
            //verify song playback display and kick off ticker as needed
            mgrs.plui.updateDisplay(mgrs.mob, pbi.state, pbi.pos, pbi.dur);
            app.svc.dispatch("mp", "playSong", ps.path);
            mgrs.mob.refreshPlayState(); },
        verifyPlayer: function (contf) {
            mgrs.plui.verifyInterface();
            contf(); },
        setPlaybackStatusCallback: function (contf) {
            pscf = contf; },
        ////general funcs
        setState: function (rst, songs) {
            stat.song = rst.song;
            stat.status = rst.state;  //unreliable status when state last saved.
            if(songs && songs[stat.song.path]) {
                stat.song = songs[stat.song.path]; }
            pbi = {song:stat.song, pos:rst.pos, dur:rst.dur, state:rst.state};
            mgrs.aud.verifyPlayer(function () {
                mgrs.plui.updateDisplay(mgrs.mob, pbi.state, pbi.pos, pbi.dur);
                mgrs.aud.updateSongDisplay(); }); },
        rebuildIfSongPlaying: function (updsg) {  //song updated from hub
            if(updsg && stat.song && stat.song.path === updsg.path) {
                const chgflds = mgrs.gen.listChangedFields(stat.song, updsg);
                stat.song = updsg;
                if(chgflds.length) {  //have interim changes during sync
                    try {
                        chgflds.forEach(function (chg) {
                            jt.log("Restoring UI " + chg.fld + ": " + chg.val);
                            chg.uf(chg.val); });
                    } catch(e) {
                        jt.log("Not all UI fields restored: " + e);
                    } }
                //cmt.resetDisplay not needed since UI fields kept.
                mgrs.aud.updateSongDisplay(); } },
        playbackStatusCallLatency: function () {
            var lat = 300;  //better than zero if just guessing
            if(pbi && pbi.tsend && pbi.treceive) {
                jt.log("playbackSatusCallLatency " + JSON.stringify(pbi));
                lat = pbi.treceive - pbi.tsend; }
            lat = Math.min(lat, 500);  //anything over a half second is crap
            return lat; }
    };  //end mgrs.mob returned functions
    }());


    //general interface for whatever audio player is being used.
    mgrs.aud = (function () {
        var cap = "loa";  //current audio player
    return {
        init: function () {
            var ap = app.svc.dispatch("gen", "plat", "audsrc");
            switch(ap) {
            case "Spotify": cap = "spa"; mgrs.spa.token(); break;
            case "Android": cap = "mob"; break;
            case "IOS": cap = "mob"; break;
            default: cap = "loa"; } },
        currentAudioPlayer: function () { return cap; },
        handlePlayerError: function (errval) {
            //On Firefox, errval is a DOMException
            var errmsg = String(errval);  //error name and detail text
            jt.log("Play error " + errmsg + " " + stat.song.path);
            //NotAllowedError is normal on app start. Autoplay is generally
            //disabled until the user has interacted with the player.
            if(errmsg.indexOf("NotAllowedError") >= 0) {
                if(mgrs[cap].handleNotAllowedError) {
                    return mgrs[cap].handleNotAllowedError(errmsg); }
                return; }
            //NotSupportedError means file is unplayable by the current
            //player, but might be ok.  For example on MacOS, Safari handles
            //an .m4a but Firefox doesn't.  Best to skip to the next song,
            //assuming this is an anomaly and the next one will likely play.
            //Wait before skipping so it doesn't seem like "play now" just
            //played the wrong song.  Error displays in history view.
            if((errmsg.indexOf("NotSupportedError") >= 0) ||
               (errmsg.indexOf("could not be decoded") >= 0)) {
                jt.log("mgrs.aud.handlePlayerError skipping song...");
                playerrs[stat.song.path] = errmsg;
                setTimeout(app.player.skip, 4000); } },
        updateSongTitleDisplay: function () {
            var tunesrc = "img/tunefork.png";
            const tuneimg = jt.byId("tuneimg");
            if(tuneimg) {
                tunesrc = tuneimg.src; }
            jt.out("playertitle", jt.tac2html(
                ["div", {cla:"songtitlediv"},
                 [["div", {id:"playtitlebuttonsdiv"},
                   [["span", {id:"modindspan"}],
                    ["a", {href:"#tuneoptions", title:"Tune Playback Options",
                           id:"tuneopta", onclick:mdfs("cmt.toggleTuningOpts")},
                     ["img", {src:tunesrc, cla:"ptico inv", id:"tuneimg"}]]]],
                  ["span", {id:"playtitletextspan"},
                   app.deck.dispatch("sop", "songIdentHTML", stat.song)]]])); },
        updateSongDisplay: function () {
            mgrs.kwd.rebuildToggles();
            mgrs.aud.updateSongTitleDisplay();
            mgrs.pan.updateControl("al", stat.song.al);
            mgrs.pan.updateControl("el", stat.song.el);
            stat.song.rv = stat.song.rv || 0;  //verify numeric value
            mgrs.rat.adjustPositionFromRating(stat.song.rv);
            mgrs.cmt.updateIndicators(); },
        playAudio: function () {
            stat.status = "playing";
            jt.log("player.aud.playAudio " + JSON.stringify(stat.song));
            mgrs.aud.verifyPlayer(function () {
                mgrs.aud.updateSongDisplay();
                mgrs[cap].playSong(stat.song); }); },
        pausePlayback: function () {
            if(!mgrs[cap].pause) {
                return jt.log("aud.pausePlayback not supported by " + cap); }
            mgrs[cap].pause(); },
        playbackStatusCallLatency: function () {
            if(!mgrs[cap].playbackStatusCallLatency) {
                return 0; }
            return mgrs[cap].playbackStatusCallLatency(); },
        checkIfPlaying: function (contf) {  //contf
            if(cap === "mob") {  //possible to be playing prior to app launch
                jt.log("checkIfPlaying calling for player status");
                mgrs.mob.setPlaybackStatusCallback(contf);
                mgrs.mob.refreshPlayState(); }
            else {  //no need to check, just call through immediately
                contf(stat); } },
        verifyPlayer: function (contf) {
            if(!jt.byId("playerdiv")) {
                jt.out("mediadiv", jt.tac2html(
                    ["div", {id:"playerdiv"},
                     [["div", {id:"playertitle"}, "Starting"],
                      ["div", {id:"playertuningdiv"}],
                      ["div", {id:"audioplayerdiv"},
                       [["div", {id:"audiodiv"}],
                        ["div", {id:"nextsongdiv"},
                         ["a", {href:"#skip", title:"Skip To Next Song",
                                onclick:jt.fs("app.player.skip()")},
                          ["img", {src:"img/skip.png",
                                   cla:"ptico inv"}]]]]]]])); }
            mgrs[cap].verifyPlayer(contf); }
    };  //end mgrs.aud returned functions
    }());


    //Pan drag indicator manager handles drag decoration for the pan controls
    mgrs.pdi = (function () {
        function verifySVG (cid) {
            const sid = cid + "svg";
            if(jt.byId(sid)) { return true; }  //already set up. done.
            jt.out(cid + "panddecdiv", jt.tac2html(
                ["svg", {id:sid, xmlns:"http://www.w3.org/2000/svg",
                         viewBox:"0 0 100 100", "stroke-width":3,
                         stroke:"#ffab00", fill:"#ffab00"},
                 [["line", {id:sid + "tl", x1:50, y1:3, x2:50, y2:35}],
                  ["path", {d:"M50 3 L55 8 L45 8 Z"}],
                  ["line", {id:sid + "bl", x1:50, y1:55, x2:50, y2:97}],
                  ["path", {d:"M50 97 L55 92 L45 92 Z"}]]])); }
    return {
        showDragIndicators: function (cid) {
            verifySVG(cid);
            jt.byId(cid + "svg").style.display = "block"; },
        hideDragIndicators: function (cid) {
            verifySVG(cid);
            jt.byId(cid + "svg").style.display = "none"; }
    };  //end of mgrs.pdi returned functions
    }());


    //handle the pan controls for energy and approachability
    mgrs.pan = (function () {
        const anglemax = 145;  //max knob rotation
        const cmso = 14;  //click move knob spacing offsset
        const kcph = 40;  //knob control panel height
        function balanceLabels () {
            const ids = ["alpanlld", "alpanrld", "elpanlld", "elpanrld"];
            const els = ids.map((i) => jt.byId(i));
            const wds = els.map((e) => e? e.offsetWidth : 0);
            //Hardcoded minimum width avoids overpacking and balances if space.
            const mw = Math.max(48, Math.max.apply(null, wds));
            els.forEach(function (e) {
                if(e) {
                    e.style.width = mw + "px"; } }); }
        function packControlWidthwise (id) {
            balanceLabels();
            const pk = {leftlab:{elem:jt.byId(id + "panlld")},
                        rightlab:{elem:jt.byId(id + "panrld")},
                        surr:{elem:jt.byId(id + "pansurrbgd")},
                        lpdl:{elem:jt.byId(id + "panlpd")},
                        rpdl:{elem:jt.byId(id + "panrpd")},
                        panbg:{elem:jt.byId(id + "panbgdiv")},
                        panface:{elem:jt.byId(id + "panfacediv")}};
            Object.keys(pk).forEach(function (key) {
                pk[key].bbox = pk[key].elem.getBoundingClientRect(); });
            const left = 8 + pk.leftlab.bbox.width;
            pk.panbg.elem.style.left = left + "px";
            pk.panface.elem.style.left = left + "px";
            pk.surr.elem.style.left = (left - cmso) + "px";
            pk.surr.elem.style.width = (kcph + (2 * cmso)) + "px";
            pk.lpdl.elem.style.width = left + 22 + "px";
            pk.rpdl.elem.style.width = (pk.rightlab.bbox.width + 5 + 22) + "px";
            pk.lpdl.elem.style.height = kcph + "px";
            pk.rpdl.elem.style.height = kcph + "px";
            ctrls[id].width = left + 44 + pk.rightlab.bbox.width + 5;
            const pds = ["pancontdiv", "pandiv", "panddecdiv", "pandragdiv"];
            pds.forEach(function (panelid) {
                const panel = jt.byId(id + panelid);
                panel.style.width = ctrls[id].width + "px";
                panel.style.height = kcph + "px"; });
            //jt.log(id + "pandragdiv width: " + ctrls[id].width);
            ctrls[id].knog = {x:pk.panbg.elem.offsetLeft + 21, //viz elem calc
                              y:Math.floor(ctrls[id].width / 2) + 2}; }
        function positionDragOverlay (id) {
            const pk = {pots:jt.byId("panpotsdiv"),
                        pan:jt.byId(id + "pandiv"),
                        drag:jt.byId(id + "pandragdiv")};
            const leftpad = parseInt(
                window.getComputedStyle(pk.pots)
                    .getPropertyValue("padding-left"), 10);
            const dragdims = {top:0,  //relative to impressiondiv
                              left:pk.pan.offsetLeft - leftpad,
                              width:pk.pan.offsetWidth,
                              height:pk.pan.offsetHeight};
            Object.entries(dragdims).forEach(function ([k, v]) {
                pk.drag.style[k] = v + "px"; }); }
        function valueRangeConstrain (v) {
            v = Math.max(v, 0);
            v = Math.min(v, 99);
            return v; }
        function setTLHW (elem, dim) {
            if(dim.t !== undefined) {
                elem.style.top = dim.t + "px"; }
            if(dim.l !== undefined) {
                elem.style.left = dim.l + "px"; }
            if(dim.h !== undefined) {
                elem.style.height = dim.h + "px"; }
            if(dim.w !== undefined) {
                elem.style.width = dim.w + "px"; } }
        function updateValueByClick (id, x/*, y*/) {
            var val = stat.song[id];
            if(ctrls[id].eventType === "dblclick") {
                if(val !== 49) {
                    mgrs.pan.updateControl(id, 49); }
                return; }
            const cfms = 400;  //paddle click fade milliseconds
            const kf = jt.byId(id + "panfacediv");
            if(x < kf.offsetLeft - cmso) {
                mgrs.gen.illuminateAndFade(id + "panlpd", cfms);
                val -= 1; }
            else if(x > kf.offsetLeft + kf.offsetWidth + cmso) {
                mgrs.gen.illuminateAndFade(id + "panrpd", cfms);
                val += 1; }
            val = valueRangeConstrain(val);
            if(val !== stat.song[id]) {  //value has changed
                mgrs.pan.updateControl(id, val); } }
        function activateDragArea (id) {
            const pc = ctrls[id];
            const drgdiv = jt.byId(id + "pandragdiv");
            mgrs.pdi.showDragIndicators(id);
            pc.maxxlim = pc.width;  //width from packControlWidthwise
            pc.maxylim = pc.width;  //make square, then adjust top offset
            pc.toplift = Math.round((pc.maxylim - kcph) / -2);
            setTLHW(drgdiv, {t:pc.toplift, h:pc.maxylim});
            setTLHW(jt.byId(id + "panddecdiv"), {t:pc.toplift, h:pc.maxylim}); }
        function deactivateDragArea (id) {
            const drgdiv = jt.byId(id + "pandragdiv");
            mgrs.pdi.hideDragIndicators(id);
            setTLHW(drgdiv, {t:0, h:kcph});
            setTLHW(jt.byId(id + "panddecdiv"), {t:0, h:kcph}); }
        function updateValueByDragCoordinates (id, ignore/*x*/, y) {
            var val = 49;
            const pc = ctrls[id];
            const vpad = pc.maxylim / 10;  //reserve 10% at top/bottom for drag
            const ath = pc.maxylim - (2 * vpad);  //active tracking height
            y -= vpad;  //remove bottom pad area from working y value
            y = Math.max(0, y);
            y = Math.min(ath, y);
            const yp = (y / ath) * 100;  //y as percentage of height
            const iyp = 100 - yp;  //invert so 0 at bottom and 100 at top
            val = Math.round((iyp / 100) * 99);  //convert pcnt to 0-99 range
            if(val !== stat.song[id]) {  //value has changed
                mgrs.pan.updateControl(id, val); } }
        function handleClickMove (id, x, y, pa) {
            if(ctrls[id].eventType.indexOf("click") >= 0) {
                if(!pa) {  //two click notices per click, choosing non-pa one
                    if(!ctrls[id].dc.dragged) {  //value not changed by dragging
                        //jt.log(ctrls[id].eventType + " x:" + x + ", y:" + y);
                        updateValueByClick(id, x, y); } } }
            else {  //not a click event
                if(pa) {  //pointing active, mouse is down
                    if(ctrls[id].dc.status === "inactive") {
                        activateDragArea(id);
                        ctrls[id].dc.dragged = false;
                        ctrls[id].dc.status = "active"; }
                    else { //ctrls[id].dc.status === "active"
                        updateValueByDragCoordinates(id, x, y);
                        ctrls[id].dc.dragged = true; } }
                else {  //not pointing, mouse is up
                    deactivateDragArea(id);
                    ctrls[id].dc.status = "inactive"; } } }
        function activateControl (id) {
            ctrls[id].dc = {status:"inactive", dragged:"false"};
            ctrls[id].posf = function (x, y, pa) {
                handleClickMove(id, x, y, pa); };
            //double click reset not strictly necessary, and tends to
            //interfere with fat finger paddle controls on phone.
            // jt.on(jt.byId(id + "pandragdiv"), "dblclick", function (ignore) {
            //     mgrs.pan.updateControl(ctrls[id].fld, 49); });
            app.filter.movelisten(id + "pandragdiv",
                                  ctrls[id], ctrls[id].posf); }
        function createControl (id, det) {
            var pc = {fld:det.fld, pn:det.pn, low:det.low, high:det.high,
                      pointingActive:false, roundpcnt:3};  //maxxlim set in pack
            ctrls[id] = pc;
            jt.out(id + "pandiv", jt.tac2html(
              ["div", {cla:"pancontdiv", id:pc.fld + "pancontdiv"},
               [["div", {cla:"panleftpaddlediv", id:pc.fld + "panlpd"}],
                ["div", {cla:"panrightpaddlediv", id:pc.fld + "panrpd"}],
                ["div", {cla:"panddecdiv", id:pc.fld + "panddecdiv"}],
                ["div", {cla:"pansurrbgdiv", id:pc.fld + "pansurrbgd"}],
                ["div", {cla:"panleftlabdiv", id:pc.fld + "panlld"}, pc.low],
                ["div", {cla:"panrightlabdiv", id:pc.fld + "panrld"}, pc.high],
                ["div", {cla:"panfacediv", id:pc.fld + "panfacediv"},
                 ["img", {cla:"panfaceimg invlow", src:"img/panface.png"}]],
                ["div", {cla:"panbgdiv", id:pc.fld + "panbgdiv"},
                 ["img", {cla:"panbackimg", src:"img/panback.png"}]]]]));
            packControlWidthwise(id);
            positionDragOverlay(id);
            activateControl(id); }
        function hex2RGB (hexcolor) {
            var hcs = hexcolor.match(/\S\S/g);
            return {r:parseInt(hcs[0], 16),
                    g:parseInt(hcs[1], 16),
                    b:parseInt(hcs[2], 16)}; }
        function updateTitle (id, songtitle) {
            var title = "Dial-In " + ctrls[id].pn;
            if(songtitle) {
                title += " for " + songtitle; }
            const div = jt.byId(id + "pandiv");
            if(div) {
                div.title = title; } }
    return {
        makePanControls: function () {
            var filters = app.filter.filters();
            createControl("al", filters[0]);
            createControl("el", filters[1]);
            mgrs.pan.updateControl("al");
            mgrs.pan.updateControl("el");
            jt.on("impressiondiv", "mousedown", function (event) {
                const okinids = ["kwdin", "sleepcountsel", "commentta"];
                if(!event.target || okinids.indexOf(event.target.id) < 0) {
                    jt.evtend(event); } });  //ignore to avoid selecting ctrls
            jt.on("impressiondiv", "mouseup", function (event) {
                ctrls.al.pointingActive = false;
                ctrls.el.pointingActive = false;
                ctrls.rat.pointingActive = false;
                const okinids = ["kwdin", "commentta"];
                if(!event.target || okinids.indexOf(event.target.id) < 0) {
                    jt.evtend(event); } });  //don't update coords
            jt.on("panplaymousingdiv", "mouseup", function (ignore /*event*/) {
                //do not capture this event or Safari audio will capture the
                //downclick on the position indicator and never let go.
                ctrls.al.pointingActive = false;
                ctrls.el.pointingActive = false;
                ctrls.rat.pointingActive = false; }); },
        updateControl: function (id, val) {
            if(!val && val !== 0) {
                val = 49; }
            if(typeof val === "string") {
                val = parseInt(val, 10); }
            if(stat.song) {
                if(stat.song[id] !== val) {
                    stat.song[id] = val;
                    updateTitle(id, stat.song.ti);
                    noteSongModified(); } }
            //set knob face color from gradient
            const gra = app.filter.gradient();
            const grd = {f:hex2RGB(gra.left),
                         t:hex2RGB(gra.right)};
            const pct = (val + 1) / 100;
            const res = {r:0, g:0, b:0};
            Object.keys(res).forEach(function (key) {
                res[key] = Math.round(
                    grd.f[key] + (grd.t[key] - grd.f[key]) * pct); });
            const pfd = jt.byId(id + "panfacediv");
            pfd.style.backgroundColor = "rgb(" + 
                res.r + ", " + res.g + ", " + res.b + ")";
            //rotate knob to value
            const rot = Math.round(2 * anglemax * pct) - anglemax;
            pfd.style.transform = "rotate(" + rot + "deg)"; }
    };  //end mgrs.pan returned functions
    }());


    //handle the selected keywords display and entry
    mgrs.kwd = (function () {
        var kwdefs = null;
        function kwds2albHTML () {
            return jt.tac2html(
                ["div", {cla:"buttondlgdiv"},
                 [["button", {
                     type:"button",
                     title:"Add selected keywords to all Album songs",
                     onclick:mdfs("kwd.togkwds2alb")},
                   [["img", {cla:"tunactimg inv", src:"img/keys.png"}],
                    "&nbsp;&#x21e8;&nbsp;", //rightwards white arrow
                    ["img", {cla:"tunactimg inv", src:"img/album.png"}]]],
                  ["div", {id:"kwds2albconfdiv"}]]]); }
        function humanReadKwds (kwdcsv) {
            const qks = kwdcsv.csvarray().map((kwd) => "\"" + kwd + "\"");
            return qks.join(", "); }
    return {
        makeToggleButton: function (kd, idx) {
            var tc = "kwdtogoff";
            if(stat.song && stat.song.kws && stat.song.kws.csvcontains(kd.kw)) {
                tc = "kwdtogon"; }
            return ["button", {type:"button", cla:tc, id:"kwdtog" + idx,
                               title:kd.dsc || "",
                               onclick:mdfs("kwd.toggleKeyword", idx)},
                    kd.kw]; },
        toggleKeyword: function (idx) {
            stat.song.kws = stat.song.kws || "";
            const button = jt.byId("kwdtog" + idx);
            if(button.className === "kwdtogoff") {
                button.className = "kwdtogon";
                stat.song.kws = stat.song.kws.csvappend(button.innerHTML); }
            else {
                button.className = "kwdtogoff";
                stat.song.kws = stat.song.kws.csvremove(button.innerHTML); }
            mgrs.kwd.togkwds2alb("off");
            app.top.dispatch("gen", "togtopdlg", "", "close");  //sc changed
            noteSongModified(); },
        rebuildToggles: function (context) {
            kwdefs = app.top.dispatch("kwd", "defsArray", true);
            jt.out("kwdsdiv", jt.tac2html(
                [["button", {type:"button", id:"kwdexpb",
                             onclick:mdfs("kwd.toggleExpansion")},
                  "+"],
                 ["span", {id:"newkwspan"}],
                 ...kwdefs.filter((kd) => kd.pos > 0).map((kd, idx) =>
                     mgrs.kwd.makeToggleButton(kd, idx)),
                 ["span", {id:"extrakwspan"}]]));
            if(context === "playeradd") {
                mgrs.kwd.toggleExpansion(); } },
        toggleExpansion: function (togstate) {
            var togb = jt.byId("kwdexpb");
            if(togb.innerHTML === "+" && togstate !== "off") {
                jt.out("newkwspan", jt.tac2html(
                    [["input", {type:"text", id:"kwdin", size:10, value:"",
                                placeholder:"new keyword"}],
                     ["button", {type:"button", id:"addkwb",
                                 onclick:mdfs("kwd.addNewKeyword")}, "+"]]));
                jt.out("extrakwspan", jt.tac2html(
                    kwdefs.filter((kd) => kd.pos <= 0).map((kd, i) =>
                        mgrs.kwd.makeToggleButton(kd, i + 4))
                        .concat(kwds2albHTML())));
                togb.innerHTML = "-"; }
            else {
                jt.out("newkwspan", "");
                jt.out("extrakwspan", "");
                togb.innerHTML = "+"; } },
        addNewKeyword: function () {
            var kwd = jt.byId("kwdin").value;
            if(!kwd || !kwd.trim()) { return; }
            kwd = kwd.replace(/\s/, "");  //no spaces
            kwd = kwd.capitalize();       //capitalized
            kwd = kwd.slice(0, 10);       //max 10 chars
            if(kwdefs.find((kd) => kd.kw === kwd)) {
                jt.byId("kwdin").value = "";  //clear duplicate value
                return; }
            jt.byId("addkwb").disabled = true;
            jt.out("extrakwspan", "Adding " + kwd + "...");
            if(!stat.song.kws.csvcontains(kwd)) {
                stat.song.kws = stat.song.kws.csvappend(kwd);
                noteSongModified(); }
            app.top.dispatch("kwd", "addKeyword", kwd, "playeradd"); },
        togkwds2alb: function (togstate) {
            //Not worth extending to remove all keywords. Use a marker kw.
            const divid = "kwds2albconfdiv";
            const div = jt.byId(divid);
            if(togstate === "off" || div.innerHTML) {
                div.innerHTML = "";
                return; }
            const wasoa = " with all songs on \"" + stat.song.ab + "\"";
            if(!stat.song.kws) {
                div.innerHTML = "Select keywords to associate" + wasoa;
                return; }
            const ropts = [{v:"overwrite", t:"Overwrite"},
                           {v:"addifmiss", t:"Add if not already set",
                            c:"checked"}];
            jt.out(divid, jt.tac2html(
                ["Associate " + humanReadKwds(stat.song.kws) + wasoa + "?",
                 ["div", {id:"abactoptsdiv"},
                  [ropts.map((ao) =>
                      ["div", {cla:"tuneoptiondiv"},
                       [["input", {type:"radio", id:"assocrad" + ao.v,
                                   name:"assocoption", value:ao.v,
                                   checked:jt.toru(ao.c)}],
                        ["label", {fo:"assocrad" + ao.v}, ao.t]]]),
                   ["button", {type:"button",
                               onclick:mdfs("kwd.assocKwdProc", "ab")},
                    "Update Songs"]]]])); },
        assocKwdProc: function (fld) {
            var merge = jt.byId("assocradaddifmiss");
            if(merge) {
                merge = merge.checked; }
            jt.out("abactoptsdiv", "Processing...");
            app.svc.fetchSongs(
                function (songs) {
                    var updsongs = [];
                    jt.out("abactoptsdiv", "Marking...");
                    const locmod = new Date().toISOString();
                    Object.values(songs).forEach(function (s) {
                        if(s[fld] === stat.song[fld] && s.ar === stat.song.ar) {
                            if(merge) {
                                stat.song.kws.csvarray().forEach(function (kw) {
                                    s.kws = s.kws.csvremove(kw);
                                    s.kws = s.kws.csvappend(kw); }); }
                            else {
                                s.kws = stat.song.kws; }
                            s.locmod = locmod;
                            updsongs.push(s); } });
                    jt.out("abactoptsdiv", "Updating " + updsongs.length +
                           " songs...");
                    app.svc.dispatch("gen", "updateMultipleSongs", updsongs,
                        function (upds) {
                            app.deck.dispatch("alb", "noteUpdatedAlbumSongs",
                                              upds);
                            jt.out("abactoptsdiv", String(updsongs.length) +
                                   " songs updated."); },
                        function (code, errtxt) {
                            jt.out("abactoptsdiv", "Song update failed " +
                                   code + ": " + errtxt); }); },
                function (code, errtxt) {
                    jt.out("abactoptsdiv", "Song retrieval failed " + code +
                           ": " + errtxt); }); }
    };  //end mgrs.kwd returned functions
    }());


    //handle the song comment display and entry
    mgrs.cmt = (function () {
        const ost = {mode:"", dispf:null, odi:"panplayoverlaydiv"};
        const modeps = {
            share: {bids:["sg2cbb", "sg2dhb"], statd:"sharestatdiv"},
            comment: {bids:["cancelb", "savcmtb"], statd:"cmtstatdiv"}};
        const sfos = [{v:"P", t:"Playable"},  //selectable frequency options
                      {v:"B", t:"Tired"},
                      {v:"R", t:"Don't Suggest"}];
        const subcats = {"P":["N",   //Newly added song
                              "P"],  //Playable
                         "B":["B",   //Back-burner, 90 days between plays
                              "Z",   //Resting, default 180 days between plays
                              "O"],  //Overplayed, 365 days between plays
                         "R":["R",   //Reference only, do not play by default
                              "M",   //Metadata no longer matches media
                              "I",   //Ignore, song is in an ignore folder
                              "D",   //Deleted, media file no longer available
                              "U"]}; //Unreadable, no metadata, corrupted etc.
        function isSubcatValue (cat, val) {
            return (subcats[cat] && subcats[cat].indexOf(val) >= 0); }
        function tuningDisplayMode (val) {
            var sfo = sfos.find((sfo) => isSubcatValue(sfo.v, val));
            sfo = sfo || sfos[0];
            return sfo.v; }
        function isSelVal (radval) {
            var songval = ost.song.fq || "P";
            if(songval === "0") { songval = "P"; }  //tolerate bad data init
            songval = songval.slice(0, 1);  //e.g treat "DP" as Deleted
            return isSubcatValue(radval, songval); }
        function impressionSummary () {
            const imps = [{lab:"Keywords", val:ost.song.kws || "none"},
                          {lab:"Approachability", val:"Medium"},
                          {lab:"Energy Level", val:"Medium"}];
            if(ost.song.al <= 40) { imps[1].val = "Easy"; }
            if(ost.song.al >= 65) { imps[1].val = "Hard"; }
            if(ost.song.el <= 40) { imps[2].val = "Chill"; }
            if(ost.song.el >= 65) { imps[2].val = "Amped"; }
            return imps; }
        function clipboardSongDescription(s) {
            var txt = s.ti + "\nby: " + s.ar + "\n";
            if(s.ab !== "Singles") {
                txt += "album: " + s.ab; }
            const ct = mgrs.cmt.cleanCommentText(ost.song.nt);
            if(ct) {
                txt += "\n" + ct + "\n"; }
            txt += "\n";
            txt += impressionSummary().map((imp) =>
                (imp.lab + ": " + imp.val)).join("\n");
            const acct = app.top.dispatch("aaa", "getAccount");
            if(acct && acct.digname) {
                txt += "\nFind me on DiggerHub: " + acct.digname + "\n"; }
            return txt; }
        function prevPlayAndDupesHTML () {
            var pp = ""; var ddct = ""; var dupesongshtml = "";
            if(ost.prevPlayed) {
                pp = jt.tz2human(ost.prevPlayed);
                pp = "Previously played " + pp; }
            const dupes = app.deck.dispatch("sdt", "getSongDupes", ost.song);
            if(dupes && dupes.length) {
                const dn = dupes.length;
                ddct = jt.tac2html(
                    [", ",
                     ["a", {href:"#togdupedisplay",
                            onclick:jt.fs("app.togdivdisp('dupesdispdiv')")},
                      dn + " dupe" + ((dn > 1)? "s" : "")]]);
                dupesongshtml = jt.tac2html(
                    dupes.map((s) =>
                        ["div", {cla:"dupesongdispdiv"},
                         app.deck.dispatch("sop", "songIdentHTML", s)])); }
            return jt.tac2html(
                ["div", {id:"prevplaydiv"},
                 [["span", {id:"ppvalspan"}, pp],
                  ddct,
                  ["div", {id:"dupesdispdiv", style:"display:none"},
                   dupesongshtml]]]); }
        function genreDispHTML () {
            var html = ""; var gv;
            if(ost.song.genrejson) {
                try {
                    gv = JSON.parse(ost.song.genrejson);
                    if(Array.isArray(gv)) {
                        gv = gv.map((g) => jt.escq(g)).join(", "); }
                    html = "Genre: " + gv;
                } catch(e) {
                    jt.log("genreDispHTML err " + e); } }
            return html; }
        function resStat(txt) {
            jt.log("player.cmt.resStat: " + txt);
            jt.out(modeps[ost.mode].statd, jt.tac2html(
                [["div", {id:"pdlgstattxtdiv"}, txt],
                 ["a", {href:"#done", onclick:mdfs("cmt.closeOverlay")},
                  "Ok"]]));
            ost.btdonef(); }
        function showTiredAlbumButton () {
            jt.out("albtireddiv", "");
            if(isSubcatValue("B", ost.song.fq)) {
                jt.out("albtireddiv", jt.tac2html(
                    ["div", {cla:"buttondlgdiv"},
                     [["button", {type:"button",
                                  title:"Mark all songs on this album as tired",
                                  onclick:mdfs("cmt.snoozeAllSongsOnAlbum")},
                       [["img", {cla:"tunactimg inv", src:"img/album.png"}],
                        "&nbsp;&#x21e8;&nbsp;", //rightwards white arrow
                        ["img", {cla:"tunactimg inv", src:"img/snzblk.png"}]]],
                      ["div", {id:"albtiredconfdiv"}]]])); } }
        const buttons = {
            sg2cbb: {name:"Clipboard", handler:function () {
                const txt = clipboardSongDescription(ost.song);
                app.svc.dispatch("gen", "copyToClipboard", txt,
                    function () {
                        resStat("Details copied to clipboard."); },
                    function () {  //no helpful error info, and none returned
                        resStat("Clipboard copy failed."); }); }},
            sg2dhb: {name:"DiggerHub", handler:function () {
                if(!app.haveHubCredentials()) {
                    return resStat("Sign in to share songs."); }
                if(!mgrs.cmt.cleanCommentText(ost.song.nt)) {
                    return resStat("Write a comment to share"); }
                const start = new Date(Date.now() - 2000).toISOString();
                app.svc.dispatch("gen", "fanMessage",
                    app.authdata({action:"share", idcsv:ost.song.dsId}),
                    function (msgs) {
                        if(!msgs.length) {
                            resStat("No confirmation, try again later."); }
                        else if(msgs[0].created > start) {
                            resStat("Song shared with your listeners."); }
                        else {
                            resStat("Song already shared."); } },
                    function (code, errtxt) {
                        resStat(code + ": " + errtxt); }); }},
            cancelb: {name:"Cancel", handler:function () {
                mgrs.cmt.closeOverlay(); }},
            savcmtb: {name:"Ok", handler:function () {
                ost.song.nt = jt.byId("commentta").value;
                ost.song.lp = new Date().toISOString();
                app.deck.saveSongs(ost.song, false,
                    function (upds) {
                        jt.log("Song" + ost.song.dsId + " comment saved: " +
                               upds[0].nt);
                        mgrs.cmt.closeOverlay();
                        mgrs.cmt.updateIndicators();
                        ost.btdonef(); },
                    function (code, errtxt) {
                        resStat("Comment save failed " + code + ": " +
                                errtxt); }); }} };
        function buttonsHTML () {
            return jt.tac2html(modeps[ost.mode].bids.map((bid) =>
                ["button", {type:"button", id:bid,
                            onclick:mdfs("cmt.buttonHandler", bid)},
                 buttons[bid].name])); }
        function togDialog (togstate, mode, dispf) {
            ost.song = null;
            ost.mode = mode || "";
            const odiv = jt.byId(ost.odi);
            if(togstate === "off" || odiv.style.display !== "none") {
                odiv.style.display = "none";
                return; }
            mgrs.kwd.toggleExpansion("off");
            ost.song = stat.song;  //dialog update reference
            const ppmdiv = jt.byId("panplaydiv");
            odiv.style.display = "block";
            odiv.style.height = (ppmdiv.offsetHeight - 5) + "px";
            odiv.style.width = (ppmdiv.offsetWidth - 5) + "px";
            odiv.innerHTML = jt.tac2html(
                ["div", {id:"ppocontdiv",
                         onclick:mdfs("cmt.ignoreClick", "event")},
                 [["div", {id:"pposidiv"}, 
                   app.deck.dispatch("sop", "songIdentHTML", ost.song)],
                  dispf()]]); }
        function allowablePercolatingEvent (event) {
            return (event && event.target && event.target.id &&
                    event.target.id.startsWith("tunerad")); }
            
    return {
        cleanCommentText: function (txt) {
            txt = txt || "";
            if(txt) {
                txt = txt.replace(/Amazon.com Song ID: \d+/, "").trim(); }
            return txt; },
        closeOverlay: function (event) {
            if(!allowablePercolatingEvent(event)) {
                togDialog("off"); } },
        ignoreClick: function (event) {
            if(!allowablePercolatingEvent(event)) {
                jt.evtend(event); } },
        toggleCommentDisplay: function (togstate) {
            togDialog(togstate, "comment", function () {
                const html = jt.tac2html(
                    ["div", {id:"commentdispdiv"},
                     [["textarea", {id:"commentta", name:"commentta", 
                                    rows:4, cols:40,
                                    //comments vary a lot. placeholder text
                                    //can interrupt the writing process.
                                    placeholder:""},
                       ost.song.nt || ""],
                      ["div", {cla:"dlgbuttonsdiv"}, buttonsHTML()],
                      ["div", {id:"cmtstatdiv"}]]]);
                setTimeout(function () {
                    const cta = jt.byId("commentta");
                    if(cta) {
                        cta.focus(); } }, 150);
                return html; }); },
        updateIndicators: function () {
            const tuneimg = jt.byId("tuneimg");
            if(tuneimg) {
                tuneimg.src = "img/tunefork.png";  //reset
                if(tuningDisplayMode(stat.song.fq) !== "P") {
                    tuneimg.src = "img/tuneforkact.png"; } }
            const commentimg = jt.byId("togcommentimg");
            if(commentimg) {
                commentimg.src = "img/comment.png";  //reset
                if(mgrs.cmt.cleanCommentText(stat.song.nt)) {
                    commentimg.src = "img/commentact.png"; } } },
        toggleSongShare: function (togstate) {
            togDialog(togstate, "share", function () { return jt.tac2html(
                [["div", {id:"sharedispdiv"},
                  [["div", ["img", {id:"sharesrcimg",
                                    src:"img/diggerbutton.png"}]],
                   ["div", ["img", {id:"sharrowimg",
                                    src:"img/sharrow.png"}]],
                   ["div", {id:"shbdiv"}, buttonsHTML()]]],
                 ["div", {id:"sharestatdiv"}]]); }); },
        toggleTuningOpts: function (togstate) {
            togDialog(togstate, "tuning", function () {
                const html = jt.tac2html(
                    ["div", {id:"tunefqdispdiv", cla:"togdlgabspos"},
                     [["div", {id:"frequencyoptionsdiv"},
                       sfos.map((fo) =>
                           ["div", {cla:"tuneoptiondiv"},
                            [["input", {type:"radio", id:"tunerad" + fo.v,
                                        name:"tuneoption", value:fo.v,
                                        checked:jt.toru(isSelVal(fo.v)),
                                        onclick:mdfs("cmt.updateSongFrequency",
                                                     "event")}],
                             ["label", {fo:"tunerad" + fo.v}, fo.t]]])],
                      ["div", {id:"tuningdetdiv"}, 
                       ["div", {id:"tunedetdiv"},
                        [["div", {id:"prevplaydupesdiv"},
                          prevPlayAndDupesHTML()],
                         ["div", {id:"playcountdiv"},
                          "Digger plays: " + stat.song.pc],
                         ["div", {id:"genresdiv"}, genreDispHTML()],
                         ["div", {id:"songurldiv"},
                          "Source: " + stat.song.path],
                         ["div", {id:"albtireddiv"}]]]]]]);
                setTimeout(showTiredAlbumButton, 500);
                return html; }); },
        updateSongFrequency: function (event) {
            var rbv = event.target.value;
            if(!isSubcatValue(rbv, stat.song.fq)) {  //value changed
                ost.song.fq = rbv;    //for local reference
                stat.song.fq = rbv;   //for updated song save
                showTiredAlbumButton();
                mgrs.cmt.updateIndicators();
                noteSongModified(); } },
        reflectChangedSongFrequency: function (ignore /*fld*/, val) {
            const button = jt.byId("tunerad" + tuningDisplayMode(val));
            if(button && !button.checked) {
                //stat.song.fq already updated, just reflecting the value
                showTiredAlbumButton();
                mgrs.cmt.updateIndicators();
                button.checked = true; } },
        snoozeAllSongsOnAlbum: function () {
            const divid = "albtiredconfdiv";
            const div = jt.byId(divid);
            if(div.innerHTML) {  //already displayed, toggle off
                div.innerHTML = "";
                return; }
            jt.out(divid, jt.tac2html(
                ["Mark all songs tired on \"" + ost.song.ab + "\"?",
                 ["div", {id:"abactoptsdiv"},
                  ["button", {type:"button",
                              onclick:mdfs("cmt.snoozeAlbumSongsProc")},
                   "Update Songs"]]])); },
        snoozeAlbumSongsProc: function () {
            jt.out("abactoptsdiv", "Processing...");
            app.svc.fetchSongs(
                function (songs) {
                    var updsongs = [];
                    jt.out("abactoptsdiv", "Marking...");
                    const locmod = new Date().toISOString();
                    Object.values(songs).forEach(function (s) {
                        if(s.ab === ost.song.ab && s.ar === ost.song.ar) {
                            if(subcats.B.indexOf(s.fq) < 0) {  //not tired
                                s.fq = "B";
                                s.locmod = locmod;
                                updsongs.push(s); } } });
                    if(!updsongs.length) {
                        jt.out("abactoptsdiv", "All songs marked as tired.");
                        return; }
                    jt.out("abactoptsdiv", "Updating " + updsongs.length +
                           " songs...");
                    app.svc.dispatch("gen", "updateMultipleSongs", updsongs,
                        function (upds) {
                            app.deck.dispatch("alb", "noteUpdatedAlbumSongs",
                                              upds);
                            jt.out("abactoptsdiv", String(updsongs.length) +
                                   " songs updated."); },
                        function (code, errtxt) {
                            jt.out("abactoptsdiv", "Song update failed " +
                                   code + ": " + errtxt); }); },
                function (code, errtxt) {
                    jt.out("abactoptsdiv", "Song retrieval failed " + code +
                           ": " + errtxt); }); },
        bumpTired: function (song) {  //general utility
            var tfqidx = subcats.B.indexOf(stat.song.fq);
            if(tfqidx < 0) {  //not currently marked as tired
                song.fq = "B";
                return true; }
            if(tfqidx >= 0 && tfqidx < subcats.B.length - 1) {
                song.fq = subcats.B[tfqidx + 1];
                return true; }
            return false; },
        bumpCurrentIfTired: function () {
            if(stat.song && stat.song.fq) {  //already marked as tired
                if(mgrs.cmt.bumpTired(stat.song)) {  //made tireder
                    noteSongModified(); } } },
        toggleOtherDisplay: function (togstate, mode, dispf) {
            togDialog(togstate, mode, dispf); },
        buttonHandler: function (bid) {
            jt.byId(bid).disabled = true;
            ost.btdonef = function () { jt.byId(bid).disabled = false; };
            buttons[bid].handler(); },
        resetDisplay: function (caller) {
            jt.log("cmt.resetDisplay called from " + (caller || "Unknown"));
            togDialog("off");
            mgrs.cmt.updateIndicators(); }
    };  //end mgrs.cmt returned functions
    }());


    //handle sleep display setup and state management.  On mobile platforms,
    //the sleep marker song is sent with the next requestStatusUpdate, and
    //the sleep callback is called from notePlaybackStatus.  On IOS, sleep
    //kicks in after the player has moved to the start of the next song.  On
    //playback end (e.g. just played the last song on an album) playback is
    //paused and the player rewinds to the beginning of that song.  Those
    //two situations are indistinguishable for presenting a sleep overlay
    //display, so even though playback will stop if sleeping after the 2nd
    //to last album song, there is no "Sleeping" displayed in that case.
    mgrs.slp = (function () {
        const srcimgs = {active:"img/sleepactive.png",
                         inactive:"img/sleep.png"};
        const sst = {ctrl:"off", count:0};
        const dsmt = "DIGGERSLEEPMARKER";  //text for sleep song marker object
        const ssmo = {aid:"101", path:dsmt, ti:dsmt, ar:dsmt, ab:dsmt,
                      el:49, al:49, kws:"", rv:5, fq:"R", nt:"", pc:0};
        function clearOverlayMessage () {
            jt.out("mediaoverlaydiv", "");
            jt.byId("mediaoverlaydiv").style.display = "none"; }
        function noteExternalResume () {
            mgrs.slp.reset("slp.noteExternalResume");
            jt.out("mediaoverlaydiv", jt.tac2html(
                ["Sleep resumed by external control.",
                 ["div", {cla:"dlgbuttonsdiv"},
                  ["button", {type:"button", 
                              onclick:mdfs("slp.reset",  //already playing...
                                           "noteExternalResume ok button")},
                   "Ok"]]]));
            jt.byId("mediaoverlaydiv").style.display = "block"; }
        function updateSleepActiveCheckbox () {
            const sleepcb = jt.byId("sleepactivecb");
            if(sleepcb) {
                sleepcb.checked = false; } }
        function updateSleepCountInput () {
            const sci = jt.byId("sleepcountsel");
            if(sci) {
                sci.value = String(sst.count);  //Make "0" show up in display
                jt.log("setSleepCountInput: " + String(sst.count));
                jt.out("sleepcntssdiv", sst.count || ""); } }
        function updateSleepDisplayIndicator () {
            const togimg = jt.byId("togsleepimg");
            if(!togimg) {  //verify the UI is still intact, just in case
                return jt.log("updateSleepDisplayIndicator: no togimg"); }
            switch(sst.ctrl) {
            case "off": togimg.src = srcimgs.inactive; break;
            case "on": togimg.src = srcimgs.active; break;
            case "transitioning":
                if(togimg.src.endsWith(srcimgs.inactive)) {  //toggle the image
                    //jt.log("mgrs.slp blinking togsleepimg active");
                    togimg.src = srcimgs.active; }
                else {
                    //jt.log("mgrs.slp blinking togsleepimg inactive");
                    togimg.src = srcimgs.inactive; }
                setTimeout(updateSleepDisplayIndicator, 200);
                break;
            default: jt.log("updateSleepDisplayIndicator unknown state: " +
                            sst.ctrl); } }
    return {
        sleepMarkerSong: function () { return ssmo; },
        toggleSleepDisplay: function (close) {  //show or hide the sleep details
            if(close || jt.byId("sleepdiv").style.display !== "none") {
                jt.byId("sleepdiv").style.display = "none";
                return; }
            if(sst.ctrl === "on") {  //sleep active and stabilized, allow mod
                jt.byId("sleepdiv").style.display = "block"; }
            if(!jt.byId("sleepactivecb")) {  //init the sleep controls
                const svos = [0, 1, 2, 3, 4, 5, 6, 7, 8];
                jt.out("sleepdiv", jt.tac2html(
                    [["a", {href:"#close",
                            onclick:mdfs("slp.toggleSleepDisplay", "close")},
                      "Sleep after "],
                     ["select", {id:"sleepcountsel", title:"Sleep counter",
                                 onchange:mdfs("slp.readSleepCountInput",
                                               "close")},
                      svos.map((v) =>
                          ["option", {value:v,
                                      selected:jt.toru(v === sst.count)},
                           String(v)])],
                     ["a", {href:"#close",
                            onclick:mdfs("slp.toggleSleepDisplay", "close")},
                      " more "],
                     ["input", {type:"checkbox", id:"sleepactivecb",
                                checked:"checked",  //switch on when opening
                                onclick:mdfs("slp.togsleepcb", "event")}]]));
                mgrs.slp.togsleepcb(); }  //reflect checkbox checked image
            else {  //sleepactivecb available
                if(sst.ctrl === "off") {  //need to reactivate
                    jt.byId("sleepactivecb").checked = true;
                    mgrs.slp.togsleepcb(); } } },
        readSleepCountInput: function (close) {
            const sci = jt.byId("sleepcountsel");
            if(sci) {
                sst.count = parseInt(sci.value, 10);  //want int for math
                jt.log("readSleepCountInput: " + String(sst.count));
                jt.out("sleepcntssdiv", sst.count || ""); }
            if(close) {
                mgrs.slp.toggleSleepDisplay(close); } },
        reduceSleepCount: function (numplayed) {  //reduce the sleep countdown
            if(sst.count <= 0) {
                //jt.log("reduceSleepCount sst.count already at zero.");
                sst.count = 0;
                return; }
            jt.log("reduceSleepCount " + sst.count + " by " + numplayed);
            sst.count -= numplayed;
            sst.count = Math.max(sst.count, 0);
            updateSleepCountInput();
            jt.out("sleepcntssdiv", sst.count || ""); },
        togsleepcb: function () {
            const prevctrl = sst.ctrl;
            sst.ctrl = ((jt.byId("sleepactivecb").checked)? "on" : "off");
            const cmd = ((sst.ctrl === "on")? "sleep" : "nevermind");
            sst.ctrl = "transitioning";
            updateSleepDisplayIndicator();  //starts blink if needed
            const cap = mgrs.aud.currentAudioPlayer();
            mgrs[cap].sleep(sst.count, cmd, function (retcmd) {
                if(retcmd !== cmd) {
                    jt.log("togsleepcb " + cmd + " returned " + retcmd);
                    sst.ctrl = prevctrl; }  //revert state
                else {  //command went through
                    sst.ctrl = ((retcmd === "sleep")? "on" : "off"); }
                updateSleepDisplayIndicator();  //end blink
                mgrs.slp.readSleepCountInput("close"); }); },
        shouldSleepNow: function () {  //called prior to playing next song
            mgrs.slp.toggleSleepDisplay("close");
            clearOverlayMessage();
            if(sst.ctrl !== "on") {  //"off" or "transitioning" === not active
                return false; }
            if(sst.count > 0) {  //more songs to play before sleep
                sst.count -= 1;
                updateSleepCountInput();
                return false; }
            return mgrs.slp.startSleep("Sleeping...", "shouldSleepNow"); },
        startSleep: function (msg, logreason) {
            if(!mgrs.slp.isNowSleeping()) {
                jt.log("slp.startSleep reason: " + logreason); }
            mgrs.cmt.resetDisplay("slp.startSleep");
            mgrs.cmt.toggleOtherDisplay("on", "sleeping", function () {
                return jt.tac2html(
                    ["div", {id:"nowsleepingresumediv", cla:"togdlgabspos"},
                     [msg, 
                      "&nbsp;",
                      ["a", {href:"#playnext", id:"sleepresumelink",
                             onclick:mdfs("slp.resume")},
                       "Resume playback"]]]); });
            //resuming with the space bar can cause conflict with play/pause
            //hook for the player, leaving playback stopped.  If that causes
            //an error, or the spacebarhook is not reset, hitting the space
            //bar again will go to the next song.  Require clicking the
            //resume link.
            //app.spacebarhookfunc = mgrs.slp.resume;
            return true; },
        isNowSleeping: function () {
            const odiv = jt.byId("mediaoverlaydiv");
            return (odiv && odiv.style.display === "block" &&
                    jt.byId("sleepresumelink")); },
        reset: function (reason) {
            jt.log("slp.reset reason: " + reason);
            sst.ctrl = "off";
            sst.count = 0;
            clearOverlayMessage();
            updateSleepActiveCheckbox();
            updateSleepCountInput();
            updateSleepDisplayIndicator();
            mgrs.slp.toggleSleepDisplay("close"); },
        resume: function () {
            mgrs.slp.reset("slp.resume");
            const cap = mgrs.aud.currentAudioPlayer();
            jt.log("slp.resume calling " + cap + ".sleep cancel");
            mgrs[cap].sleep(1000, "cancel"); },
        limitToSleepQueueMax: function (qm) {  //queue max
            if(sst.ctrl !== "on") {
                return qm; }
            const queuelen = Math.min(sst.count, qm);
            //jt.log("sleep active, queue limited to " + queuelen);
            return queuelen; },
        updateStatusInfo: function (state/*, pos, dur, path*/) {
            if(state === "ended" && sst.ctrl === "on") {
                if(app.deck.endedDueToSleep()) {  //have songs to resume with
                    mgrs.slp.startSleep("Sleeping...", "deck ended"); }
                //see mgr comment on IOS sleep after 2nd to last song
                else {  //nothing to resume playback with, clear sleep state.
                    mgrs.slp.reset("slp.updateStatusInfo normal end"); } }
            else if(state === "playing") {
                const odiv = jt.byId("mediaoverlaydiv");
                if(odiv && odiv.style.display === "block") {
                    noteExternalResume(); } } }
    };  //end mgrs.slp returned functions
    }());


    //general top level processing functions
    mgrs.gen = (function () {
        const uichg = [  //fields changeable in the player UI with update funcs
            {fld:"fq", uf:function (val) {
                mgrs.cmt.reflectChangedSongFrequency("fq", val); }},
            {fld:"al", uf:function (val) {
                mgrs.pan.updateControl("al", val); }},
            {fld:"el", uf:function (val) {
                mgrs.pan.updateControl("el", val); }},
            {fld:"kws", uf:function (val) {
                stat.song.kws = val;
                mgrs.kwd.rebuildToggles(); }},
            {fld:"rv", uf:mgrs.rat.adjustPositionFromRating},
            {fld:"nt", uf:function (val) {
                stat.song.nt = val;
                mgrs.cmt.resetDisplay("gen"); }}];
    return {
        initializeDisplay: function () {
            jt.log("player.gen.initializeDisplay");
            stat = {status:"", song:null};
            ctrls = {};
            mgrs.aud.init();  //may redirect to authenticate web player
            jt.out("panplaydiv", jt.tac2html(
                [["div", {id:"panplaymousingdiv"},
                  [["div", {id:"mediadiv"}, "Nothing to play yet"],
                   ["div", {id:"mediaoverlaydiv", style:"display:none"}],
                   ["div", {id:"impressiondiv"},
                    [["div", {id:"panpotsdiv"},
                      [["div", {cla:"pandiv", id:"alpandiv"}],
                       ["div", {cla:"pandiv", id:"elpandiv"}]]],
                     ["div", {id:"keysratdiv"},
                      [["div", {id:"kwdsdiv"}],
                       ["div", {id:"starsnbuttonsdiv"},
                        [["div", {id:"rvdiv"}],
                         ["div", {id:"playerbuttonsdiv"},
                          [["div", {cla:"playerbdiv"},
                            ["a", {id:"togcommentlink", href:"#togglecomment",
                                   title:"Comment",
                                   onclick:mdfs("cmt.toggleCommentDisplay")},
                             ["img", {id:"togcommentimg", cla:"plbimg inv",
                                      src:"img/comment.png"}]]],
                           ["div", {cla:"playerbdiv"},
                            ["a", {id:"togsharelink", href:"#share",
                                   title:"Share",
                                   onclick:mdfs("cmt.toggleSongShare")},
                             ["img", {id:"togshareimg", cla:"plbimg inv",
                                      src:"img/share.png"}]]],
                           ["div", {cla:"playerbdiv"},
                            [["div", {id:"sleepcntssdiv"}],
                             ["a", {id:"togsleeplink", href:"#sleepafter",
                                    title:"Sleep",
                                    onclick:mdfs("slp.toggleSleepDisplay")},
                              ["img", {id:"togsleepimg", cla:"plbimg inv",
                                       src:"img/sleep.png"}]]]]]],
                         ["div", {id:"sleepdiv", style:"display:none"}]]]]],
                     ["div", {id:"pandragcontdiv"},
                      [["div", {id:"alpandragdiv", cla:"pandragdiv"}],
                       ["div", {id:"elpandragdiv", cla:"pandragdiv"}]]]]]]],
                 ["div", {id:"panplayoverlaydiv", style:"display:none",
                          onclick:mdfs("cmt.closeOverlay", "event")}]]));
            mgrs.pan.makePanControls();
            //toggle controls are rebuilt after data loads, not needed yet
            mgrs.rat.makeRatingValueControl(); },
        next: function () {
            saveSongDataIfModified("ignoreUpdatedSongDataReturn");
            //player calls contf if is ready, otherwise contf is ignored and it
            //is up to the player to start playback after it is ready.
            mgrs.aud.verifyPlayer(function () {
                mgrs.cmt.toggleTuningOpts("off");
                mgrs.cmt.toggleCommentDisplay("off");
                mgrs.cmt.toggleSongShare("off");
                stat.status = "";
                if(!mgrs.slp.shouldSleepNow()) {
                    const ns = app.deck.getNextSong();
                    if(!ns) { //end of album or nothing left on deck
                        mgrs.slp.reset("player.gen.next no more songs left");
                        return; }  //no next song to play, so just stop
                    stat.stale = stat.song;
                    stat.song = ns;
                    mgrs.gen.logCurrentlyPlaying("player.gen.next");
                    mgrs.cmt.updateIndicators();
                    mgrs.aud.playAudio(); } }); },
        illuminateAndFade: function (divid, ms) {
            var elem = jt.byId(divid);
            elem.style.backgroundColor = "#FFAB00";
            elem.classList.add("bgtransitionfade");
            setTimeout(function () {
                elem.style.backgroundColor = "transparent"; }, ms);
            setTimeout(function () {
                elem.classList.remove("bgtransitionfade"); }, ms + 750); },
        skip: function () {
            var st = Date.now();
            if(stat.skiptime && ((st - stat.skiptime) < 7000)) {
                //On a phone, the skip button can be unresponsive for several
                //seconds if the UI is setting up binding to the music playback
                //service.  Avoid accidental double skip from repress.
                return; }
            mgrs.gen.illuminateAndFade("nextsongdiv", 5000);
            stat.skiptime = st;
            if(mgrs.slp.isNowSleeping()) {
                jt.log("skip calling slp.resume");
                mgrs.slp.resume(); }
            else {
                jt.log("noting skip and calling next");
                mgrs.cmt.bumpCurrentIfTired();  //bump fq value if tired
                stat.song.pd = "skipped";
                mgrs.gen.next(); } },
        deckUpdated: function (/*mgrname*/) {
            mgrs.aud.checkIfPlaying(function (pinfo) {
                //mgrname is now out of scope and undefined at least on Android
                var ssmn = app.deck.dispatch("gen", "getSongSeqMgrName");
                if(!stat.song && !pinfo.path && ssmn === "ddc") {
                    jt.log("player.deckUpdated calling next to start music");
                    app.player.next(); } }); },
        logCurrentlyPlaying: function (prefix) {
            //mobile player updates when playing new song, no separate call.
            prefix = prefix || "";
            if(prefix) { prefix += " "; }
            if(stat && stat.song) {  //iOS has opaque paths, so include ti
                jt.log(prefix + "logCurrentlyPlaying: " + stat.song.path +
                       " " + stat.song.ti); }
            else {
                jt.log(prefix + "logCurrentlyPlaying: no song"); } },
        listChangedFields: function (sa, sb) {
            const chg = uichg.filter((uic) => sa[uic.fld] !== sb[uic.fld]);
            const chgvals = chg.map((chg) => ({fld:chg.fld, uf:chg.uf,
                                               val:sa[chg.fld]}));
            return chgvals; }
    }; //end mgrs.gen returned functions
    }());


return {
    init: mgrs.gen.initializeDisplay,
    deckUpdated: mgrs.gen.deckUpdated,
    next: mgrs.gen.next,
    skip: mgrs.gen.skip,
    song: function () { return stat.song; },
    logCurrentlyPlaying: mgrs.gen.logCurrentlyPlaying,
    playerr: function (path) { return playerrs[path]; },
    noteprevplay: function (tstamp) { stat.prevPlayed = tstamp; },
    setState: mgrs.mob.setState,
    dispatch: function (mgrname, fname, ...args) {
        try {
            return mgrs[mgrname][fname].apply(app.player, args);
        } catch(e) {
            jt.log("player.dispatch " + mgrname + "." + fname + " " + e +
                   " " + new Error("stack trace").stack);
        } }
};  //end of returned functions
}());
