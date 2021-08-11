/*jslint node, white, long, unordered */

module.exports = (function () {
    "use strict";

    var db = require("./db");
    var formidable = require("formidable");
    var path = require("path");
    const fetch = require("node-fetch");
    var hs = "https://diggerhub.com";
    //var hs = "http://localhost:8080";


    function verifyDefaultAccount (conf) {
        var initkwds = {
            Social:{pos:1, sc:0, ig:0, dsc:"Music to play when other people are listening."},
            Personal:{pos:2, sc:0, ig:0, dsc:"Music to play for me."},
            Ambient:{pos:3, sc:0, ig:0, dsc:"Music that can be listened to from near zero attention up to occasional full attention, without being boring or intrusive."},
            Dance:{pos:4, sc:0, ig:0, dsc:"Music that makes you move. Great grooves."},
            Office:{pos:0, sc:0, ig:0, dsc:"In the office with headphones on."},
            Solstice:{pos:0, sc:0, ig:0, dsc:"Holiday seasonal."}};
        conf.acctsinfo = conf.acctsinfo || {currid:"", accts:[]};
        if(!conf.acctsinfo.accts.find((x) => x.dsId === "101")) {
            const diggerbday = "2019-10-11T00:00:00Z";
            conf.acctsinfo.accts.push(
                {dsType:"DigAcc", dsId:"101", firstname:"Digger",
                 created:diggerbday, modified:diggerbday + ";1",
                 email:"support@diggerhub.com", token:"none", kwdefs:initkwds,
                 igfolds:["Ableton", "Audiffex", "Audio Music Apps",
                          "GarageBand", "JamKazam"]}); }
        if(!conf.acctsinfo.currid) {
            conf.acctsinfo.currid = "101"; }
    }


    function getCurrentAccount () {
        var ca = null;
        var conf = db.conf();
        var info = conf.acctsinfo;
        if(info.currid) {
            ca = info.accts.find((a) => a.dsId === info.currid); }
        if(!ca) {  //missing currid or bad currid value
            conf.acctsinfo.currid = "101";
            ca = info.accts.find((a) => a.dsId === info.currid); }
        return ca;
    }


    function getFriendById (gid) {
        if(!gid) { return null; }
        const ca = getCurrentAccount();
        if(!ca || !ca.musfs || !Array.isArray(ca.musfs) || !ca.musfs.length) {
            return null; }
        const musf = ca.musfs.find((g) => g.dsId === gid);
        return musf;
    }


    function isIgnoreDir (ws, dirname) {
        if(!ws.curracct) {
            ws.curracct = getCurrentAccount(); }
        ws.curracct.igfolds = ws.curracct.igfolds || [];
        if(!Array.isArray(ws.curracct.igfolds)) {
            ws.curracct.igfolds = []; }
        const igfolds = ws.curracct.igfolds;
        if(igfolds.includes(dirname)) {
            return true; }
        if(!ws.wildms) {  //init wildcard ending match strings array
            ws.wildms = igfolds.filter((ign) => ign.endsWith("*"));
            ws.wildms = ws.wildms.map((wm) => wm.slice(0, -1)); }
        return ws.wildms.some((wm) => dirname.startsWith(wm));
    }


    function bodify (po) {  //parameters object
        return Object.entries(po).map(function ([k, v]) {
            return k + "=" + encodeURIComponent(v); })
            .join("&");
    }


    function deserializeAccountFields (acct) {
        var sfs = ["kwdefs", "igfolds", "settings", "musfs"];
        sfs.forEach(function (sf) {
            //console.log("parsing " + sf + ": " + acct[sf]);
            if(acct[sf]) {  //"" won't parse
                acct[sf] = JSON.parse(acct[sf]); } });
    }


    function writeUpdatedAccount (updacc) {
        var accts = db.conf().acctsinfo.accts;
        var aidx = accts.findIndex((a) => a.dsId === updacc.dsId);
        updacc.token = accts[aidx].token;
        accts[aidx] = updacc;
        db.writeConfigurationFile();
    }


    function updateLocalSong (dbo, s) {
        var ls = dbo.songs[s.path];
        if(!ls) {  //song was last updated from some other setup
            ls = Object.values(dbo.songs).find((x) =>
                x.ti === s.ti && x.ar === s.ar && x.ab === s.ab); }
        if(!ls) {  //new song from some other setup
            ls = {path:s.path,  //Need a path, even if no file there.
                  fq:"DN",      //Deleted file, Newly added
                  ti:s.ti, ar:s.ar, ab:s.ab,
                  lp:s.lp};     //Played on other setup, but good to have value
            dbo.songs[s.path] = ls; }
        const flds = ["modified", "dsId", "rv", "al", "el", "kws", "nt"];
        if(!(ls.fq.startsWith("D") || ls.fq.startsWith("U"))) {
            flds.push("fq"); }
        flds.forEach(function (fld) { ls[fld] = s[fld]; });
        console.log("writing updated song " + s.path);
        return ls;
    }


    function processReceivedSyncData (updates) {
        updates = JSON.parse(updates);
        updates[0].diggerVersion = db.diggerVersion();
        const retval = JSON.stringify(updates);
        const updacc = updates[0];
        deserializeAccountFields(updacc);
        writeUpdatedAccount(updacc);  //reflect modified timestamp
        //write any returned updated songs
        const updsongs = updates.slice(1);  //zero or more newer songs
        if(updsongs.length) {
            const dbo = db.dbo();
            updsongs.forEach(function (s) {
                updateLocalSong(dbo, s); });
            db.writeDatabaseObject(); }
        return retval;
    }


    function noteUpdatedAccount (accts) {
        accts = JSON.parse(accts);
        deserializeAccountFields(accts[0]);
        writeUpdatedAccount(accts[0]);
    }


    function musfDataFileName (gid) {
        if(!db.fileExists(db.conf().cachePath)) {
            db.mkdir(db.conf().cachePath); }
        const gdf = path.join(db.conf().cachePath, "musf_" + gid + ".json");
        return gdf;
    }


    function recountFilledByFriend (gid) {
        return Object.values(db.dbo().songs).reduce((a, v) =>
            a + ((v.srcid === gid)? 1 : 0)).length;
    }


    function loadLocalFriendData (gid) {
        var gfc;
        var gdat = {version:db.diggerVersion(),
                    songcount:0,     //total songs from this musf
                    songs:{}};       //canonicalsongname:songdata
        var musf = getFriendById(gid);
        if(musf) {
            const gdf = musfDataFileName(gid);
            if(db.fileExists(gdf)) {
                gfc = null;
                try {
                    gfc = JSON.parse(db.readFile(gdf));
                } catch(e) {
                    console.log("hub.loadLocalFriendData " + gdf + " e: " + e);
                }
                if(gfc && gfc.version !== db.diggerVersion()) {
                    gfc = null; }
                if(gfc) {
                    gdat = gfc; }
                else {  //previous musf data unavailable, reset musf info.
                    musf.lastrating = "";
                    musf.lastcheck = "";
                    musf.filled = recountFilledByFriend(musf.dsId); } } }
        return [musf, gdat];
    }


    function writeLocalFriendData (gid, gdat) {
        var gdf = musfDataFileName(gid);
        db.writeFile(gdf, JSON.stringify(gdat, null, 2));
    }


    //see ../docroot/docs/guidenotes.txt
    function songLookupKey (s, ignore /*p*/) {
        var sk = "";
        if(!s.ti) {
            //console.log("song has no title. p: " + p);
            return null; }
        const flds = ["ti", "ar", "ab"];
        flds.forEach(function (fld) {
            var val = s[fld] || "";
            val.trim();
            sk += val; });
        sk = sk.toLowerCase();
        return sk;
    }


    function updateLocalFriendData (gdat, hubret, musf) {
        var songs = JSON.parse(hubret);
        songs.forEach(function (song) {
            var key = songLookupKey(song);
            gdat.songs[key] = song;
            if(song.modified > musf.lastrating) {
                musf.lastrating = song.modified; } });
        if(songs.length) {  //received some newer ratings
            gdat.songcount = Object.keys(gdat.songs).length;
            writeLocalFriendData(musf.dsId, gdat);
            musf.songcount = gdat.songcount;
            musf.lastcheck = musf.lastrating; }  //note need to fetch more
        else {  //lastcheck > lastrating means up to date
            musf.lastcheck = new Date().toISOString(); }
        db.writeConfigurationFile();  //save updated musf info
    }


    function isUnratedSong (s) {
        return (!s.kws && s.el === 49 && s.al === 49);
    }


    function resError (res, msg, code) {
        code = code || 400;
        console.log("hub resError " + code + ": " + msg);
        res.writeHead(code, {"Content-Type": "text/plain"});
        res.end(msg);
    }


    function hubPostFields (res, apiname, procf, fldsobj) {
        var ctx = {reqflds:fldsobj,
                   url:hs + "/api/" + apiname,
                   rqs:{method:"POST",
                        headers:{"Content-Type":
                                 "application/x-www-form-urlencoded"},
                        body:bodify(fldsobj)}};
        console.log(apiname + " -> " + ctx.url);
        fetch(ctx.url, ctx.rqs)
            .then(function (hubr) {
                ctx.code = hubr.status;
                return hubr.text(); })
            .then(function (btxt) {
                if(ctx.code !== 200) {
                    return resError(res, btxt, ctx.code); }
                ctx.restext = btxt;
                if(procf) {  //local server side effects like writing data
                    ctx.restext = procf(btxt, ctx.reqflds) || ctx.restext; }
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(ctx.restext); })
            .catch(function (err) {
                if(ctx.restext) {
                    console.log("ctx.restext: " + ctx.restext); }
                if(ctx.code === 200) {
                    ctx.code = 400; }
                resError(res, "call to " + ctx.url + " failed: " + err,
                         (ctx.code || 400)); });
    }


    function hubpost (req, res, apiname, procf) {
        var fif = new formidable.IncomingForm();
        fif.parse(req, function (err, fields) {
            if(err) {
                return resError(res, apiname + " form error: " + err); }
            hubPostFields(res, apiname, procf, fields); });
    }


    function makeCacheBustToken () {
        var iso = new Date().toISOString();
        var slug = iso.slice(2,4) + iso.slice(5,7) + iso.slice(8,10) +
            iso.slice(11,13) + iso.slice(14,16) + iso.slice(17,19);
        return slug;
    }


    function hubget (apiname, params, res, procf) {
        params.cachebust = params.cachebust || makeCacheBustToken();
        const data = Object.entries(params)
            .map(function ([a, v]) { return a + "=" + encodeURIComponent(v); })
            .join("&");
        const ctx = {rps:params, url:hs + "/api/" + apiname + "?" + data};
        console.log(apiname + " -> " + ctx.url);
        fetch(ctx.url)
            .then(function (hubr) {
                ctx.code = hubr.status;
                return hubr.text(); })
            .then(function (btxt) {
                if(ctx.code !== 200) {
                    return resError(res, btxt, ctx.code); }
                ctx.restext = btxt;
                if(procf) {  //local server side effects like writing data
                    ctx.restext = procf(ctx.restext) || ctx.restext; }
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(ctx.restext); })
            .catch(function (err) {
                if(ctx.restext) {
                    console.log("ctx.restext: " + ctx.restext); }
                if(ctx.code === 200) {
                    ctx.code = 400; }
                resError(res, "call to get " + apiname + " failed: " + err,
                         (ctx.code || 400)); });
    }


    //////////////////////////////////////////////////
    //API endpoint functions:

    function accountsInfo (req, res) {
        var fif = new formidable.IncomingForm();
        fif.parse(req, function (err, fields) {
            if(err) {
                return resError(res, "accountsInfo form error " + err); }
            const conf = db.conf();
            conf.acctsinfo = conf.acctsinfo || {currid:0, accts:[]};
            if(fields.acctsinfo) {  //data passed in. update.
                conf.acctsinfo = JSON.parse(fields.acctsinfo);
                db.writeConfigurationFile(); }
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify(conf.acctsinfo)); });
    }


    function mailpwr (pu, ignore /*req*/, res) {
        if(!pu.query.email) {
            return resError(res, "Wrong password email required."); }
        const params = {email:pu.query.email};
        return hubget("mailpwr", params, res);
    }


    function hubsync (req, res) {
        //see ../docroot/docs/hubsyncNotes.txt
        return hubpost(req, res, "hubsync", function (hubret) {
            return processReceivedSyncData(hubret); });
    }


    function addmusf (req, res) {
        return hubpost(req, res, "addmusf", function (hubret) {
            noteUpdatedAccount(hubret); });
    }


    function musfdat (pu, ignore /*req*/, res) {
        var musf; var gdat; [musf, gdat] = loadLocalFriendData(pu.query.gid);
        if(!musf) {
            return resError(res, "Friend " + pu.query.gid + " not found."); }
        musf.lastrating = "";
        Object.values(gdat.songs).forEach(function (s) {
            if(s.modified > musf.lastrating) {
                musf.lastrating = s.modified; } });
        const params = {email:pu.query.email, at:pu.query.at, mfid:pu.query.gid,
                        since:musf.lastrating};
        return hubget("musfdat", params, res, function (hubret) {
            updateLocalFriendData(gdat, hubret, musf);
            return JSON.stringify(musf); });
    }


    const gdutil = (function () {
        var gdflds = ["el", "al", "rv", "kws"];
    return {
        fillSong: function (musf, musfsong, ddsong) {
            gdflds.forEach(function (cf) {
                ddsong[cf] = musfsong[cf]; });
            ddsong.srcid = musf.dsId;
            ddsong.srcrat = gdflds.map((n) => musfsong[n])
                .join(";");  //avoid serialization confusion with url safe sep
            musf.filled += 1;
            musf.lastimport = new Date().toISOString(); },
        verifyFriendRating: function (song) {
            if(!song.srcid || !song.srcrat) { return; }  //no guide info
            if(song.dsId) { return; }  //srcid preserved after hub save
            const gvals = song.srcrat.split(";");
            const chg = gdflds.find((fld, idx) =>
                String(song[fld]) !== gvals[idx]);
            if(chg) {
                console.log("Removed srcid/srcrat due to changed " + chg);
                song.srcid = "";
                song.srcrat = ""; } }
    };  //end returned gdutil functions
    }());


    function ratimp (pu, ignore /*req*/, res) {
        var musf; var gdat; [musf, gdat] = loadLocalFriendData(pu.query.gid);
        if(!musf) {
            return resError(res, "Friend " + pu.query.gid + " not found."); }
        musf.songcount = gdat.songcount || 0;  //verify value filled in
        musf.filled = musf.filled || 0;
        const ces = [];  //Collab entries for filled in ratings
        const dbo = db.dbo();
        Object.entries(dbo.songs).forEach(function ([p, s]) {
            if(isUnratedSong(s) && !s.dsId) {
                const key = songLookupKey(s, p);
                if(key) {
                    if(gdat.songs[key] && !isUnratedSong(gdat.songs[key])) {
                        console.log("ratimp " + key);
                        gdutil.fillSong(musf, gdat.songs[key], s);
                        ces.push({ctype:"inrat", rec:pu.query.aid,
                                  src:musf.dsId,
                                  ssid:gdat.songs[key].dsId}); } } } });
        const fldsobj = {email:pu.query.email, at:pu.query.at,
                         cacts:JSON.stringify(ces)};
        return hubPostFields(res, "collabs", function () {
            db.writeDatabaseObject();  //record updated ratings
            db.writeConfigurationFile();  //save updated musf info
            return JSON.stringify([musf, dbo]); },
                             fldsobj);
    }


    //friend sourced ratings that have been saved to the hub are kept so
    //they work the same as friend sourced songs in the streaming interface.
    function gdclear (pu, ignore /*req*/, res) {
        var gid = pu.query.gid;
        Object.values(db.dbo().songs).forEach(function (s) {
            if(!s.dsId && s.srcid === gid) {
                s.el = 49;
                s.al = 49;
                s.rv = 5;
                s.kws = "";
                s.srcid = "";
                s.srcrat = ""; } });
        db.writeDatabaseObject();  //record updated ratings
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(db.dbo()));
    }


    return {
        //server utilities
        verifyDefaultAccount: function (conf) { verifyDefaultAccount(conf); },
        isIgnoreDir: function (ws, dn) { return isIgnoreDir(ws, dn); },
        verifyFriendRating: function (s) { gdutil.verifyFriendRating(s); },
        //server endpoints
        acctsinfo: function (req, res) { return accountsInfo(req, res); },
        newacct: function (req, res) { return hubpost(req, res, "newacct"); },
        acctok: function (req, res) { return hubpost(req, res, "acctok"); },
        updacc: function (req, res) { return hubpost(req, res, "updacc"); },
        mailpwr: function (pu, req, res) { return mailpwr(pu, req, res); },
        hubsync: function (req, res) { return hubsync(req, res); },
        addmusf: function (req, res) { return addmusf(req, res); },
        musfdat: function (pu, req, res) { return musfdat(pu, req, res); },
        ratimp: function (pu, req, res) { return ratimp(pu, req, res); },
        gdclear: function (pu, req, res) { return gdclear(pu, req, res); }
    };
}());
