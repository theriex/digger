/*jslint node, white, fudge, long */

module.exports = (function () {
    "use strict";

    var db = require("./db");
    var formidable = require("formidable");
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
        var sfs = ["kwdefs", "igfolds", "settings"];
        sfs.forEach(function (sf) {
            //console.log("parsing " + sf + ": " + acct[sf]);
            acct[sf] = JSON.parse(acct[sf]); });
    }


    function processReceivedSyncData (updates) {
        updates = JSON.parse(updates);
        var updacc = updates[0];
        deserializeAccountFields(updacc);
        //always write the updated account to reflect the modified timestamp
        var accts = db.conf().acctsinfo.accts;
        var aidx = accts.findIndex((a) => a.dsId === updacc.dsId);
        updacc.token = accts[aidx].token;
        accts[aidx] = updacc;
        db.writeConfigurationFile();
        //write any returned updated songs
        var updsongs = updates.slice(1);  //zero or more newer songs
        if(updsongs.length) {
            var dbo = db.dbo();
            updsongs.forEach(function (s) {
                console.log("writing updated song " + s.path);
                dbo.songs[s.path] = s; });
            db.writeDatabaseObject(); }
    }


    function resError (res, code, msg) {
        console.log("hub resError " + code + ": " + msg);
        res.writeHead(code, {"Content-Type": "text/plain"});
        res.end(msg);
    }


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


    function hubfwd (endpoint, req, res) {
        var fif = new formidable.IncomingForm();
        fif.parse(req, function (err, fields) {
            if(err) {
                return resError(res, 400, "hubfwd form error: " + err); }
            var ctx = {url:hs + "/api/" + endpoint,
                       rqs:{method:"POST",
                            headers:{"Content-Type":
                                     "application/x-www-form-urlencoded"},
                            body:bodify(fields)}};
            console.log("hubfwd -> " + ctx.url);
            fetch(ctx.url, ctx.rqs)
                .then(function (hubr) {
                    ctx.code = hubr.status;
                    return hubr.text(); })
                .then(function (btxt) {
                    if(ctx.code !== 200) {
                        return resError(res, ctx.code, btxt); }
                    res.writeHead(200, {"Content-Type": "application/json"});
                    res.end(btxt); })
                .catch(function (err) {
                    resError(res, 400, "call to " + ctx.url + " failed: "
                             + err); }); });
    }


    function hubsync (req, res) {
        var fif = new formidable.IncomingForm();
        fif.parse(req, function (err, fields) {
            if(err) {
                return resError(res, 400, "hubsync form error: " + err); }
            var ctx = {url:hs + "/api/hubsync",
                       rqs:{method:"POST",
                            headers:{"Content-Type":
                                     "application/x-www-form-urlencoded"},
                       body:bodify(fields)}};
            console.log("hubsync -> " + ctx.url);
            fetch(ctx.url, ctx.rqs)
                .then(function (hubr) {
                    ctx.code = hubr.status;
                    return hubr.text(); })
                .then(function (btxt) {
                    if(ctx.code !== 200) {
                        return resError(res, ctx.code, btxt); }
                    processReceivedSyncData(btxt);
                    res.writeHead(200, {"Content-Type": "application/json"});
                    res.end(btxt); })
                .catch(function (err) {
                    resError(res, 400, "call to " + ctx.url + " failed: "
                             + err); }); });
    }


    return {
        //server utilities
        verifyDefaultAccount: function (conf) { verifyDefaultAccount(conf); },
        isIgnoreDir: function (ws, dn) { return isIgnoreDir(ws, dn); },
        //server endpoints
        acctsinfo: function (req, res) { return accountsInfo(req, res); },
        newacct: function (req, res) { return hubfwd("newacct", req, res); },
        acctok: function (req, res) { return hubfwd("acctok", req, res); },
        updacc: function (req, res) { return hubfwd("updacc", req, res); },
        hubsync: function (req, res) { return hubsync(req, res); }
    };
}());
