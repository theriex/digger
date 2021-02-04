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
            conf.acctsinfo.accts.push(
                {dsType:"DigAcc", dsId:"101", firstname:"Digger",
                 email:"support@diggerhub.com", token:"none",
                 kwdefs:initkwds, igfolds:["Ableton", "GarageBand"]}); }
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
            dbo[s.path] = ls; }
        var flds = ["modified", "dsId", "rv", "al", "el", "kws", "nt"];
        if(!(ls.fq.startsWith("D") || ls.fq.startsWith("U"))) {
            flds.push("fq"); }
        flds.forEach(function (fld) { ls[fld] = s[fld]; });
        console.log("writing updated song " + s.path);
        return ls;
    }


    function processReceivedSyncData (updates) {
        updates = JSON.parse(updates);
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
    }


    function noteUpdatedAccount (accts) {
        accts = JSON.parse(accts);
        deserializeAccountFields(accts[0]);
        writeUpdatedAccount(accts[0]);
    }


    function getLocalGuideData (gid) {
        var gdf = path.join(db.conf().cachePath, "guide_" + gid + ".json");
        if(db.fileExists(gdf)) {
            return JSON.parse(db.readFile(gdf)); }
        return {version:db.diggerVersion(),
                lastrating:"",   //most recent song rating by guide
                lastcheck:"",    //last GET time, === lastrating if more
                lastimport:"",   //when latest import was done
                filled:0,        //how many ratings were filled from this guide
                songcount:0,     //total songs from this guide
                songs:{}};       //canonicalsongname:songdata
    }


    function songLookupKey (s) {
        var key = s.ti + s.ar + s.ab;
        return key.toLowerCase();
    }


    function isUnratedSong (s) {
        return (!s.kws && s.el === 49 && s.al === 49);
    }


    function mergeWriteGuideData(sdat, hubret, gid) {
        var songs = JSON.parse(hubret);

        var rp = path.join(db.conf().cachePath, "guide_" + gid + "raw.json");
        db.writeFile(rp, JSON.stringify(songs, null, 2));

        var mergelog = "";

        console.log("mergeWriteGuideData merging " + songs.length + " songs.");
        songs.forEach(function (s) {
            var key = songLookupKey(s);
            if(!sdat.songs[key]) {
                mergelog += "adding " + key + "\n";
                sdat.songcount += 1; }
            else {
                mergelog += "merged " + key + "\n"; }
            sdat.songs[key] = s;
            if(s.modified > sdat.lastrating) {
                sdat.lastrating = s.modified; } });

        var mp = path.join(db.conf().cachePath, "guide_" + gid + "merge.txt");
        db.writeFile(mp, mergelog);
        
        if(songs.length < 1000) {  //got all the songs from this guide
            sdat.lastcheck = new Date().toISOString(); }
        else {  //need to fetch more
            sdat.lastcheck = sdat.lastrating; }
        var gdf = path.join(db.conf().cachePath, "guide_" + gid + ".json");
        db.writeFile(gdf, JSON.stringify(sdat, null, 2));
        return sdat;
    }


    function resError (res, code, msg) {
        console.log("hub resError " + code + ": " + msg);
        res.writeHead(code, {"Content-Type": "text/plain"});
        res.end(msg);
    }


    function hubpost (req, res, apiname, procf) {
        var fif = new formidable.IncomingForm();
        fif.parse(req, function (err, fields) {
            if(err) {
                return resError(res, 400, apiname + " form error: " + err); }
            var ctx = {reqflds: fields,
                       url:hs + "/api/" + apiname,
                       rqs:{method:"POST",
                            headers:{"Content-Type":
                                     "application/x-www-form-urlencoded"},
                            body:bodify(fields)}};
            console.log(apiname + " -> " + ctx.url);
            fetch(ctx.url, ctx.rqs)
                .then(function (hubr) {
                    ctx.code = hubr.status;
                    return hubr.text(); })
                .then(function (btxt) {
                    if(ctx.code !== 200) {
                        return resError(res, ctx.code, btxt); }
                    ctx.restext = btxt;
                    if(procf) {  //local server side effects like writing data
                        procf(btxt, ctx.reqflds); }
                    res.writeHead(200, {"Content-Type": "application/json"});
                    res.end(btxt); })
                .catch(function (err) {
                    if(ctx.restext) {
                        console.log("ctx.restext: " + ctx.restext); }
                    if(ctx.code === 200) {
                        ctx.code = 400; }
                    resError(res, (ctx.code || 400), 
                             "call to " + ctx.url + " failed: " + err); }); });
    }


    function hubget (apiname, params, res, procf) {
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
                    return resError(res, ctx.code, btxt); }
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
                resError(res, (ctx.code || 400), 
                         "call to get " + apiname + " failed: " + err); });
    }


    //////////////////////////////////////////////////
    //API endpoint functions:

    function accountsInfo (req, res) {
        var fif = new formidable.IncomingForm();
        fif.parse(req, function (err, fields) {
            if(err) {
                return resError(res, 400, "accountsInfo form error " + err); }
            var conf = db.conf();
            conf.acctsinfo = conf.acctsinfo || {currid:0, accts:[]};
            if(fields.acctsinfo) {  //data passed in. update.
                conf.acctsinfo = JSON.parse(fields.acctsinfo);
                db.writeConfigurationFile(); }
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify(conf.acctsinfo)); });
    }


    function hubsync (req, res) {
        //see ../docroot/docs/hubsyncNotes.txt
        return hubpost(req, res, "hubsync", function (hubret) {
            processReceivedSyncData(hubret); });
    }


    function addguide (req, res) {
        return hubpost(req, res, "addguide", function (hubret) {
            noteUpdatedAccount(hubret); });
    }


    function guidedat (pu, ignore /*req*/, res) {
        if(!pu.query.gid) {
            return resError(res, 400, "gid parameter required."); }
        var gdat = getLocalGuideData(pu.query.gid);
        var params = {email:pu.query.email, at:pu.query.at, gid:pu.query.gid,
                      since:gdat.lastcheck};
        return hubget("guidedat", params, res, function (hubret) {
            gdat = mergeWriteGuideData(gdat, hubret, pu.query.gid);
            return JSON.stringify({lastrating:gdat.lastrating,
                                   lastcheck:gdat.lastcheck}); });
    }


    function ratimp (pu, ignore /*req*/, res) {
        if(!pu.query.gid) {
            return resError(res, 400, "gid parameter required."); }
        var gdat = getLocalGuideData(pu.query.gid);
        var dbo = db.dbo();
        Object.values(dbo.songs).forEach(function (s) {
            if(isUnratedSong(s)) {
                var key = songLookupKey(s);
                if(gdat[key] && isUnratedSong(gdat[key])) {
                    gdat.filled += 1;
                    gdat.lastimport = new Date().toISOString();
                    var copyfields = ["el", "al", "kws", "rv"];
                    copyfields.forEach(function (cf) {
                        s[cf] = gdat[key][cf]; }); } } });
        db.writeDatabaseObject();
        return JSON.stringify([{lastimport:gdat.lastimport,
                                filled:gdat.filled},
                              dbo]);
    }


    return {
        //server utilities
        verifyDefaultAccount: function (conf) { verifyDefaultAccount(conf); },
        isIgnoreDir: function (ws, dn) { return isIgnoreDir(ws, dn); },
        //server endpoints
        acctsinfo: function (req, res) { return accountsInfo(req, res); },
        newacct: function (req, res) { return hubpost(req, res, "newacct"); },
        acctok: function (req, res) { return hubpost(req, res, "acctok"); },
        updacc: function (req, res) { return hubpost(req, res, "updacc"); },
        hubsync: function (req, res) { return hubsync(req, res); },
        addguide: function (req, res) { return addguide(req, res); },
        guidedat: function (pu, req, res) { return guidedat(pu, req, res); },
        ratimp: function (pu, req, res) { return ratimp(pu, req, res); }
    };
}());
