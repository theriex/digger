/*jslint node, white, fudge */

var db = require("./server/db");
db.init(function (conf) {
    var nodestatic = require("node-static");
    var fileserver = new nodestatic.Server("./docroot");

    function params2Obj (str) {
        var po = {};
        var avs = str.split("&");
        avs.forEach(function (av) {
            av = av.split("=");
            po[av[0]] = decodeURIComponent(av[1]); });
        return po;
    }

    function parsedURL (url) {
        var pu = {};
        url = url.split("?");
        pu.baseurl = url[0];
        if(url.length > 1) {
            url = url[1].split("#");
            pu.query = params2Obj(url[0]);
            if(url.length > 1) {
                pu.hash = params2Obj(url[1]); } }
        return pu;
    }

    //start the server
    require("http").createServer(function (request, response) {
        var quieturls = ["/songscount", "/mergestat"];
        var pu = parsedURL(request.url);
        if(!quieturls.includes(pu.baseurl)) {
            console.log(request.url); }
        switch(pu.baseurl) {
        //POST requests (with optional GET support):
        case "/mergefile": db.mergefile(request, response); break;
        case "/songupd": db.songupd(request, response); break;
        case "/keywdsupd": db.keysupd(request, response); break;
        case "/plistexp": db.plistexp(request, response); break;
        default: //handle after request is fully stabilized
            request.addListener("end", function () {
                //GET requests:
                switch(pu.baseurl) {
                case "/config": db.config(request, response); break;
                case "/dbo": db.dbo(request, response); break;
                case "/dbread": db.dbread(request, response); break;
                case "/songscount": db.songscount(request, response); break;
                case "/mergestat": db.mergestat(request, response); break;
                case "/audio":
                    fileserver.serveFile(db.copyaudio(pu.query.path),
                                         200, {}, request, response);
                    break;
                default:
                    fileserver.serve(request, response); }
            }).resume(); }
    }).listen(conf.port);

    var sd = conf.spawn && conf.spawn[require("os").platform()];
    if(sd) {
        setTimeout(function () {
            const { spawn } = require("child_process");
            spawn(sd.command, sd.args, sd.options); }, 800); }
});
