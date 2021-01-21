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
                 email:"support@digger.com", token:"none",
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


    function ignoreFolders (req, res) {
        var fif = new formidable.IncomingForm();
        fif.parse(req, function (err, fields) {
            if(err) {
                return resError(res, 400, "ignoreFolders form error " + err); }
            var curracct = getCurrentAccount();
            if(fields.ignoredirs) {  //data passed in. updating.
                //The ignore folders take effect when files are next read.
                //The read process marks all songs as deleted and then unmarks
                //them as they are found, so songs in ignored folders will 
                //either not be created, or left marked as deleted.
                curracct.igfolds = JSON.parse(fields.ignoredirs);
                db.writeConfigurationFile(); }
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify({musicPath:db.conf().musicPath,
                                    ignoredirs:curracct.igfolds})); });
    }


    function keywordDefinitions (req, res) {
        var updat = new formidable.IncomingForm();
        updat.parse(req, function (err, fields) {
            if(err) {
                console.log("updateKeywords form error: " + err); }
            var curracct = getCurrentAccount();
            if(fields.kwdefs) {  //data passed in. updating
                curracct.kwdefs = JSON.parse(fields.kwdefs);
                db.writeConfigurationFile(); }
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify({kwdefs:curracct.kwdefs})); });
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


    return {
        //server utilities
        verifyDefaultAccount: function (conf) { verifyDefaultAccount(conf); },
        isIgnoreDir: function (ws, dn) { return isIgnoreDir(ws, dn); },
        //server endpoints
        acctsinfo: function (req, res) { return accountsInfo(req, res); },
        igfolders: function (req, res) { return ignoreFolders(req, res); },
        keywords: function (req, res) { return keywordDefinitions(req, res); },
        newacct: function (req, res) { return hubfwd("newacct", req, res); },
        acctok: function (req, res) { return hubfwd("acctok", req, res); },
        updacc: function (req, res) { return hubfwd("updacc", req, res); }
    };
}());
