/*jslint node, white, fudge, long */

module.exports = (function () {
    "use strict";

    var db = require("./db");
    var formidable = require("formidable");
    const fetch = require("node-fetch");
    var hs = "https://diggerhub.com";
    //var hs = "http://localhost:8080";


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
        acctsinfo: function (req, res) { return accountsInfo(req, res); },
        newacct: function (req, res) { return hubfwd("newacct", req, res); },
        acctok: function (req, res) { return hubfwd("acctok", req, res); },
        updacc: function (req, res) { return hubfwd("updacc", req, res); }
    };
}());
