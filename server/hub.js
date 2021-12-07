/*jslint node, white, long, unordered */

const formidable = require("formidable");
const db = require("./db.js");
const fetch = require("node-fetch");
const dhdefs = require("./dhdefs.js");

module.exports = (function () {
    "use strict";

    var eec = {};  //endpoint error contexts
    var hs = "https://diggerhub.com";
    //var hs = "http://localhost:8080";


    //A serialized array of songs can still run foul of web security rules
    //due to paths or titles with multiple paren expressions.  DiggerHub
    //json.loads will translate escaped paren values back into parens.
    function safeTransmitJSON (ob) {
        ob = JSON.stringify(ob);
        ob = ob.replace(/\(/g, "\\28");
        ob = ob.replace(/\)/g, "\\29");
        return ob;
    }


    function verifyDefaultAccount (conf) {
        conf.acctsinfo = conf.acctsinfo || {currid:"", accts:[]};
        if(!conf.acctsinfo.accts.find((x) => x.dsId === "101")) {
            const diggerbday = "2019-10-11T00:00:00Z";
            conf.acctsinfo.accts.push(
                {dsType:"DigAcc", dsId:"101", firstname:"Digger",
                 created:diggerbday, modified:diggerbday + ";1",
                 email:"support@diggerhub.com", token:"none",
                 kwdefs:dhdefs.initialKeywords(),
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
                eec[apiname] = eec[apiname] || {};
                if(ctx.code !== 200) {
                    console.log("Failed command interactive equivalent:");
                    console.log("curl -X POST -d \"" + ctx.rqs.body + "\"");
                    eec[apiname].errcode = ctx.code;
                    eec[apiname].errtxt = btxt;
                    return resError(res, btxt, ctx.code); }
                eec[apiname].errcode = 0;
                eec[apiname].errtxt = "";
                ctx.restext = btxt;
                if(procf) {  //local server side effects like writing data
                    ctx.restext = procf(btxt, ctx.reqflds) || ctx.restext; }
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(ctx.restext); })
            .catch(function (err) {
                console.log(err.stack);
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


    function createmusf (req, res) {
        return hubpost(req, res, "createmusf", function (hubret) {
            noteUpdatedAccount(hubret); });
    }


    //The application wants all the local data uploaded to the hub as fast
    //as possible, but the hub does substantial work to look up each song
    //and then write it to the db if not found.  The array of songs being
    //passed as an encoded parameter also has a tendency to trigger web
    //server security rules looking for malicious penetration testing.
    //Sending 200 songs made triggering a server rejection a near certainty
    //01oct21.  100 is still heavy and relatively risky.  50 just emphasizes
    //how long the uploads are taking.  Even 32 songs at a time is not
    //enough to avoid trigggering a security rule regex match.  Once a rule
    //has been tripped, sending the same data again is instantly rejected.
    //The best approach seems to be to start with just a single song, then
    //scale up to a reasonable max on continued success.
    //03dec21: Security rules seem to be triggered by parenthetical
    //expressions, especially two in a row e.g. "Song (Official) (1).mp3"
    //Since uplds is an array of simple objects, escape all parens.
    function mfcontrib (req, res) {
        var fif = new formidable.IncomingForm();
        eec.mfcontrib = eec.mfcontrib || {};
        if(eec.mfcontrib.errcode) { eec.mfcontrib.cleared = 0; }
        if(!eec.mfcontrib.cleared) { eec.mfcontrib.cleared = 0; }
        if(!eec.mfcontrib.maxupld) { eec.mfcontrib.maxupld = 32; }
        fif.parse(req, function (err, fields) {
            var uplds = []; var ctx = eec.mfcontrib;
            var maxupld = Math.min(((ctx.cleared * ctx.cleared) + 1),
                                   ctx.maxupld);
            if(err) {
                return resError(res, "mfcontrib form error: " + err); }
            ctx.cleared += 1;
            Object.entries(db.dbo().songs).forEach(function ([p, s]) {
                if(uplds.length < maxupld && !s.dsId &&
                   s.ti && s.ar && (!s.fq || !(s.fq.startsWith("D") ||
                                               s.fq.startsWith("U")))) {
                    s.path = p;
                    uplds.push(s); } });
            if(uplds.length > 0) {
                fields.uplds = safeTransmitJSON(uplds); }
            return hubPostFields(res, "mfcontrib", function (hubret) {
                    var dbo = db.dbo();
                    noteUpdatedAccount(hubret);
                    console.log("mfcontrib updated account");
                    JSON.parse(hubret).slice(1).forEach(function (s) {
                        updateLocalSong(dbo, s); });
                    db.writeDatabaseObject(); },
                                 fields); });
    }


    function mfclear (req, res) {
        var fif = new formidable.IncomingForm();
        fif.parse(req, function (err, fields) {
            if(err) {
                return resError(res, "mfclear form error: " + err); }
            return hubPostFields(res, "mfclear", function (hubret) {
                var dbo = db.dbo();
                JSON.parse(hubret).forEach(function (s) {
                    updateLocalSong(dbo, s); });
                db.writeDatabaseObject(); },
                                 fields); });
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
        createmusf: function (req, res) { return createmusf(req, res); },
        mfcontrib: function (req, res) { return mfcontrib(req, res); },
        mfclear: function (req, res) { return mfclear(req, res); }
    };
}());
