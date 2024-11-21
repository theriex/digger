/*jslint node, white, long, unordered, for */

const formidable = require("formidable");
const fetch = require("node-fetch");

module.exports = (function () {
    "use strict";

    var hs = "https://diggerhub.com";
    //var hs = "http://localhost:8080";  //"localhost" synonymn might not work
    //var hs = "http://127.0.0.1:8080";


    function bodify (po) {  //parameters object
        return Object.entries(po).map(function ([k, v]) {
            return k + "=" + encodeURIComponent(v); })
            .join("&");
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


    function hubPostFields (res, url, fldsobj) {
        const hpup = "/hubpost-";  //hub post url prefix
        var ctx = {url:hs + "/api/" + url.slice(hpup.length),
                   rqs:{method:"POST",
                        headers:{"Content-Type":
                                 "application/x-www-form-urlencoded"},
                        body:bodify(fldsobj)}};
        console.log("hubPostFields " + ctx.url);
        fetch(ctx.url, ctx.rqs)
            .then(function (hubr) {
                ctx.code = hubr.status;
                console.log("hubPostFields hubr.status: " + hubr.status);
                return hubr.text(); })
            .then(function (btxt) {
                if(ctx.code !== 200) {
                    console.log("hubPostFields call failed " + ctx.code +
                                ": " + btxt);
                    console.log("Failed command interactive equivalent:");
                    console.log("curl -X POST -d \"" + ctx.rqs.body + "\"");
                    return resError(res, btxt, ctx.code); }
                ctx.restext = btxt;
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(ctx.restext); })
            .catch(function (err) {
                if(isIgnorableError(res, err, ctx.url)) { return; }
                console.log(err.stack);
                if(ctx.restext) {
                    console.log("ctx.restext: " + ctx.restext); }
                if(ctx.code === 200) {
                    ctx.code = 400; }
                resError(res, "POST " + ctx.url + " failed: " + err,
                         (ctx.code || 400)); });
    }
    function hubpost (req, res, pu) {
        var fif = new formidable.IncomingForm();
        fif.parse(req, function (err, fields) {  //dets.dat fields
            if(err) {
                return resError(res, pu.baseurl + " form error: " + err); }
            hubPostFields(res, req.url, fields); });
    }


    function makeCacheBustToken () {
        var iso = new Date().toISOString();
        var slug = iso.slice(2,4) + iso.slice(5,7) + iso.slice(8,10) +
            iso.slice(11,13) + iso.slice(14,16) + iso.slice(17,19);
        return slug;
    }


    function hubget (ignore/*req*/, res, pu) {
        const hgup = "/hubget-";  //hub get url prefix
        pu.query.cb = pu.query.cb || makeCacheBustToken();
        const uq = Object.entries(pu.query)
            .map(function ([a, v]) { return a + "=" + encodeURIComponent(v); })
            .join("&");
        const ctx = {url:hs + "/api/" + pu.baseurl.slice(hgub.length) +
                     "?" + uq};
        console.log("hubget " + ctx.url);
        fetch(ctx.url)
            .then(function (hubr) {
                ctx.code = hubr.status;
                return hubr.text(); })
            .then(function (btxt) {
                if(ctx.code !== 200) {
                    return resError(res, btxt, ctx.code); }
                ctx.restext = btxt;
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(ctx.restext); })
            .catch(function (err) {
                if(ctx.restext) {
                    console.log("ctx.restext: " + ctx.restext); }
                if(ctx.code === 200) {
                    ctx.code = 400; }
                resError(res, "GET " + ctx.url + " failed: " + err,
                         (ctx.code || 400)); });
    }


    return {
        passthroughHubPost: function (req, res, pu) {  //hubpost-...
            return hubpost(req, res, pu); },
        passthroughHubGet: function (req, res, pu) {  //hubget-...
            return hubget(req, res, pu); }
    };
}());
