/*global app, jt, Spotify */
/*jslint browser, white, fudge, for, long */

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
                ["img", {cla:"starsimg", src:"img/stars18ptC.png"}]]]]]));
        ctrls.rat = {stat:{pointingActive:false},
                     posf:function (x, ignore /*y*/) {
                         //jt.log("ctrls.rat.posf x: " + x);
                         jt.byId("playerstarseldiv").style.width = x + "px";
                         var val = Math.round((x / 17) * 2);
                         if(stat.song) {
                             stat.song.rv = val;
                             noteSongModified(); } } };
        app.filter.movelisten("playerstarsanchordiv", ctrls.rat.stat,
                              ctrls.rat.posf);
        ctrls.rat.posf(0);  //no stars until set or changed.
    }


    var mgrs = {};  //general container for managers 
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
                var shift = Math.round(-0.5 * (playw - maxw));
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


    //Spotify audio interface
    //https://developer.spotify.com/documentation/web-playback-sdk/reference/
    mgrs.spa = (function () {
        var accretry = 4;
        var tokinfo = null;
        var sdkstate = null;
        var pendingSong = null;
        var currSong = null;
        var playername = "Digger Spotify Player";
        var swpi = null;  //Spotify Web Player instance
        var pstat = "";   //current player status
        var pdid = "";    //Spotify Web Player device Id
        var wpso = null;  //Latest returned WebPlayerState object
        var paused = false;  //current pause state.
        function pmsg (tac) {  //display a player message (major status or err)
            jt.out("audiodiv", jt.tac2html(["div", {id:"pmsgdiv"}, tac])); }
    return {
        login: function () {  //verify logged in
            if(app.login.getAuth()) { return true; }
            if(accretry > 0) {
                accretry -= 1;
                pmsg("Waiting for account info...");
                setTimeout(mgrs.spa.verifyPlayer, 500); }
            else {
                pmsg(["a", {href:app.docroot},
                      "Sign In to use the Spotify web player"]); } },
        hubcode: function () {  //verify user authorization from spotify
            var acct = app.login.getAuth();  //server provides hubdat.spa
            if(acct.hubdat.spa.code) {  // have authorization code from spotify
                return true; }
            if(app.docroot !== "https://diggerhub.com") {
                pmsg(["Spotify authorization callback only available from ",
                      ["a", {href:"https://diggerhub.com"}, "diggerhub.com"]]);
                return false; }
            if(app.startParams.state === acct.token) {  //spotify called back
                if(app.startParams.code) {
                    pmsg("Saving Spotify authorization code...");
                    acct.hubdat.spa.code = app.startParams.code;
                    var data = jt.objdata({an:acct.email, at:acct.token,
                                           hubdat:JSON.stringify(acct.hubdat)});
                    app.login.dispatch("act", "updateAccount", data,
                        function (ignore /*result*/) {
                            pmsg("Authorization code saved. Verifying...");
                            mgrs.spa.verifyPlayer(); },
                        function (code, errtxt) {
                            pmsg("Failed to write authorization code " + code +
                                 ": " + errtxt); }); }
                else { //spotify called back with an error
                    pmsg("Spotify authorization failed: " +
                         app.startParams.error); }
                window.history.replaceState({}, document.title, "/digger");
                return false; }  //done handling spotify callback
            //provide redirect to spotify for authorization
            var scopes = ["user-read-playback-state",  //current track info
                          "playlist-modify-public",  //create playlist
                          "user-modify-playback-state",  //pause, resume etc
                          "user-read-currently-playing",  //get current track
                          "streaming"];  //required for web playback
            var params = {client_id:acct.hubdat.spa.clikey,
                          response_type:"code",
                          redirect_uri:acct.hubdat.spa.returi,
                          state:acct.token,
                          scope:scopes.join(" ")};
            var spurl = "https://accounts.spotify.com/authorize?" +
                       jt.objdata(params);
            pmsg(["a", {href:spurl},
                 "DiggerHub needs permission to play music from your Spotify" +
                 " Premium account."]);
            return false; },
        token: function (contf) {  //verify token info, or contf(token)
            if(tokinfo && (new Date().toISOString() < tokinfo.useby)) {
                if(contf) {  //called from spotify player
                    setTimeout(function () { contf(tokinfo.access_token); },
                               50); }
                return true; }
            //fetch token info from Spotify
            if(!contf) {
                pmsg("Verifying Spotify access token..."); }
            app.svc.dispatch("web", "spotifyTokenInfo",
                function (info) {
                    tokinfo = info;
                    if(!contf) {
                        pmsg("Spotify token received. Verifying...");
                        mgrs.spa.verifyPlayer(); }
                    else {
                        contf(tokinfo.access_token); } },
                function (code, errtxt) {
                    pmsg("Spotify token retrieval failed " + code +
                         ": " + errtxt); }); },
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
                pmsg("Connecting Spotify Web Player...");
                swpi = new Spotify.Player({name:playername,
                                           getOAuthToken:mgrs.spa.token});
                var listeners = {
                    "ready":function (deviceId) {
                        pdid = deviceId;
                        pstat = "connected";
                        if(pendingSong) {
                            mgrs.spa.playSong(pendingSong);
                            pendingSong = null; }
                        else if(currSong) {
                            mgrs.spa.playSong(currSong); } },
                    "not_ready":function (deviceId) {
                        pdid = deviceId;
                        pstat = "notready";
                        mgrs.spa.playerConnect(); },
                    "player_state_changed":function (obj) {
                        wpso = obj;
                        mgrs.spa.refreshPlayerState(); }};
                Object.entries(listeners).forEach(function (e, f) {
                    swpi.addListener(e, f); });
                var errors = {
                    initialization_error:"Player initialization failed",
                    authentication_error:"Could not authenticate",
                    account_error:"Could not validate Spotify account",
                    playback_error:"Track playback failed"};
                var makeErrorFunction = function (err, txt) {
                    return function (msg) {
                        pstat = err;
                        pmsg([txt + ": " + msg + " ",
                              ["a", {href:"#Retry",
                                     onclick:mdfs("spa.playerConnect")},
                               "Retry"]]); }; };
                Object.entries(errors).forEach(function ([err, txt]) {
                    swpi.on(err, makeErrorFunction(err, txt)); }); }
            mgrs.spa.playerConnect();
            return false; },
        playerConnect: function () {
            if(pstat !== "connecting") {
                pstat = "connecting";
                swpi.connect().then(function (result) {
                    if(result) {
                        //pstat updated by on "ready" listener
                        jt.log("Spotify Web Player connected."); }
                    else {
                        pstat = "connfail";
                        pmsg(["a", {href:"#Reconnect", 
                                    onclick:mdfs("spa.playerConnect")},
                              "Reconnect Spotify Web Player"]); } }); } },
        verifyPlayer: function () {  //called after deck updated
            if(pstat !== "connected") {
                var steps = ["login", "hubcode", "token", "sdkload",
                             "playerSetup"];
                steps.every((step) => mgrs.spa[step]()); } },
        refreshPlayerState: function () {
            paused = wpso.paused;
            pmsg("position: " + wpso.position +
                 ", duration: " + wpso.duration); },
        togglePause: function () {
            if(paused) {
                swpi.resume().then(function () {
                    paused = false;
                    jt.log("playing"); }); }
            else {
                swpi.pause().then(function () {
                    paused = true;
                    jt.log("paused"); }); } },
        playSong: function (song) {
            if(sdkstate !== "loaded") {
                pendingSong = song;
                return; }
            currSong = song;
            fetch(
                `https://api.spotify.com/v1/me/player/play?device_id=${pdid}`,
                {method:"PUT",
                 body:JSON.stringify({uris:["spotify:track:" +
                                            currSong.spid.slice(2)]}),
                 headers:{
                     "Content-Type":"application/json",
                     "Authorization":`Bearer ${tokinfo.access_token}`}}); }
    };  //end mgrs.spa returned functions
    }());


    //general interface for whatever audio player is being used.
    mgrs.aud = (function () {
        var ctx = "loc";  //local reference of svc.mgrs.gen.hdm
        var cap = "loa";  //current audio player
    return {
        init: function () {
            ctx = app.svc.dispatch("gen", "getHostDataManager"); },
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
        playAudio: function () {
            stat.status = "playing";
            jt.log(JSON.stringify(stat.song));
            mgrs.kwd.rebuildToggles();
            cap = mgrs.aud.playerForSong(stat.song);
            mgrs.aud.verifyPlayerControls();
            mgrs.aud.updateSongTitleDisplay();
            mgrs.pan.updateControl("al", stat.song.al);
            mgrs.pan.updateControl("el", stat.song.el);
            stat.song.rv = stat.song.rv || 0;  //verify numeric value
            ctrls.rat.posf(Math.round((stat.song.rv * 17) / 2));
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
            var flds = [{a:"Last Played", v:lastPlayed},
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
    mgrs.pan = {
        createControl: function (id, det) {
            var pc = {fld:det.fld, pn:det.pn, low:det.low, high:det.high,
                      pointingActive:false};
            ctrls[id] = pc;
            jt.out(id + "pandiv", jt.tac2html(
              ["div", {cla:"pancontdiv", id:pc.fld + "pancontdiv"},
               [["div", {cla:"panleftlabdiv", id:pc.fld + "panlld"}, pc.low],
                ["div", {cla:"panrightlabdiv", id:pc.fld + "panrld"}, pc.high],
                ["div", {cla:"panfacediv", id:pc.fld + "panfacediv"},
                 ["img", {cla:"panfaceimg", src:"img/panface.png"}]],
                ["div", {cla:"panbgdiv", id:pc.fld + "panbgdiv"},
                 ["img", {cla:"panbackimg", src:"img/panback.png"}]],
                ["div", {cla:"pandragdiv", id:pc.fld + "pandragdiv"}]]]));
            //pack the control widthwise
            var pk = {leftlab:{elem:jt.byId(id + "panlld")},
                      rightlab:{elem:jt.byId(id + "panrld")},
                      panbg:{elem:jt.byId(id + "panbgdiv")},
                      panface:{elem:jt.byId(id + "panfacediv")}};
            Object.keys(pk).forEach(function (key) {
                pk[key].bbox = pk[key].elem.getBoundingClientRect(); });
            var left = 8 + pk.leftlab.bbox.width;
            pk.panbg.elem.style.left = left + "px";
            pk.panface.elem.style.left = left + "px";
            ctrls[id].width = left + 44 + pk.rightlab.bbox.width + 5;
            var pds = [jt.byId(id + "pancontdiv"), jt.byId(id + "pandiv"),
                       jt.byId(id + "pandragdiv")];
            pds.forEach(function (panel) {
                panel.style.width = ctrls[id].width + "px";
                panel.style.height = "40px"; });
            //activate the control
            ctrls[id].posf = function (x, ignore /*y*/) {
                ctrls[id].val = Math.round((x * 99) / ctrls[id].width);
                mgrs.pan.updateControl(ctrls[id].fld, ctrls[id].val); };
            app.filter.movelisten(id + "pandragdiv",
                                  ctrls[id], ctrls[id].posf); },
        makePanControls: function () {
            var filters = app.filter.filters();
            mgrs.pan.createControl("el", filters[0]);
            mgrs.pan.createControl("al", filters[1]);
            mgrs.pan.updateControl("el");
            mgrs.pan.updateControl("al");
            jt.on("panplaydiv", "mousedown", function (event) {
                var okinids = ["kwdin", "commentta"];
                if(!event.target || okinids.indexOf(event.target.id) < 0) {
                    jt.evtend(event); } });  //ignore to avoid selecting ctrls
            jt.on("panplaydiv", "mouseup", function (event) {
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
            var div = jt.byId(id + "pandiv");
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
            var g = app.filter.gradient();
            g = {f:mgrs.pan.hex2RGB(g.left), t:mgrs.pan.hex2RGB(g.right)};
            var pct = (val + 1) / 100;
            var res = {r:0, g:0, b:0};
            Object.keys(res).forEach(function (key) {
                res[key] = Math.round(
                    g.f[key] + (g.t[key] - g.f[key]) * pct); });
            var pfd = jt.byId(id + "panfacediv");
            pfd.style.backgroundColor = "rgb(" + 
                res.r + ", " + res.g + ", " + res.b + ")";
            //rotate knob to value
            var anglemax = 145;
            var rot = Math.round(2 * anglemax * pct) - anglemax;
            pfd.style.transform = "rotate(" + rot + "deg)"; }
    };  //end mgrs.pan


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
            var button = jt.byId("kwdtog" + idx);
            if(button.className === "kwdtogoff") {
                button.className = "kwdtogon";
                stat.song.kws = stat.song.kws.csvappend(button.innerHTML); }
            else {
                button.className = "kwdtogoff";
                stat.song.kws = stat.song.kws.csvremove(button.innerHTML); }
            app.top.dispatch("lib", "togdlg", "close");  //sc changed
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
    };  //end mgrs.kwd returned functons
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


    function initializeDisplay () {
        stat = {status:"", song:null};
        ctrls = {};
        jt.out("panplaydiv", jt.tac2html(
            [["div", {cla:"paneltitlediv"}, "PLAYER"],
             ["div", {id:"mediadiv"}, "No songs on deck yet"],
             ["div", {id:"panpotsdiv"},
              [["div", {cla:"pandiv", id:"elpandiv"}],
               ["div", {cla:"pandiv", id:"alpandiv"}]]],
             ["div", {id:"keysratdiv"},
              [["div", {id:"kwdsdiv"}],
               ["div", {id:"rvdiv"}],
               ["a", {id:"togcommentlink", href:"#togglecomment",
                      title:"", onclick:mdfs("cmt.toggleCommentDisplay")},
                ["img", {id:"togcommentimg", src:"img/comment.png"}]]]],
             ["div", {id:"commentdiv"}]]));
        mgrs.pan.makePanControls();
        //toggle controls rebuilt after data loaded
        makeRatingValueControl();
        mgrs.aud.init();
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
        else {
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

