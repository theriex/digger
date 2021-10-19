/*global app, jt, Spotify */
/*jslint browser, white, for, long, unordered */

app.player = (function () {
    "use strict";

    var stat = null;   //initializeDisplay sets initial values for state vars
    var ctrls = null;
    var playerrs = {};


    function saveSongDataIfModified (ignoreupdate) {
        if(!stat.songModified) { return; }
        app.svc.updateSong(stat.song, function (updsong) {
            if(!ignoreupdate) {
                //stat.song = updsong; song data copied, keep current reference
                jt.out("modindspan", "");
                stat.songModified = false; }
            jt.log("song data updated " + JSON.stringify(updsong)); });
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
                     posf:function (x, ignore /*y*/) {
                         //jt.log("ctrls.rat.posf x: " + x);
                         jt.byId("playerstarseldiv").style.width = x + "px";
                         if(stat.song) {
                             stat.song.rv = Math.round((x / 17) * 2);
                             noteSongModified(); } } };
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
        verifyPlayer: function () {
            if(!jt.byId("playeraudio")) {
                jt.out("audiodiv", jt.tac2html(
                    ["audio", {id:"playeraudio", controls:"controls",
                               autoplay:"autoplay"},  //may or may not happen
                     "WTF? Your browser doesn't support audio.."]));
                jt.on("playeraudio", "ended", app.player.next); }
            mgrs.loa.bumpPlayerLeftIfOverhang(); },
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
                    mgrs.aud.handlePlayerError(errorvalue); }); }
    };  //end mgrs.loa returned functions
    }());


    //Player UI manager creates and maintains a playback UI in audiodiv
    mgrs.plui = (function () {
        var state = "paused";
        var bimg = "img/play.png";
        var prog = {pos:0, dur:0, w:200, left:16, //CSS pluiprogbgdiv left
                    svco:null, divs:["pluiprogbgdiv", "pluiprogclickdiv"]};
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
            prog.tickcount = (prog.tickcount + 1) % 4;
            if(jt.byId("pluidiv")) { //interface still available
                const rems = prog.dur - prog.pos;
                if(state === "playing" && rems < 1200) {
                    setTimeout(app.player.next, rems); }
                else {
                    prog.ticker = setTimeout(tickf, 1000); } } }
    return {
        reflectPlaybackState: function () {
            if(state === "paused") {
                if(prog.ticker) {
                    clearTimeout(prog.ticker);
                    prog.ticker = null; }
                bimg = "img/play.png"; }
            else {  //playing
                if(!prog.ticker) {
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
            mgrs.plui.reflectPlaybackState(); },
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
            app.spacebarhookfunc = mgrs.plui.togglePlaybackState;
            mgrs.plui.updatePosIndicator(); },
        updateDisplay: function (svco, pbstate, position, duration) {
            prog.svco = svco;
            prog.pos = position;
            prog.dur = duration;
            if(!jt.byId("pluidiv")) { //interface not set up yet
                mgrs.plui.initInterface(); }
            if(state !== pbstate) {
                state = pbstate;
                mgrs.plui.reflectPlaybackState(); }
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
                    mgrs.spa.verifyPlayer(); };
                setTimeout(function () {  //this can take a while to load
                    var script = document.createElement("script");
                    script.id = "diggerspasdk";
                    script.async = true;
                    script.src = "https://sdk.scdn.co/spotify-player.js";
                    document.body.appendChild(script); },
                           50); }
            return false; },
        playerSetup: function () {
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
                    if(result) {
                        pstat = "connected";
                        mgrs.spa.updatePlayState("paused");  //reset playback
                        pmsg("Spotify Web Player Connected.");
                        //could still get an error if not premium or whatever
                        setTimeout(mgrs.spa.verifyPlaying, 500); }
                    else {
                        pstat = "connfail";
                        pmsg(["a", {href:"#Reconnect",
                                    onclick:mdfs("spa.verifyPlayer")},
                              "Reconnect Spotify Web Player"]); } })
                    .catch(function (err) {
                        jt.log("playerSetup swpi.connect catch: " + err); }); }
            return false; },
        getPlayerStatus: function () { return pstat; },
        verifyPlayer: function () {  //called after deck updated
            if(pstat !== "connected") {
                const steps = ["token", "sdkload", "playerSetup"];
                steps.every((step) => mgrs.spa[step]()); } },
        addPlayerListeners: function () {
            var listeners = {
                "ready":function (obj) {
                    pdid = obj.device_id;
                    mgrs.spa.verifyPlaying(); },
                "not_ready":function (obj) {
                    pdid = obj.device_id;
                    pstat = "notready";
                    pbi.state = "";  //will need to call playSong again
                    pmsg("Spotify Web Player not ready. Reconnecting...");
                    app.svc.dispatch("spc", "refreshToken");
                    mgrs.spa.verifyPlayer(); },
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
                        return jt.log("Ignoring " + err + ": " + mtxt); }
                    pstat = err;
                    swpi.disconnect();  //returns a promise. Ignoring.
                    pmsg([txt + ": " + mtxt + " ",
                          ["a", {href:"#Retry",
                                 onclick:mdfs("spa.verifyPlayer")},
                           "Retry"]]); }; };
            Object.entries(errors).forEach(function ([err, txt]) {
                listeners[err] = makeErrorFunction(err, txt); });
            Object.entries(listeners).forEach(function ([e, f]) {
                var added = swpi.addListener(e, f);
                jt.log("Spotify " + e + " listener: " + added); }); },
        noteWebPlaybackState: function (wpso) {
            if(!wpso) { return; }  //ignore if seek crashes
            pbi.wpso = wpso;
            pbi.state = (pbi.wpso.paused ? "paused" : "playing");
            pbi.pos = pbi.wpso.position;
            pbi.dur = pbi.wpso.duration;
            mgrs.spa.updatePlayState(pbi.state); },
        refreshPlayState: function () {
            swpi.getCurrentState().then(function (wpso) {
                if(!wpso) {
                    pmsg("Spotify Web Player disconnected. Reconnecting...");
                    return mgrs.spa.verifyPlayer(); }
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
                mgrs.spa.playSong(pbi.song); } },
        playSong: function (song) {
            pbi.song = song;
            if(pstat !== "connected" || !pdid) {
                return; }  //playback starts after connection setup complete.
            //autoplay is generally blocked, but may happen if the state is
            //refreshed after hitting the play button.
            pbi.spuri = "spotify:track:" + pbi.song.spid.slice(2);
            app.svc.dispatch("spc", "sjc", `me/player/play?device_id=${pdid}`,
                             "PUT", {uris:[pbi.spuri]}); }
    };  //end mgrs.spa returned functions
    }());


    //general interface for whatever audio player is being used.
    mgrs.aud = (function () {
        var ctx = "loc";  //local reference of svc.mgrs.gen.hdm
        var cap = "loa";  //current audio player
    return {
        init: function () {
            ctx = app.svc.dispatch("gen", "getHostDataManager");
            if(ctx === "web") {  //deal with Spotify redirect if needed
                mgrs.spa.token(); } },
        playerForSong: function (song) {
            if(ctx === "loc") {
                return "loa"; }
            else {  //"web"
                if(!song.spid || !song.spid.startsWith("z:")) {
                    jt.log("Song " + song.dsId + " bad spid: " + song.spid); }
                return "spa"; } },
        verifyPlayerControls: function () {  //called when deck updated
            if(!jt.byId("playerdiv")) {
                jt.out("mediadiv", jt.tac2html(
                    ["div", {id:"playerdiv"},
                     [["div", {id:"playertitle"}, "Starting"],
                      ["div", {id:"playertuningdiv"}],
                      ["div", {id:"audiodiv"}]]])); }
            mgrs[cap].verifyPlayer(); },
        handlePlayerError: function (errval) {
            //On Firefox, errval is a DOMException
            var errmsg = String(errval);  //error name and detail text
            jt.log("Play error " + errmsg + " " + stat.song.path);
            //NotAllowedError is normal on app start. Autoplay is generally
            //disabled until the user has interacted with the player.
            if(errmsg.indexOf("NotAllowedError")) {
                if(mgrs[cap].handleNotAllowedError) {
                    return mgrs[cap].handleNotAllowedError(errmsg); }
                return; }
            //NotSupportedError means file is unplayable by the current
            //player, but might be ok.  For example on MacOS, Safari handles
            //an .m4a but Firefox doesn't.  Best to skip to the next file,
            //assuming this is an anomaly and the next one will likely play.
            if(errmsg.indexOf("NotSupportedError") >= 0) {
                playerrs[stat.song.path] = errmsg;
                app.player.skip(); } },
        updateSongTitleDisplay: function () {
            jt.out("playertitle", jt.tac2html(
                ["div", {cla:"songtitlediv"},
                 [["div", {id:"playtitlebuttonsdiv"},
                   [["span", {id:"modindspan"}],
                    ["a", {href:"#tuneoptions", title:"Tune Playback Options",
                           id:"tuneopta", onclick:mdfs("tun.toggleTuningOpts")},
                     ["img", {src:"img/tunefork.png", cla:"ptico"}]],
                    ["a", {href:"#skip", title:"Skip To Next Song",
                           onclick:jt.fs("app.player.skip()")},
                     ["img", {src:"img/skip.png", cla:"ptico"}]]]],
                  app.deck.dispatch("sop", "songIdentHTML", stat.song)]])); },
        updateSongDisplay: function () {
            mgrs.kwd.rebuildToggles();
            mgrs.aud.updateSongTitleDisplay();
            mgrs.pan.updateControl("al", stat.song.al);
            mgrs.pan.updateControl("el", stat.song.el);
            stat.song.rv = stat.song.rv || 0;  //verify numeric value
            ctrls.rat.posf(Math.round((stat.song.rv * 17) / 2)); },
        playAudio: function () {
            stat.status = "playing";
            jt.log(JSON.stringify(stat.song));
            cap = mgrs.aud.playerForSong(stat.song);
            mgrs.aud.verifyPlayerControls();
            mgrs.aud.updateSongDisplay();
            mgrs[cap].playSong(stat.song); }
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
            var tdiv = jt.byId("playertuningdiv");
            if(!tdiv) { return; }  //nothing to do
            if(tdiv.innerHTML || !stat.song || togstate === "off") {
                tdiv.innerHTML = "";
                return; }
            tdiv.innerHTML = jt.tac2html(
                [["div", {id:"frequencyoptionsdiv"}, mgrs.tun.fqOptsHTML()],
                 ["div", {id:"tuningdetdiv"}, mgrs.tun.optDetailsHTML()]]); },
        optDetailsHTML: function () {
            var lastPlayed = "Never";
            if(stat.prevPlayed) {
                lastPlayed = jt.tz2human(stat.prevPlayed); }
            const flds = [{a:"Last Played", v:lastPlayed},
                          {a:"File", v:stat.song.path}];
            return jt.tac2html(["table", flds.map((fld) =>
                ["tr", {cla:"tuneoptdettr"},
                 [["td", {cla:"tuneoptdetattr"}, fld.a + ": "],
                  ["td", {cla:"tuneoptdetval"}, fld.v]]])]); },
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


    //handle the pan controls for energy and accessability
    mgrs.pan = (function () {
        const anglemax = 145;  //max knob rotation
    return {
        packControlWidthwise: function (id) {
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
            ctrls[id].di = {ox:pk.panbg.elem.offsetLeft + 22,
                            oy:Math.round(ctrls[id].width / 2)}; }, //expanded
        positionDragOverlay: function (id) {
            const pk = {pan:jt.byId(id + "pandiv"),
                        drag:jt.byId(id + "pandragdiv")};
            ctrls[id].dragdims = {top:0,  //relative to impressiondiv
                                  left:pk.pan.offsetLeft,
                                  width:pk.pan.offsetWidth,
                                  height:pk.pan.offsetHeight};
            Object.entries(ctrls[id].dragdims).forEach(function ([k, v]) {
                pk.drag.style[k] = v + "px"; }); },
        expandDragArea: function (id) {
            const pc = ctrls[id];
            const drgdiv = jt.byId(id + "pandragdiv");
            if(pc.pointingActive && !pc.expanded) {
                pc.di.yreliable = false;
                pc.maxxlim = pc.width;
                pc.maxylim = pc.width;  //make square
                pc.toplift = Math.round((pc.maxylim - 40) / -2);
                drgdiv.style.height = pc.maxylim + "px";
                drgdiv.style.top = pc.toplift + "px";
                //drgdiv.style.backgroundColor = "#ffab00";
                drgdiv.style.opacity = 0.3;
                pc.expanded = true; }
            if(!pc.pointingActive && pc.expanded) {
                drgdiv.style.height = "40px";
                drgdiv.style.top = "0px";
                //drgdiv.style.backgroundColor = "";
                drgdiv.style.opacity = 1.0;
                pc.expanded = false; } },
        resetDragChannels: function (pc) {
            const flds = ["xl", "xr", "xw", "yt", "yb", "yh"];
            flds.forEach(function (fld) { delete pc.di[fld]; }); },
        calcDragChannels: function (pc, x, y) {
            pc.di.xl = Math.min((pc.di.xl || x), x);
            pc.di.xr = Math.max((pc.di.xr || x), x);
            pc.di.xw = pc.di.xr - pc.di.xl;  //width of x drag range
            pc.di.yt = Math.min((pc.di.yt || y), y);
            pc.di.yb = Math.max((pc.di.yb || y), y);
            pc.di.yh = pc.di.yb - pc.di.yt; },
        vmaxvals: function (ob, flds) {
            flds.forEach(function (fld) {
                ob[fld] = Math.max(ob[fld], 0);
                ob[fld] = Math.min(ob[fld], 99); }); },
        calcDelta: function (pc, x, y) {
            pc.di.dx = x - pc.di.ox;  //delta x from origin
            pc.di.dy = y - pc.di.oy;  //delta y from origin
            const apd = 40;  //value calculation acceleration padding
            pc.di.vx = 49 + Math.round((pc.di.dx * 100) / (pc.maxxlim - apd));
            pc.di.vy = 49 - Math.round((pc.di.dy * 100) / (pc.maxylim - apd));
            mgrs.pan.vmaxvals(pc.di, ["vx", "vy"]);
            // jt.out("commentdiv", "x:" + x + ", y:" + y +
            //        ", ox:" + pc.di.ox + ", oy:" + pc.di.oy +
            //        ", x:" + x + ", y:" + y +
            //        ", dx:" + pc.di.dx + ", dy:" + pc.di.dy +
            //        ", vx:" + pc.di.vx + ", vy:" + pc.di.vy);
            pc.di.valfield = "vx";
            if(Math.abs(pc.di.dy) > Math.abs(pc.di.dx)) {
                pc.di.valfield = "vy"; } },
        calcPolar: function (pc, x, y) {
            pc.di.r = Math.sqrt((x * x) + (y * y));  //radius by pythagorean
            pc.di.th = Math.atan2(x, y) ;  //angle off top mid (invert axes)
            pc.di.dg = Math.round(pc.di.th * 180 / Math.PI);  //angle in degrees
            if(pc.di.dg > 0) {  //find circle degree (0-360)
                pc.di.cd = 180 + 180 - pc.di.dg;
                if(pc.di.cd >= 335) { pc.di.cd = 360; } }
            else if(pc.di.dg < 0) {
                pc.di.cd = Math.abs(pc.di.dg);
                if(pc.di.cd <= 25) { pc.di.cd = 0; } }
            else {  //at zero
                pc.di.cd = 180; }
            const knobrange = 2 * anglemax;
            pc.di.kr = Math.round(pc.di.cd * knobrange / 360);
            pc.di.vp = Math.round(pc.di.kr * 100 / knobrange);
            mgrs.pan.vmaxvals(pc.di, ["vp"]);
            // jt.out("commentdiv", "x:" + x + ", y:" + y +
            //        ", r:" + pc.di.r.toFixed(2) + 
            //        ", &theta;:" + pc.di.th.toFixed(2) +
            //        " (" + pc.di.dg + "&deg;) " + ", cd:" + pc.di.cd +
            //        ", kr:" + pc.di.kr + ", vp:" + pc.di.vp +
            //        ", xw:" + pc.di.xw + ", yh:" + pc.di.yh);
            if(pc.di.r < 26 && pc.di.xw > 9 && pc.di.yh > 9) {
                pc.di.valfield = "vp"; } },
        calcResultValue: function (id, x, y) {
            var pc = ctrls[id];
            if(!pc.di.yreliable) {        //y was from unexpanded dragdiv.
                pc.di.yreliable = true;   //should be ok after this
                mgrs.pan.resetDragChannels(pc);
                y = pc.di.oy; }           //treat as if centered
            mgrs.pan.calcDragChannels(pc, x, y);
            mgrs.pan.calcDelta(pc, x, y);
            mgrs.pan.calcPolar(pc, pc.di.dx, pc.di.dy);
            return pc.di[pc.di.valfield]; },
        activateControl: function (id) {
            ctrls[id].posf = function (x, y) {
                mgrs.pan.expandDragArea(id);
                if(ctrls[id].pointingActive) {
                    mgrs.pan.updateControl(ctrls[id].fld,
                        mgrs.pan.calcResultValue(id, x, y)); } };
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
            jt.on("panplaymousingdiv", "mousedown", function (event) {
                var okinids = ["kwdin", "commentta"];
                if(!event.target || okinids.indexOf(event.target.id) < 0) {
                    jt.evtend(event); } });  //ignore to avoid selecting ctrls
            jt.on("panplaymousingdiv", "mouseup", function (event) {
                ctrls.el.pointingActive = false;
                ctrls.al.pointingActive = false;
                ctrls.rat.pointingActive = false;
                jt.evtend(event); }); },
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
                stat.song[id] = val;
                mgrs.pan.updateTitle(id, stat.song.ti);
                noteSongModified(); }
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
    mgrs.cmt = {
        toggleCommentDisplay: function (togstate) {
            var cdiv = jt.byId("commentdiv");
            if(!stat.song || togstate === "off" || cdiv.innerHTML) {
                cdiv.innerHTML = "";
                return; }
            stat.song.nt = stat.song.nt || "";
            cdiv.innerHTML = jt.tac2html(
                ["textarea", {id:"commentta", name:"commentta", rows:2, cols:35,
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
                jt.byId("togcommentimg").src = "img/commentact.png"; } }
    };


    //handle the sleep display and entry
    mgrs.slp = (function () {
        var sc = {active:false, count:0};
    return {
        toggleSleepDisplay: function () {
            if(jt.byId("sleepdiv").innerHTML) {
                return jt.out("sleepdiv", ""); }  //toggle off
            jt.out("sleepdiv", jt.tac2html(
                [["input", {type:"checkbox", id:"sleepactivecb",
                            checked:jt.toru(sc.active, "checked"),
                            onclick:mdfs("slp.togsleepcb", "event")}],
                 " Pause after ",
                 ["input", {type:"number", id:"sleepcountin", size:2,
                            onchange:mdfs("slp.updateSleepCount", "event"),
                            value:0, min:0, max:8, step:1}],
                 " more"])); },
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
            sc = {active:false, count:0};  //reset
            jt.byId("togsleepimg").src = "img/sleep.png";
            //The song being paused on will already have been updated when
            //it was popped from deck, and may be written again due to the
            //control displays being updated.  So it will be marked as
            //played even though playback never started.  Not worth getting
            //in the way of deck update logic for this functionality.
            mgrs.aud.updateSongDisplay();
            const odiv = jt.byId("mediaoverlaydiv");
            odiv.style.top = (jt.byId("playpantitlediv").offsetHeight +
                              jt.byId("playertitle").offsetHeight + 2) + "px";
            odiv.style.display = "block";
            odiv.innerHTML = jt.tac2html(
                ["Sleeping... ",
                 ["a", {href:"#playnext", onclick:mdfs("slp.resume")},
                  "Resume playback"],
                 " &nbsp; &nbsp; "]);
            return true; },
        resume: function () {
            jt.out("mediaoverlaydiv", "");
            jt.byId("mediaoverlaydiv").style.display = "none";
            mgrs.aud.playAudio(); }
    };  //end mgrs.slp returned functions
    }());


    function initializeDisplay () {
        stat = {status:"", song:null};
        ctrls = {};
        mgrs.aud.init();  //may redirect to authenticate web player
        jt.out("panplaydiv", jt.tac2html(
            [["div", {id:"panplaymousingdiv"},
              [["div", {cla:"paneltitlediv", id:"playpantitlediv"}, "PLAYER"],
               ["div", {id:"mediadiv"}, "No songs on deck yet"],
               ["div", {id:"mediaoverlaydiv", style:"display:none"}],
               ["div", {id:"impressiondiv"},
                [["div", {id:"panpotsdiv"},
                  [["div", {cla:"pandiv", id:"elpandiv"}],
                   ["div", {cla:"pandiv", id:"alpandiv"}]]],
                 ["div", {id:"keysratdiv"},
                  [["div", {id:"kwdsdiv"}],
                   ["div", {id:"rvdiv"}],
                   ["a", {id:"togcommentlink", href:"#togglecomment",
                          title:"", onclick:mdfs("cmt.toggleCommentDisplay")},
                    ["img", {id:"togcommentimg", src:"img/comment.png"}]],
                   ["a", {id:"togsleeplink", href:"#sleepafter",
                          title:"", onclick:mdfs("slp.toggleSleepDisplay")},
                    ["img", {id:"togsleepimg", src:"img/sleep.png"}]]]],
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
        mgrs.tun.toggleTuningOpts("off");
        mgrs.cmt.toggleCommentDisplay("off");
        stat.status = "";
        stat.song = app.deck.getNextSong();
        mgrs.cmt.updateCommentIndicator();
        if(!stat.song) {
            jt.out("mediadiv", "No songs to play."); }
        else if(!mgrs.slp.sleepNow()) {
            mgrs.aud.playAudio(); }
    }


    function skip () {
        mgrs.tun.bumpCurrentIfTired();  //bumps the fq value if tired song
        next();
    }


    function deckUpdated () {
        if(!stat.status) {  //not playing anything yet, start the first song
            next(); }
    }


return {

    init: function () { initializeDisplay(); },
    deckUpdated: function () { deckUpdated(); },
    next: function () { next(); },
    skip: function () { skip(); },
    song: function () { return stat.song; },
    playerr: function (path) { return playerrs[path]; },
    noteprevplay: function (tstamp) { stat.prevPlayed = tstamp; },
    dispatch: function (mgrname, fname, ...args) {
        return mgrs[mgrname][fname].apply(app.player, args); }

};  //end of returned functions
}());
