/*jslint node, white, long, unordered, for */

const formidable = require("formidable");
const db = require("./db.js");
const fetch = require("node-fetch");

module.exports = (function () {
    "use strict";

    var eec = {};  //endpoint error contexts
    var hs = "https://diggerhub.com";
    //var hs = "http://localhost:8080";


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


    function safeSongFieldValue (s, f, t) {
        var val = s[f];
        if(typeof val !== "string") {
            console.log("safeSongFieldValue correcting " + f + " field for '" +
                        t + "' Song " + s.dsId + " ti: " + s.ti + ", ar: " +
                        s.ar + ", ab: " + s.ab);
            val = String(val);
            if(val === "undefined") {
                const dflts = {ti:"Unknown", ar:"Unknown", ab:"Singles"};
                val = dflts[f] || "Bad Field"; } }
        return val;
    }


    function songFieldComp (a, b, f) {
        var af = safeSongFieldValue(a, f, "a");
        var bf = safeSongFieldValue(b, f, "b");
        //Definitely need case-insensitive to match database storage.
        //Probably best to be lenient about accents also.
        return af.localeCompare(bf, undefined, {sensitivity:"base"}) === 0;
    }


    function updateLocalSong (dbo, s) {
        var vc = "Upd";
        var ls = dbo.songs[s.path];
        if(!ls) {  //song was last updated from some other setup
            vc = "Map";
            ls = Object.values(dbo.songs).find((x) =>
                ((x.dsId === s.dsId) ||
                 (songFieldComp(x, s, "ti") &&
                  songFieldComp(x, s, "ar") &&
                  songFieldComp(x, s, "ab")))); }
        if(!ls) {  //new song from some other setup
            vc = "Nmp";  //not mapped.  Deleted file or bad metadata.
            ls = s; }
        const flds = ["modified", "dsId", "rv", "al", "el", "kws", "nt"];
        if(!(ls.fq.startsWith("D") || ls.fq.startsWith("U"))) {
            flds.push("fq"); }
        flds.forEach(function (fld) { ls[fld] = s[fld]; });
        console.log("updls " + vc + " " + ls.dsId + ": " + ls.path);
        return ls;
    }


    function processReceivedSyncData (updates) {
        var i;
        updates = JSON.parse(updates);
        updates[0].diggerVersion = db.diggerVersion();
        const updacc = JSON.parse(JSON.stringify(updates[0]));
        deserializeAccountFields(updacc);  //safely deserialize copy
        writeUpdatedAccount(updacc);  //reflect modified timestamp
        if(updates.length > 1) {
            const dbo = db.dbo();
            for(i = 1; i < updates.length; i += 1) {
                try {
                    updates[i] = updateLocalSong(dbo, updates[i]);
                } catch(e) {
                    console.log("prsd updateLocalSong failure: " + e +
                                " (song " + updates[i].dsId + " ti: " +
                                updates[i].ti + ", ar: " + updates[i].ar +
                                ", ab: " + updates[i].ab + ")"); } }
            console.log("prsd finished writing " + (i - 1) + " songs");
            db.writeDatabaseObject(); }
        updates = JSON.stringify(updates);
        return updates;
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


    function isIgnorableError (res, err, apiname) {
        if(String(err).indexOf("ENOTFOUND")) {
            console.log(apiname + " offline");
            res.writeHead(400, {"Content-Type": "text/plain"});
            res.end(apiname + " offline");
            return true; }
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
                if(isIgnorableError(res, err, apiname)) { return; }
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


    function fangrpact (req, res) {
        return hubpost(req, res, "fangrpact", function (hubret) {
            //make sure updated account gets written in case app fails.
            noteUpdatedAccount(hubret); });
    }


    function fancollab (req, res) {
        return hubpost(req, res, "fancollab", function (hubret) {
            //note updated account and any songs with it
            processReceivedSyncData(hubret); });
    }


    function fanmsg (req, res) {
        return hubpost(req, res, "fanmsg", function (msgs) {
            msgs = JSON.parse(msgs);
            console.log(String(msgs.length) + " messages received"); });
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
        verifyFanRating: function (song) {
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
        verifyFanRating: function (s) { gdutil.verifyFanRating(s); },
        //server endpoints
        acctsinfo: function (req, res) { return accountsInfo(req, res); },
        newacct: function (req, res) { return hubpost(req, res, "newacct"); },
        acctok: function (req, res) { return hubpost(req, res, "acctok"); },
        updacc: function (req, res) { return hubpost(req, res, "updacc"); },
        deleteme: function (req, res) { return hubpost(req, res, "deleteme"); },
        mailpwr: function (pu, req, res) { return mailpwr(pu, req, res); },
        hubsync: function (req, res) { return hubsync(req, res); },
        fangrpact: function (req, res) { return fangrpact(req, res); },
        fancollab: function (req, res) { return fancollab(req, res); },
        fanmsg: function (req, res) { return fanmsg(req, res); }
    };
}());
