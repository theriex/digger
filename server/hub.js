/*jslint node, white, fudge, long */

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
            var diggerbday = "2019-10-11T00:00:00Z";
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


    function getGuideById (gid) {
        if(!gid) { return null; }
        var ca = getCurrentAccount();
        if(!ca || !ca.guides || !ca.guides.length) {
            return null; }
        var guide = ca.guides.find((g) => g.dsId === gid);
        return guide;
    }


    function isIgnoreDir (ws, dirname) {
        if(!ws.curracct) {
            ws.curracct = getCurrentAccount(); }
        var igfolds = ws.curracct.igfolds;
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
        var sfs = ["kwdefs", "igfolds", "settings", "guides"];
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
        var flds = ["modified", "dsId", "rv", "al", "el", "kws", "nt"];
        if(!(ls.fq.startsWith("D") || ls.fq.startsWith("U"))) {
            flds.push("fq"); }
        flds.forEach(function (fld) { ls[fld] = s[fld]; });
        console.log("writing updated song " + s.path);
        return ls;
    }


    function processReceivedSyncData (updates) {
        updates = JSON.parse(updates);
        updates[0].diggerVersion = db.diggerVersion();
        var retval = JSON.stringify(updates);
        var updacc = updates[0];
        deserializeAccountFields(updacc);
        writeUpdatedAccount(updacc);  //reflect modified timestamp
        //write any returned updated songs
        var updsongs = updates.slice(1);  //zero or more newer songs
        if(updsongs.length) {
            var dbo = db.dbo();
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


    function guideDataFileName (gid) {
        if(!db.fileExists(db.conf().cachePath)) {
            db.mkdir(db.conf().cachePath); }
        var gdf = path.join(db.conf().cachePath, "guide_" + gid + ".json");
        return gdf;
    }


    function recountFilledByGuide (gid) {
        var filled = 0;  //array.reduce is fugly with if
        Object.values(db.dbo().songs).forEach(function (song) {
            if(song.guiderated && song.guiderated.startsWith(gid)) {
                filled += 1; } });
        return filled;
    }


    function loadLocalGuideData (gid) {
        var gdat = {version:db.diggerVersion(),
                    songcount:0,     //total songs from this guide
                    songs:{}};       //canonicalsongname:songdata
        var guide = getGuideById(gid);
        if(guide) {
            var gdf = guideDataFileName(gid);
            if(db.fileExists(gdf)) {
                var gfc = null;
                try {
                    gfc = JSON.parse(db.readFile(gdf));
                } catch(e) {
                    console.log("hub.loadLocalGuideData " + gdf + " err: " + e);
                }
                if(gfc && gfc.version !== db.diggerVersion()) {
                    gfc = null; }
                if(gfc) {
                    gdat = gfc; }
                else {  //previous guide data unavailable, reset guide info.
                    guide.lastrating = "";
                    guide.lastcheck = "";
                    guide.filled = recountFilledByGuide(guide.dsId); } } }
        return [guide, gdat];
    }


    function writeLocalGuideData (gid, gdat) {
        var gdf = guideDataFileName(gid);
        db.writeFile(gdf, JSON.stringify(gdat, null, 2));
    }


    //see ../docroot/docs/guidenotes.txt
    function songLookupKey (s, ignore /*p*/) {
        if(!s.ti) {
            //console.log("song has no title. p: " + p);
            return null; }
        var sk = "";
        var flds = ["ti", "ar", "ab"];
        flds.forEach(function (fld) {
            var val = s[fld] || "";
            val.trim();
            sk += val; });
        sk = sk.toLowerCase();
        return sk;
    }


    function updateLocalGuideData (gdat, hubret, guide) {
        var songs = JSON.parse(hubret);
        songs.forEach(function (song) {
            var key = songLookupKey(song);
            gdat.songs[key] = song;
            if(song.modified > guide.lastrating) {
                guide.lastrating = song.modified; } });
        if(songs.length) {  //received some newer ratings
            gdat.songcount = Object.keys(gdat.songs).length;
            writeLocalGuideData(guide.dsId, gdat);
            guide.songcount = gdat.songcount;
            guide.lastcheck = guide.lastrating; }  //note need to fetch more
        else {  //lastcheck > lastrating means up to date
            guide.lastcheck = new Date().toISOString(); }
        db.writeConfigurationFile();  //save updated guide info
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
        var data = Object.entries(params)
            .map(function ([a, v]) { return a + "=" + encodeURIComponent(v); })
            .join("&");
        var ctx = {rps:params, url:hs + "/api/" + apiname + "?" + data};
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
            var conf = db.conf();
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
        var params = {email:pu.query.email};
        return hubget("mailpwr", params, res);
    }


    function hubsync (req, res) {
        //see ../docroot/docs/hubsyncNotes.txt
        return hubpost(req, res, "hubsync", function (hubret) {
            return processReceivedSyncData(hubret); });
    }


    function addguide (req, res) {
        return hubpost(req, res, "addguide", function (hubret) {
            noteUpdatedAccount(hubret); });
    }


    function guidedat (pu, ignore /*req*/, res) {
        var guide; var gdat; [guide, gdat] = loadLocalGuideData(pu.query.gid);
        if(!guide) {
            return resError(res, "Guide " + pu.query.gid + " not found."); }
        guide.lastrating = "";
        Object.values(gdat.songs).forEach(function (s) {
            if(s.modified > guide.lastrating) {
                guide.lastrating = s.modified; } });
        var params = {email:pu.query.email, at:pu.query.at, gid:pu.query.gid,
                      since:guide.lastrating};
        return hubget("guidedat", params, res, function (hubret) {
            updateLocalGuideData(gdat, hubret, guide);
            return JSON.stringify(guide); });
    }


    var gdutil = (function () {
        var gdflds = ["el", "al", "rv", "kws"];
    return {
        fillSong: function (guide, guidesong, ddsong) {
            gdflds.forEach(function (cf) {
                ddsong[cf] = guidesong[cf]; });
            //tighter and no serialization confusion with a ';' sep value.
            ddsong.guiderated = guide.dsId;
            gdflds.forEach(function (cf) {
                ddsong.guiderated += ":" + guidesong[cf]; });
            guide.filled += 1;
            guide.lastimport = new Date().toISOString(); },
        verifyGuideRating: function (song) {
            if(!song.guiderated) { return; }
            var gvals = song.guiderated.split(";").slice(1);
            var chg = gdflds.find((fld, idx) =>
                String(song[fld]) !== gvals[idx]);
            if(chg) {
                console.log("Removed guiderated due to changed " + chg);
                delete song.guiderated; } }
    };  //end returned gdutil functions
    }());


    function ratimp (pu, ignore /*req*/, res) {
        var guide; var gdat; [guide, gdat] = loadLocalGuideData(pu.query.gid);
        if(!guide) {
            return resError(res, "Guide " + pu.query.gid + " not found."); }
        guide.songcount = gdat.songcount || 0;  //verify value filled in
        guide.filled = guide.filled || 0;
        var ces = [];  //Collab entries for filled in ratings
        var dbo = db.dbo();
        Object.entries(dbo.songs).forEach(function ([p, s]) {
            if(isUnratedSong(s)) {
                var key = songLookupKey(s, p);
                if(key) {
                    if(gdat.songs[key] && !isUnratedSong(gdat.songs[key])) {
                        console.log("ratimp " + key);
                        gdutil.fillSong(guide, gdat.songs[key], s);
                        ces.push({ctype:"inrat", rec:pu.query.aid,
                                  src:guide.dsId,
                                  ssid:gdat.songs[key].dsId}); } } } });
        var fldsobj = {email:pu.query.email, at:pu.query.at,
                       cacts:JSON.stringify(ces)};
        return hubPostFields(res, "collabs", function () {
            db.writeDatabaseObject();  //record updated ratings
            db.writeConfigurationFile();  //save updated guide info
            return JSON.stringify([guide, dbo]); },
                             fldsobj);
    }


    function gdclear (pu, ignore /*req*/, res) {
        var gid = pu.query.gid;
        Object.values(db.dbo().songs).forEach(function (s) {
            if(s.guiderated && s.guiderated.startsWith(gid)) {
                s.el = 49;
                s.al = 49;
                s.rv = 5;
                s.kws = "";
                delete s.guiderated; } });
        db.writeDatabaseObject();  //record updated ratings
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(db.dbo()));
    }


    return {
        //server utilities
        verifyDefaultAccount: function (conf) { verifyDefaultAccount(conf); },
        isIgnoreDir: function (ws, dn) { return isIgnoreDir(ws, dn); },
        verifyGuideRating: function (song) { gdutil.verifyGuideRating(song); },
        //server endpoints
        acctsinfo: function (req, res) { return accountsInfo(req, res); },
        newacct: function (req, res) { return hubpost(req, res, "newacct"); },
        acctok: function (req, res) { return hubpost(req, res, "acctok"); },
        updacc: function (req, res) { return hubpost(req, res, "updacc"); },
        mailpwr: function (pu, req, res) { return mailpwr(pu, req, res); },
        hubsync: function (req, res) { return hubsync(req, res); },
        addguide: function (req, res) { return addguide(req, res); },
        guidedat: function (pu, req, res) { return guidedat(pu, req, res); },
        ratimp: function (pu, req, res) { return ratimp(pu, req, res); },
        gdclear: function (pu, req, res) { return gdclear(pu, req, res); }
    };
}());
