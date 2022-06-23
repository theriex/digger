/*global app, jt, Spotify, console */
/*jslint browser, white, for, long, unordered */

app.player = (function () {
    "use strict";

    var stat = null;   //initializeDisplay sets initial values for state vars
    var ctrls = null;
    var playerrs = {};


    //This could be a call where the song is no longer displayed, or an
    //interim save triggered from ongoing user interaction.  In the first
    //case there are no relevant UI elements left, in the second case the
    //user may have continued to interact with the display while the save
    //was ongoing and the UI elements should not be disturbed.  Even if the
    //save fails, the UI state cannot be touched since there is nothing to
    //revert back to.  A save failure basically never happens for local
    //storage, and for web it would most likely be a well timed network
    //hiccup or a server failure.  Not much to be done.
    function saveSongDataIfModified (ignoreupdate) {
        if(!stat.songModified) { return; }  //save not needed
        if(!ignoreupdate) {  //saving the working song
            //optimistically mark as saved.  If more changes there will
            //be another save call.
            stat.songModified = false; }
        app.svc.updateSong(stat.song,
            function (updsong) {
                jt.out("modindspan", "");
                jt.log("song data updated " + JSON.stringify(updsong)); },
            function (code, errtxt) {
                stat.songModified = true;  //hopefully next try will work
                jt.err("song save failed " + code + ": " + errtxt); });
    }


    function noteSongModified () {
        if(!stat.song) { return; }
        stat.songModified = true;
        jt.out("modindspan", "mod");
        if(stat.modtimer) {
            clearTimeout(stat.modtimer); }
        stat.modtimer = setTimeout(saveSongDataIfModified, 2200);
    }


    function makeRatingValueControl () {
        jt.out("rvdiv", jt.tac2html(
            ["div", {cla:"ratstarscontainerdiv", id:"playerstarsdiv"},
             ["div", {cla:"ratstarsanchordiv", id:"playerstarsanchordiv"},
              [["div", {cla:"ratstarbgdiv"},
                ["img", {cla:"starsimg", src:"img/stars18ptCg.png"}]],
               ["div", {cla:"ratstarseldiv", id:"playerstarseldiv"},
                ["img", {cla:"starsimg", src:"img/stars18ptC.png"}]],
               ["div", {id:"ratstardragdiv"}]]]]));
        ctrls.rat = {stat:{pointingActive:false, maxxlim:85, roundpcnt:5},
                     posf:function (x, ignore /*y*/, pa) {
                         //jt.log("ctrls.rat.posf x: " + x);
                         const nrv = Math.round((x / 17) * 2);
                         const psw = Math.round((nrv * 17) / 2);
                         jt.byId("playerstarseldiv").style.width = psw + "px";
                         if(stat.song && pa) {
                             const cv = stat.song.rv;
                             stat.song.rv = nrv;
                             if(cv !== stat.song.rv) {
                                 noteSongModified(); } } } };
        app.filter.movelisten("ratstardragdiv", ctrls.rat.stat,
                              ctrls.rat.posf);
        ctrls.rat.posf(0);  //no stars until set or changed.
    }


    const mgrs = {};  //general container for managers
    function mdfs (mgrfname, ...args) {  //module dispatch function string
        return app.dfs("player", mgrfname, args);
    }


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
            app.top.dispatch("locla", "libimpNeeded"); }
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
        function tickf () {
            if(!prog.tickcount) {
                prog.svco.refreshPlayState(); }
            prog.pos = Math.min(prog.pos + 1000, prog.dur);  //tick 1 sec fwd
            mgrs.plui.updatePosIndicator();  //reflect new position
            prog.tickcount = (prog.tickcount + 1) % 4;
            if(jt.byId("pluidiv")) { //interface still available
                const rems = prog.dur - prog.pos;
                if(state === "playing" && prog.dur && rems < 1200) {
                    prog.ticker = null;
                    setTimeout(app.player.next, rems); }
                else {
                    prog.ticker = setTimeout(tickf, 1000); } } }
    return {
        reflectPlaybackState: function (pbs, skiptick) {
            if(pbs === "paused") {
                if(prog.ticker) {
                    clearTimeout(prog.ticker);
                    prog.ticker = null; }
                bimg = "img/play.png"; }
            else {  //playing
                if(!prog.ticker && !skiptick) {
                    prog.tickcount = 1;
                    mgrs.plui.updatePosIndicator();  //reflect position
                    prog.ticker = setTimeout(tickf, 1000); }
                bimg = "img/pause.png"; }
            jt.byId("pluibimg").src = bimg; },
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
        updatePosIndicator: function () {
            //update progress bar
            var prw = 0;
            if(prog.dur) {
                prw = Math.round((prog.pos / prog.dur) * prog.w); }
            jt.byId("pluiprogdiv").style.width = prw + "px";
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
        updateDisplay: function (svco, pbstate, position, duration) {
            prog.svco = svco;
            prog.pos = position;
            prog.dur = duration;
            if(!jt.byId("pluidiv")) { //interface not set up yet
                mgrs.plui.initInterface(); }
            app.spacebarhookfunc = mgrs.plui.togglePlaybackState;
            //ticker may have stopped if playing new song
            if(state !== pbstate || (state === "playing" && !prog.ticker)) {
                jt.log("player.plui.updateDisplay reflecting " + pbstate);
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
            mgrs.tun.toggleTuningOpts("off");
            mgrs.cmt.toggleCommentDisplay("off");
            mgrs.cmt.togSongShareDialog("off");
            const st = wpso.track_window.current_track;
            const tid = "z:" + st.id;
            stat.song = {dsId:"spotify" + tid, ti:st.name,
                         ar:st.artists[0].name, ab:st.album.name,
                         spdn:(st.disc_number || 1),
                         sptn:(st.track_number || 1), spid:tid,
                         srcid:1, //reserved value for Spotify sourced Songs
                         el:49, al:49, kws:"", rv:5, fq:"N", nt:"", pc:1,
                         lp:new Date().toISOString()};
            app.svc.updateSong(stat.song, function (updsong) {
                app.svc.dispatch("web", "addSongsToPool", [updsong]);
                app.deck.dispatch("hst", "noteSongPlayed", updsong);
                mgrs.aud.updateSongDisplay();
                app.deck.dispatch("gen", "redisplayCurrentSection"); });
            mgrs.aud.reflectPlaying(); },
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
    return {
        ////calls from svc.mp
        notePlaybackStatus: function (status) {
            pbi.state = status.state;  //"playing" or "paused"
            pbi.pos = status.pos;  //current play position ms
            pbi.dur = status.dur || pbi.dur;  //song duration if provided
            mgrs.plui.updateDisplay(mgrs.mob, pbi.state, pbi.pos, pbi.dur);
            debouncing = false; },
        handlePlayFailure: function (errstat, errtxt) {
            //mobile does not have unsupported media types, so all media should
            //play unless a file got deleted or the media service is broken bad.
            //the audio player display is dead or not up yet.
            jt.out("mediadiv", jt.tac2html(
                [errstat + ": " + errtxt + "&nbsp; ", 
                 ["a", {href:"#rebuild",
                        onclick:app.dfs("svc", "loc.loadLibrary",
                                        ["topdlgdiv", "rebuild"])},
                  "Rebuild Library"]])); },
        ////calls from mgrs.plui
        refreshPlayState: function () {  //calls back to notePlaybackStatus
            //use timeout to yield to plui tickf processing
            setTimeout(function () {
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
        ////calls from mgrs.aud
        playSong: function (ps) {
            pbi = {song:ps, pos:0, dur:ps.duration || 0, state:"playing"};
            app.svc.dispatch("mp", "playSong", ps.path);
            mgrs.mob.refreshPlayState(); },
        verifyPlayer: function (contf) {
            contf(); },  //nothing to do. plat/UI initialized as needed
        ////general funcs
        setState: function (rst) {
            stat.song = rst.song;
            pbi = {song:rst.song, pos:rst.pos, dur:rst.dur, state:rst.state};
            mgrs.aud.verifyPlayer(function () {
                mgrs.plui.updateDisplay(mgrs.mob, pbi.state, pbi.pos, pbi.dur);
                mgrs.aud.updateSongDisplay(); }); }
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
            default: cap = "loa"; } },
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
                           id:"tuneopta", onclick:mdfs("tun.toggleTuningOpts")},
                     ["img", {src:tunesrc, cla:"ptico", id:"tuneimg"}]],
                    ["a", {href:"#skip", title:"Skip To Next Song",
                           onclick:jt.fs("app.player.skip()")},
                     ["img", {src:"img/skip.png", cla:"ptico"}]]]],
                  app.deck.dispatch("sop", "songIdentHTML", stat.song)]])); },
        updateSongDisplay: function () {
            mgrs.kwd.rebuildToggles();
            mgrs.aud.updateSongTitleDisplay();
            mgrs.tun.resetClearedMetDat();
            mgrs.pan.updateControl("al", stat.song.al);
            mgrs.pan.updateControl("el", stat.song.el);
            stat.song.rv = stat.song.rv || 0;  //verify numeric value
            ctrls.rat.posf(Math.round((stat.song.rv * 17) / 2)); },
        reflectPlaying: function () {
            stat.status = "playing";
            jt.log("player.aud.reflectPlaying " + JSON.stringify(stat.song));
            mgrs.aud.updateSongDisplay();
            app.deck.dispatch("gen", "redisplayCurrentSection"); },
        playAudio: function () {
            stat.status = "playing";
            jt.log("player.aud.playAudio " + JSON.stringify(stat.song));
            mgrs.aud.verifyPlayer(function () {
                mgrs.aud.updateSongDisplay();
                mgrs[cap].playSong(stat.song); }); },
        verifyPlayer: function (contf) {
            if(!jt.byId("playerdiv")) {
                jt.out("mediadiv", jt.tac2html(
                    ["div", {id:"playerdiv"},
                     [["div", {id:"playertitle"}, "Starting"],
                      ["div", {id:"playertuningdiv"}],
                      ["div", {id:"audiodiv"}]]])); }
            mgrs[cap].verifyPlayer(contf); }
    };  //end mgrs.aud returned functions
    }());


    //handle the tuning fork actions and info display
    mgrs.tun = (function () {
        var fos = [{v:"P", t:"Playable"}, {v:"B", t:"Tired"},
                   {v:"R", t:"Don't Suggest"}];
        var subcats = {"P":["N",   //Newly added song
                            "P"],  //Playable
                       "B":["B",   //Back-burner, default 90 days between plays
                            "Z",   //Resting, default 180 days between plays
                            "O"],  //Overplayed, default 365 days between plays
                       "R":["R",   //Reference only, do not play by default
                            "I",   //Ignore, song is in an ignore folder
                            "D",   //Deleted, media file no longer available
                            "U"]}; //Unreadable, no metadata, corrupted etc.
    return {
        isSubcatValue: function (cat, val) {
            return (subcats[cat] && subcats[cat].indexOf(val) >= 0); },
        isSelVal: function (radval) {
            var songval = stat.song.fq || "P";
            if(songval === "0") { songval = "P"; }  //tolerate bad data init
            songval = songval.slice(0, 1);  //e.g treat "DP" as Deleted
            return mgrs.tun.isSubcatValue(radval, songval); },
        fqOptsHTML: function () {
            return fos.map((fo) =>
                ["div", {cla:"tuneoptiondiv"},
                 [["input", {type:"radio", id:"tunerad" + fo.v,
                             name:"tuneoption", value:fo.v,
                             checked:jt.toru(mgrs.tun.isSelVal(fo.v)),
                             onclick:mdfs("tun.updateSongFrequency", "event")}],
                  ["label", {fo:"tunerad" + fo.v}, fo.t]]]); },
        updateSongFrequency: function (event) {
            var rbv = event.target.value;
            if(!mgrs.tun.isSubcatValue(rbv, stat.song.fq)) {  //value changed
                stat.song.fq = rbv;
                noteSongModified(); } },
        toggleTuningOpts: function (togstate) {
            var ptitle = jt.byId("playertitle");
            var tdiv = jt.byId("playertuningdiv");
            var timg = jt.byId("tuneimg");
            if(!tdiv) { return; }  //nothing to do
            if(tdiv.innerHTML || !stat.song || togstate === "off") {
                tdiv.innerHTML = "";
                if(timg) { timg.src = "img/tunefork.png"; }
                ptitle.style.overflow = "hidden";
                ptitle.style.maxHeight = "18px";
                return; }
            if(timg) { timg.src = "img/tuneforkact.png"; }
            ptitle.style.overflow = "visible";
            ptitle.style.maxHeight = "none";
            tdiv.innerHTML = jt.tac2html(
                [["div", {id:"frequencyoptionsdiv"}, mgrs.tun.fqOptsHTML()],
                 ["div", {id:"tuningdetdiv"}, mgrs.tun.optDetailsHTML()]]); },
        chgMetDat: function (fld) {
            var val = jt.byId("tdet" + fld).value;
            //jt.log("Changing " + fld + " to " + val);
            stat.song[fld] = val;
            noteSongModified(); },
        resetClearedMetDat: function () {
            const sfs = ["ti", "ar", "ab"];
            sfs.forEach(function (sf) {
                var input = jt.byId("tdet" + sf);
                if(input && !input.value) {
                    input.value = stat.song[sf]; } }); },
        spotWrongC: function () {
            const trackdet = mgrs.spa.spotifyTrackDetails();
            //"From" line filled out and prepended on server
            const subj = "Bad spotify song mapping " + stat.song.spid;
            var body = "Song " + stat.song.dsId + "\n" +
                "  ti: " + stat.song.ti + "\n" +
                "  ar: " + stat.song.ar + "\n" +
                "  ab: " + stat.song.ab + "\n" +
                "is wrongly mapped to " + stat.song.spid + "\n" +
                "  title: " + trackdet.title + "\n" +
                "  artist: " + trackdet.artist + "\n" +
                "  album: " + trackdet.album + "\n" +
                "Check and respond by email \n";
            jt.out("spotdetactdiv", "Sending...");
            app.svc.dispatch("web", "postSupportRequest", subj, body,
                function () {
                    jt.out("spotdetactdiv", "Support notified." +
                           " Will be in touch by email."); },
                function (code, errtxt) {
                    jt.out("spotdetactdiv", code + ": " + errtxt); }); },
        spotWrongSong: function () {
            jt.out("spotdetactdiv", jt.tac2html(
                ["div", {id:"badspidconfdiv"},
                 ["Report bad song mapping to support@diggerhub.com?",
                  ["div", {cla:"dlgbuttonsdiv"},
                   [["button", {type:"button", onclick:mdfs("tun.spotDetails")},
                     "Cancel"],
                    ["button", {type:"button", onclick:mdfs("tun.spotWrongC")},
                     "Send"]]]]])); },
        spotDetails: function () {
            if(jt.byId("spotdetactdiv")) {  //toggle off
                return jt.out("tunedetwrkdiv", ""); }
            const spurl = "https://open.spotify.com/track/" +
                  stat.song.spid.slice(2);
            const trackdet = mgrs.spa.spotifyTrackDetails();
            jt.out("tunedetwrkdiv", jt.tac2html(
                [["table", {id:"tunedetwrktable"},
                  Object.entries(trackdet).map(function ([a, v]) {
                      return ["tr", {cla:"spotdettr"},
                              [["td", {cla:"spotdetattr"},
                                a.capitalize() + ":"],
                               ["td", {cla:"spotdetval"}, v]]]; })],
                 ["div", {id:"spotdetactdiv", cla:"dlgbuttonsdiv"},
                  [["span", {id:"spotwrongsongspan"},
                    ["a", {href:"#wrongsong", onclick:mdfs("tun.spotWrongSong"),
                           title:"Report bad song mapping"},
                     "Report wrong song"]],
                   " &nbsp; ",
                   ["span", {id:"spotopentrackspan"},
                    ["a", {href:"openspotify", title:"Open in Spotify",
                           onclick:jt.fs("window.open('" + spurl + "')")},
                     "Open in Spotify"]]]]])); },
        spidlink: function () {
            return jt.tac2html(
                ["a", {href:"#spotifydetails", onclick:mdfs("tun.spotDetails"),
                       title:"Show Spotify Track Details"},
                 stat.song.spid.slice(2)]); },
        optDetailsHTML: function () {
            var lastPlayed = "Never";
            if(stat.prevPlayed) {
                lastPlayed = jt.tz2human(stat.prevPlayed); }
            const flds = [{a:"Last Played", v:lastPlayed},
                          {a:"Title", v:"ti", e:true},
                          {a:"Artist", v:"ar", e:true},
                          {a:"Album", v:"ab", e:true}];
            switch(app.svc.dispatch("gen", "plat", "hdm")) {
            case "web": flds.push({a:"Spotify", v:mgrs.tun.spidlink()}); break;
            default: flds.push({a:"File", v:stat.song.path}); }
            flds.forEach(function (fld) {
                if(fld.e) {
                    fld.v = ["input", {type:"text", id:"tdet" + fld.v,
                                       oninput:mdfs("tun.chgMetDat", fld.v),
                                       value:jt.ndq(stat.song[fld.v])}]; } });
            return jt.tac2html([["table", flds.map((fld) =>
                ["tr", {cla:"tuneoptdettr"},
                 [["td", {cla:"tuneoptdetattr"}, fld.a + ": "],
                  ["td", {cla:"tuneoptdetval"}, fld.v]]])],
                ["div", {id:"tunedetwrkdiv"}]]); },
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
                if(mgrs.tun.bumpTired(stat.song)) {  //made tireder
                    noteSongModified(); } } }
    };  //end of mgrs.tun returned functions
    }());


    //handle the pan controls for energy and approachability
    mgrs.pan = (function () {
        const anglemax = 145;  //max knob rotation
        const drfo = 56;  //drag radius from origin (< drgdiv / 2: 57)
        const ptbr = 44 + 28;  //polar tracking border radius (outer edge)
        const ptir = 12;   //polar tracking inner border radius
    return {
        balanceLabels: function () {
            const ids = ["elpanlld", "elpanrld", "alpanlld", "alpanrld"];
            const els = ids.map((i) => jt.byId(i));
            const wds = els.map((e) => e? e.offsetWidth : 0);
            const mw = Math.max.apply(null, wds);
            els.forEach(function (e) {
                if(e) {
                    e.style.width = mw + "px"; } }); },
        packControlWidthwise: function (id) {
            mgrs.pan.balanceLabels();
            const pk = {leftlab:{elem:jt.byId(id + "panlld")},
                        rightlab:{elem:jt.byId(id + "panrld")},
                        panbg:{elem:jt.byId(id + "panbgdiv")},
                        panface:{elem:jt.byId(id + "panfacediv")}};
            Object.keys(pk).forEach(function (key) {
                pk[key].bbox = pk[key].elem.getBoundingClientRect(); });
            const left = 8 + pk.leftlab.bbox.width;
            pk.panbg.elem.style.left = left + "px";
            pk.panface.elem.style.left = left + "px";
            ctrls[id].width = left + 44 + pk.rightlab.bbox.width + 5;
            const pds = [jt.byId(id + "pancontdiv"), jt.byId(id + "pandiv"),
                         jt.byId(id + "pandragdiv")];
            pds.forEach(function (panel) {
                panel.style.width = ctrls[id].width + "px";
                panel.style.height = "40px"; });
            //jt.log(id + "pandragdiv width: " + ctrls[id].width);
            ctrls[id].knog = {x:pk.panbg.elem.offsetLeft + 21, //viz elem calc
                              y:Math.floor(ctrls[id].width / 2) + 2}; },
        positionDragOverlay: function (id) {
            const pk = {pan:jt.byId(id + "pandiv"),
                        drag:jt.byId(id + "pandragdiv")};
            const dragdims = {top:0,  //relative to impressiondiv
                              left:pk.pan.offsetLeft,
                              width:pk.pan.offsetWidth,
                              height:pk.pan.offsetHeight};
            Object.entries(dragdims).forEach(function ([k, v]) {
                pk.drag.style[k] = v + "px"; }); },
        adjustBoundaries: function (di, expanded) {
            if(expanded === "expanded") {
                // di.drgdiv.style.backgroundColor = "#ffab00";
                // di.drgdiv.style.opacity = 0.3;
                // di.drgbo.style.backgroundColor = "#ff0000";
                // di.drgbo.style.opacity = 0.8;
                di.drgbo.style.top = (di.knoy + di.tlift - (ptbr / 2)) + "px";
                di.drgbo.style.left = (di.knox - (ptbr / 2)) + "px";
                di.drgbo.style.height = ptbr + "px";
                di.drgbo.style.width = ptbr + "px";
                // di.drgbi.style.backgroundColor = "#0000ff";
                // di.drgbi.style.opacity = 0.8;
                di.drgbi.style.top = (di.knoy + di.tlift - (ptir / 3)) + "px";
                di.drgbi.style.left = (di.knox - (ptir / 2)) + "px";
                di.drgbi.style.height = ptir + "px";
                di.drgbi.style.width = ptir + "px"; }
            else {  //"contracted"
                // di.drgdiv.style.backgroundColor = "";
                // di.drgbo.style.backgroundColor = "";
                // di.drgbi.style.backgroundColor = "";
                di.drgbo.style.top = "0px";
                di.drgbo.style.height = "10px";
                di.drgbi.style.top = "0px";
                di.drgbi.style.height = "5px"; } },
        logOffsets: function (div) {
            jt.log(div.id + " t:" + div.offsetTop + ", l:" + div.offsetLeft +
                   ", w:" + div.offsetWidth + ", h:" + div.offsetHeight); },
        vertiExpandOk: function (id, x, y) {  //expand|contract vert drag div
            var pc = ctrls[id];    //pan control
            var drgdiv = jt.byId(id + "pandragdiv");
            if(pc.pointingActive && !pc.vexp) {  //expand the div
                pc.maxxlim = pc.width;  //width from packControlWidthwise
                pc.maxylim = pc.width;  //make square, then adjust top offset
                pc.toplift = Math.round((pc.maxylim - 40) / -2);
                drgdiv.style.height = pc.maxylim + "px";
                drgdiv.style.top = pc.toplift + "px";
                pc.di = {  //drag info
                    knox:pc.knog.x,  //knob origin from packControlWidthwise
                    knoy:pc.knog.y,
                    tlift:pc.toplift,
                    ckox:x,  //click origin x.  Adjust y for height expansion
                    ckoy:(-1 * pc.toplift) + y,  //click origin y
                    ckv:stat.song[id],  //value at click origin
                    vt:"polar",  //for smooth movement of notch from near top
                    drgbo:jt.byId(id + "pandrgbodiv"),
                    drgbi:jt.byId(id + "pandrgbidiv"),
                    drgdiv:jt.byId(id + "pandragdiv")};
                mgrs.pan.adjustBoundaries(pc.di, "expanded");
                pc.vexp = true;
                return false; }  //do not process original raw coordinates
            if(!pc.pointingActive && pc.vexp) {  //contract the div
                drgdiv.style.height = "40px";  //reset height
                drgdiv.style.top = "0px";      //undo vertical offset
                mgrs.pan.adjustBoundaries(pc.di, "contracted");
                pc.vexp = false;
                return false; }  //do not process coordinates post close
            return pc.pointingActive; },
        trackExtentCoords: function (di, x, y) {
            di.elx = Math.min((di.elx || x), x);  //extent left x
            di.erx = Math.max((di.erx || x), x);  //extent right x
            di.emx = di.erx - di.elx;
            di.ety = Math.min((di.ety || y), y);  //extent top y
            di.eby = Math.max((di.eby || y), y);  //extent bottom y
            di.emy = di.eby - di.ety;
            const botop = Math.abs(di.drgdiv.offsetTop - di.drgbo.offsetTop);
            if(x < di.drgbo.offsetLeft ||
               x > di.drgbo.offsetLeft + di.drgbo.offsetWidth ||
               y < botop ||
               y > botop + di.drgbo.offsetHeight) {
                di.ptdis = "ptbrExceeded"; }
            const bitop = Math.abs(di.drgdiv.offsetTop - di.drgbi.offsetTop);
            if(x > di.drgbi.offsetLeft &&
               x < di.drgbi.offsetLeft + di.drgbi.offsetWidth &&
               y > bitop &&
               y < bitop + di.drgbi.offsetHeight) {
                di.ptdis = "originCross"; } },
        valueRangeConstrain: function (v) {
            v = Math.max(v, 0);
            v = Math.min(v, 99);
            return v; },
        calcDelta: function (di, x, y) {
            di.dx = x - di.ckox;  //delta x from click origin
            di.dy = di.ckoy - y;  //delta y from click origin
            mgrs.pan.trackExtentCoords(di, x, y);
            di.vx = di.ckv + Math.round(di.dx * 100 / drfo);  //new value by x
            di.vx = mgrs.pan.valueRangeConstrain(di.vx);
            di.vy = di.ckv + Math.round(di.dy * 100 / drfo);  //new value by y
            di.vy = mgrs.pan.valueRangeConstrain(di.vy);
            if(di.vt !== "polar" || di.ptdis) {  //not already tracking polar
                di.vt = "vertical";  //default to up|down movement tracking
                di.dv = di.vy;
                if(di.emx > di.emy) {  //more x movement
                    di.vt = "horizontal";
                    di.dv = di.vx; } } //go with side-to-side movement tracking
            //With y above knob origin, just use x/y tracking.  if y is
            //below the knob origin, and x is inside the knob edges, then they
            //are probably trying to actually turn the knob inwards.
            if(!di.ptdis &&  //not disabled from origin cross or outer boundary
               (di.vt === "polar" ||
                (y > di.knoy && ((x < di.knox && x > di.knox - 22) ||
                                 (x > di.knox && x < di.knox + 22))))) {
                di.vt = "polar";
                di.dv = mgrs.pan.calcPolar(di, x - di.knox, y - di.knoy); } },
        calcPolar: function (di, x, y) {  //x and y are diffs from origin
            di.r = Math.sqrt((x * x) + (y * y));  //radius by pythagorean
            di.th = Math.atan2(x, y) ;  //angle off top mid (invert axes)
            di.dg = Math.round(di.th * 180 / Math.PI);  //angle in degrees
            if(di.dg > 0) {  //find circle degree (0-360)
                di.cd = 180 + 180 - di.dg;
                if(di.cd >= 180 + anglemax) { di.cd = 360; } }
            else if(di.dg < 0) {
                di.cd = Math.abs(di.dg);
                if(di.cd <= 180 - anglemax) { di.cd = 0; } }
            else {  //at zero
                di.cd = 180; }
            const knobrange = 2 * anglemax;
            di.kr = Math.round(di.cd * knobrange / 360);
            return Math.round(di.kr * 100 / knobrange); },
        followClickDrag: function (id, x, y) {
            var pc = ctrls[id];  //the pan control being dragged
            pc.di = pc.di || {}; //drag info container for work vars
            if(mgrs.pan.vertiExpandOk(id, x, y)) {  //inits di with ckox, ckoy
                mgrs.pan.calcDelta(pc.di, x, y);
                // jt.out("commentdiv",
                //        //", ckox:" + pc.di.ckox + ", ckoy:" + pc.di.ckoy +
                //        //", ckv:" + pc.di.ckv +
                //        //", dx:" + pc.di.dx + ", dy:" + pc.di.dy +
                //        //", vx:" + pc.di.vx + ", vy:" + pc.di.vy +
                //        //", elx:" + pc.di.elx + ", erx:" + pc.di.erx +
                //        //", ewx:" + pc.di.ewx + ", ety:" + pc.di.ety +
                //        //", eby:" + pc.di.eby + ", ehy:" + pc.di.ehy +
                //        //", knox:" + pc.di.knox + ", knoy:" + pc.di.knoy +
                //        ", x:" + x + ", y:" + y +
                //        //", r:" + pc.di.r + ", th:" + pc.di.th +
                //        //", dg:" + pc.di.dg +
                //        ", ptdis:" + pc.di.ptdis +
                //        ", dv:" + pc.di.dv + ", " + pc.di.vt);
                mgrs.pan.updateControl(ctrls[id].fld, pc.di.dv); } },
        pressAndHold: function (id) {
            var pc = ctrls[id];
            var val = stat.song[id];
            if(pc.ci.trg === "left") {
                val -= 1; }
            else { //"right"
                val += 1; }
            val = mgrs.pan.valueRangeConstrain(val);
            mgrs.pan.updateControl(ctrls[id].fld, val);
            if(pc.ci.active && !pc.ci.tmo) {
                pc.ci.tmo = setTimeout(function () {
                    pc.ci.tmo = null;
                    mgrs.pan.pressAndHold(id); }, 100); } },
        handleClickMove: function (id, x, y, pa) {
            //jt.log("handleClickMove " + id + " " + x + "," + y + " " + pa);
            var pc = ctrls[id];   //the pan control being manipulated
            pc.ci = pc.ci || {};  //click info container for work vars
            if(!pc.ci.active && pa) {   //new movement, figure out what kind
                const kf = jt.byId(id + "panfacediv");
                if(x < kf.offsetLeft - 4) {
                    pc.ci.trg = "left"; }
                else if(x > kf.offsetLeft + kf.offsetWidth + 4) {
                    pc.ci.trg = "right"; }
                else {
                    pc.ci.trg = "knob"; } }
            pc.ci.active = pa;
            if(pc.ci.trg === "knob") {
                mgrs.pan.followClickDrag(id, x, y); }
            else if(pc.ci.active) {
                mgrs.pan.pressAndHold(id); } },
        activateControl: function (id) {
            ctrls[id].posf = function (x, y, pa) {
                mgrs.pan.handleClickMove(id, x, y, pa); };
            jt.on(jt.byId(id + "pandragdiv"), "dblclick", function (ignore) {
                mgrs.pan.updateControl(ctrls[id].fld, 49); });
            app.filter.movelisten(id + "pandragdiv",
                                  ctrls[id], ctrls[id].posf); },
        createControl: function (id, det) {
            var pc = {fld:det.fld, pn:det.pn, low:det.low, high:det.high,
                      pointingActive:false, roundpcnt:3};  //maxxlim set in pack
            ctrls[id] = pc;
            jt.out(id + "pandiv", jt.tac2html(
              ["div", {cla:"pancontdiv", id:pc.fld + "pancontdiv"},
               [["div", {cla:"panleftlabdiv", id:pc.fld + "panlld"}, pc.low],
                ["div", {cla:"panrightlabdiv", id:pc.fld + "panrld"}, pc.high],
                ["div", {cla:"panfacediv", id:pc.fld + "panfacediv"},
                 ["img", {cla:"panfaceimg", src:"img/panface.png"}]],
                ["div", {cla:"panbgdiv", id:pc.fld + "panbgdiv"},
                 ["img", {cla:"panbackimg", src:"img/panback.png"}]]]]));
            mgrs.pan.packControlWidthwise(id);
            mgrs.pan.positionDragOverlay(id);
            mgrs.pan.activateControl(id); },
        makePanControls: function () {
            var filters = app.filter.filters();
            mgrs.pan.createControl("el", filters[0]);
            mgrs.pan.createControl("al", filters[1]);
            mgrs.pan.updateControl("el");
            mgrs.pan.updateControl("al");
            jt.on("impressiondiv", "mousedown", function (event) {
                var okinids = ["kwdin", "commentta"];
                if(!event.target || okinids.indexOf(event.target.id) < 0) {
                    jt.evtend(event); } });  //ignore to avoid selecting ctrls
            jt.on("panplaymousingdiv", "mouseup", function (ignore /*event*/) {
                //do not capture this event or Safari audio will capture the
                //downclick on the position indicator and never let go.
                ctrls.el.pointingActive = false;
                ctrls.al.pointingActive = false;
                ctrls.rat.pointingActive = false; }); },
        hex2RGB: function (hexcolor) {
            var hcs = hexcolor.match(/\S\S/g);
            return {r:parseInt(hcs[0], 16),
                    g:parseInt(hcs[1], 16),
                    b:parseInt(hcs[2], 16)}; },
        updateTitle: function (id, songtitle) {
            var title = "Dial-In " + ctrls[id].pn;
            if(songtitle) {
                title += " for " + songtitle; }
            const div = jt.byId(id + "pandiv");
            if(div) {
                div.title = title; } },
        updateControl: function (id, val) {
            if(!val && val !== 0) {
                val = 49; }
            if(typeof val === "string") {
                val = parseInt(val, 10); }
            if(stat.song) {
                if(stat.song[id] !== val) {
                    stat.song[id] = val;
                    mgrs.pan.updateTitle(id, stat.song.ti);
                    noteSongModified(); } }
            //set knob face color from gradient
            const gra = app.filter.gradient();
            const grd = {f:mgrs.pan.hex2RGB(gra.left),
                         t:mgrs.pan.hex2RGB(gra.right)};
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
        toggleExpansion: function () {
            var togb = jt.byId("kwdexpb");
            if(togb.innerHTML === "+") {
                jt.out("newkwspan", jt.tac2html(
                    [["input", {type:"text", id:"kwdin", size:10, value:"",
                                placeholder:"new keyword"}],
                     ["button", {type:"button", id:"addkwb",
                                 onclick:mdfs("kwd.addNewKeyword")}, "+"]]));
                jt.out("extrakwspan", jt.tac2html(
                    kwdefs.filter((kd) => kd.pos <= 0).map((kd, i) =>
                        mgrs.kwd.makeToggleButton(kd, i + 4))));
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
            app.top.dispatch("kwd", "addKeyword", kwd, "playeradd"); }
    };  //end mgrs.kwd returned functions
    }());


    //handle the song comment display and entry
    mgrs.cmt = (function () {
        const sdfs = [{p:"", f:"ti"}, {p:"by: ", f:"ar"},
                      {p:"album: ", f:"ab"}];
        function impressionSummary () {
            const imps = [{lab:"Keywords", val:stat.song.kws || "none"},
                          {lab:"Energy Level", val:"Medium"},
                          {lab:"Approachability", val:"Medium"}];
            if(stat.song.el <= 40) { imps[1].val = "Chill"; }
            if(stat.song.el >= 65) { imps[1].val = "Amped"; }
            if(stat.song.al <= 40) { imps[2].val = "Easy"; }
            if(stat.song.al >= 65) { imps[2].val = "Hard"; }
            return imps; }
        function commentOrPromptContent () {
            if(stat.song.nt) { return stat.song.nt; }
            return jt.tac2html(
                ["button", {type:"button", onclick:mdfs("cmt.commentFirst")},
                 "Add Comment"]); }
        function impressionSummaryContent () {
            const imps = impressionSummary();
            return jt.tac2html(
                ["div", {cla:"ssdkwdiv"},
                 imps.map((imp) =>
                     ["div", {cla:"implinediv"},
                      [["span", {cla:"implabeldiv"}, imp.lab + ": "],
                       ["span", {cla:"impvaldiv"}, imp.val]]])]); }
        function songShareDlgContent () {
            if(!stat.song) {
                return jt.tac2html(
                    ["div", {id:"sharedlgdiv"},
                     ["No playing song to share ",
                      ["a", {href:"#close", onclick:mdfs("cmt.closeSSD")},
                       "ok"]]]); }
            return jt.tac2html(
                ["div", {id:"sharedlgdiv"},
                 [["div", {id:"ssdtitlediv"}, "Song Details"],
                  ["div", {id:"ssdidentdiv"},
                   sdfs.map((df) =>
                       ["div", {cla:"sdfdiv"},
                        [["span", {cla:"sdfprediv"}, df.p],
                         ["span", {cla:"sdfvaldiv"}, stat.song[df.f]]]])],
                  ["div", {id:"ssdclosexdiv"},
                   ["a", {href:"#close", onclick:mdfs("cmt.closeSSD")}, "X"]],
                  ["div", {id:"ssdcommentdiv"}, commentOrPromptContent()],
                  ["div", {id:"ssdkwdsdiv"}, impressionSummaryContent()],
                  ["div", {id:"ssdactdiv", cla:"dlgbuttonsdiv"},
                   [["button", {type:"button", id:"ssdclipb",
                                onclick:mdfs("cmt.copySSD")},
                     "Copy to Clipboard"],
                    ["button", {type:"button", id:"sharesongb",
                                onclick:mdfs("cmt.shareSong")},
                     "Share Song"]]],
                  ["div", {id:"ssdstatdiv"}]]]); }
    return {
        toggleCommentDisplay: function (togstate) {
            var cdiv = jt.byId("commentdiv");
            if(!stat.song || togstate === "off" ||
               (cdiv.innerHTML && togstate !== "on")) {
                cdiv.innerHTML = "";
                return; }
            stat.song.nt = stat.song.nt || "";
            cdiv.innerHTML = jt.tac2html(
                ["textarea", {id:"commentta", name:"commentta", rows:2, cols:35,
                              placeholder:"Your comment about this song",
                              oninput:mdfs("cmt.updateSongComment")},
                 stat.song.nt]); },
        updateSongComment: function () {
            var cta = jt.byId("commentta");
            if(stat.song && cta) {
                stat.song.nt = cta.value;
                noteSongModified(); }
            mgrs.cmt.updateCommentIndicator(); },
        updateCommentIndicator: function () {
            jt.byId("togcommentimg").src = "img/comment.png";
            if(stat.song && stat.song.nt) {
                jt.byId("togcommentimg").src = "img/commentact.png"; } },
        commentFirst: function () {
            mgrs.cmt.togSongShareDialog("off");  //close song share
            mgrs.cmt.toggleCommentDisplay("on"); },
        copySSD: function () {
            var txt = "";
            txt += sdfs.map((df) =>
                df.p + stat.song[df.f]).join("\n");
            if(stat.song.nt) {
                txt += "\n" + stat.song.nt + "\n"; }
            txt += "\n";
            txt += impressionSummary().map((imp) =>
                (imp.lab + ": " + imp.val)).join("\n");
            app.svc.dispatch("gen", "copyToClipboard", txt,
                function () {
                    jt.out("ssdstatdiv", "Details copied to clipboard."); },
                function () {
                    jt.out("ssdstatdiv", "Copy to clipboard failed."); }); },
        shareSong: function () {
            const start = new Date(Date.now() - 2000).toISOString();
            app.svc.dispatch("gen", "fanMessage",
                app.svc.authdata({action:"share", idcsv:stat.song.dsId}),
                function (msgs) {
                    if(!msgs.length) {
                        jt.out("ssdstatdiv",
                               "No messages from hub, try again later."); }
                    else if(msgs[0].created > start) {
                        jt.out("ssdstatdiv",
                               "Song shared with your listeners."); }
                    else {
                        jt.out("ssdstatdiv",
                               "Song already shared."); } },
                function (code, errtxt) {
                    jt.out("ssdstatdiv", code + ": " + errtxt); }); },
        closeSSD: function () {
            const odiv = jt.byId("appoverlaydiv");
            odiv.innerHTML = "";
            odiv.style.display = "none"; },
        togSongShareDialog: function (togstate) {
            const odiv = jt.byId("appoverlaydiv");
            //if odiv is displaying the share dlg content, then clear it
            if(jt.byId("sharedlgdiv") && (odiv.innerHTML ||
                                          togstate === "off")) {
                odiv.innerHTML = "";  //toggle off
                return; }
            if(togstate !== "off") {  //not an initial clear call
                odiv.style.display = "block";
                odiv.innerHTML = songShareDlgContent(); } }
    };  //end mgrs.cmt returned functions
    }());


    //handle the sleep display and entry
    mgrs.slp = (function () {
        var sc = {active:false, count:0};
    return {
        toggleSleepDisplay: function () {
            if(jt.byId("sleepdiv").innerHTML) {
                return jt.out("sleepdiv", ""); }  //toggle off
            jt.out("sleepdiv", jt.tac2html(
                [["input", {type:"checkbox", id:"sleepactivecb",
                            checked:"checked",  //switch on when opening
                            onclick:mdfs("slp.togsleepcb", "event")}],
                 " Pause after ",
                 ["input", {type:"number", id:"sleepcountin", size:2,
                            onchange:mdfs("slp.updateSleepCount", "event"),
                            value:0, min:0, max:8, step:1}],
                 " more"]));
            mgrs.slp.togsleepcb(); },  //reflect checkbox checked image
        togsleepcb: function () {
            sc.active = jt.byId("sleepactivecb").checked;
            if(sc.active) {
                jt.byId("togsleepimg").src = "img/sleepactive.png"; }
            else {
                jt.byId("togsleepimg").src = "img/sleep.png"; } },
        updateSleepCount: function () {
            sc.count = jt.byId("sleepcountin").value; },
        sleepNow: function () {
            jt.out("sleepdiv", "");  //clear sleep display if still up
            if(!sc.active) { return false; }
            if(sc.count > 0) {
                sc.count -= 1;
                return false; }
            return mgrs.slp.startSleep("Sleeping..."); },
        startSleep: function (msg) {
            sc = {active:false, count:0};  //sleeping. reset countdown
            jt.byId("togsleepimg").src = "img/sleep.png";
            mgrs.aud.updateSongDisplay();
            const odiv = jt.byId("mediaoverlaydiv");
            odiv.style.top = (jt.byId("playertitle").offsetHeight + 2) + "px";
            odiv.style.display = "block";
            odiv.innerHTML = jt.tac2html(
                [msg, ["a", {href:"#playnext", onclick:mdfs("slp.resume")},
                       "Resume playback"],
                 " &nbsp; &nbsp; "]);
            //resuming with the space bar can cause conflict with play/pause
            //hook for the player, leaving playback stopped.  If that causes
            //an error, or the spacebarhook is not reset, hitting the space
            //bar again will go to the next song.  Require clicking the
            //resume link.
            //app.spacebarhookfunc = mgrs.slp.resume;
            return true; },
        resume: function () {
            jt.out("mediaoverlaydiv", "");
            jt.byId("mediaoverlaydiv").style.display = "none";
            app.player.next(); }
    };  //end mgrs.slp returned functions
    }());


    function initializeDisplay () {
        stat = {status:"", song:null};
        ctrls = {};
        mgrs.aud.init();  //may redirect to authenticate web player
        jt.out("panplaydiv", jt.tac2html(
            [["div", {id:"panplaymousingdiv"},
              [["div", {id:"mediadiv"}, "No songs on deck yet"],
               ["div", {id:"mediaoverlaydiv", style:"display:none"}],
               ["div", {id:"impressiondiv"},
                [["div", {id:"panpotsdiv"},
                  [["div", {cla:"pandiv", id:"elpandiv"}],
                   ["div", {cla:"pandiv", id:"alpandiv"}]]],
                 ["div", {id:"keysratdiv"},
                  [["div", {id:"kwdsdiv"}],
                   ["div", {id:"rvdiv"}],
                   ["a", {id:"togsleeplink", href:"#sleepafter",
                          title:"", onclick:mdfs("slp.toggleSleepDisplay")},
                    ["img", {id:"togsleepimg", src:"img/sleep.png"}]],
                   ["a", {id:"togcommentlink", href:"#togglecomment",
                          title:"", onclick:mdfs("cmt.toggleCommentDisplay")},
                    ["img", {id:"togcommentimg", src:"img/comment.png"}]],
                   ["a", {id:"togsharelink", href:"#share",
                          title:"", onclick:mdfs("cmt.togSongShareDialog")},
                    ["img", {id:"togshareimg", src:"img/share.png"}]]]],
                 ["div", {cla:"pandrgbdiv", id:"elpandrgbodiv"}],
                 ["div", {cla:"pandrgbdiv", id:"elpandrgbidiv"}],
                 ["div", {cla:"pandrgbdiv", id:"alpandrgbodiv"}],
                 ["div", {cla:"pandrgbdiv", id:"alpandrgbidiv"}],
                 ["div", {id:"elpandragdiv", cla:"pandragdiv"}],
                 ["div", {id:"alpandragdiv", cla:"pandragdiv"}]]]]],
             ["div", {id:"commentdiv"}],
             ["div", {id:"sleepdiv"}]]));
        mgrs.pan.makePanControls();
        //toggle controls are rebuilt after data loads, not needed yet
        makeRatingValueControl();
    }


    function next () {
        saveSongDataIfModified("ignoreUpdatedSongDataReturn");
        //player calls contf if is ready, otherwise contf is ignored and it
        //is up to the player to start playback after it is ready.
        mgrs.aud.verifyPlayer(function () {
            mgrs.tun.toggleTuningOpts("off");
            mgrs.cmt.toggleCommentDisplay("off");
            mgrs.cmt.togSongShareDialog("off");
            stat.status = "";
            if(!mgrs.slp.sleepNow()) {
                const ns = app.deck.getNextSong();
                if(!ns) { //just stop, might be playing an album.
                    return; }
                stat.song = ns;
                mgrs.cmt.updateCommentIndicator();
                mgrs.aud.playAudio(); } });
    }


    function skip () {
        mgrs.tun.bumpCurrentIfTired();  //bumps the fq value if tired song
        next();
    }


return {
    init: function () { initializeDisplay(); },
    deckUpdated: function () { if(!stat.song) { app.player.next(); } },
    next: function () { next(); },
    skip: function () { skip(); },
    song: function () { return stat.song; },
    playerr: function (path) { return playerrs[path]; },
    noteprevplay: function (tstamp) { stat.prevPlayed = tstamp; },
    setState: function (state) { mgrs.mob.setState(state); },
    dispatch: function (mgrname, fname, ...args) {
        try {
            return mgrs[mgrname][fname].apply(app.player, args);
        } catch(e) {
            console.log("player.dispatch " + mgrname + "." + fname + " " + e +
                        " " + new Error("stack trace").stack);
        } }
};  //end of returned functions
}());
