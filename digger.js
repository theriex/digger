/*jslint node, white, fudge */

var path = require("path");
var hub = require("./server/hub");
var db = require("./server/db");
db.init(function (conf) {
    var nodestatic = require("node-static");
    var fileserver = new nodestatic.Server(path.join(db.appdir(), "docroot"));

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
    require("http").createServer(function (req, rsp) {
        try {
            var quieturls = ["/songscount", "/mergestat"];
            var pu = parsedURL(req.url);
            if(!quieturls.includes(pu.baseurl)) {
                console.log(req.url); }
            //POST requests (with optional GET support):
            switch(pu.baseurl) {
            case "/mergefile": db.mergefile(req, rsp); break;
            case "/songupd": db.songupd(req, rsp); break;
            case "/plistexp": db.plistexp(req, rsp); break;
            case "/acctsinfo": hub.acctsinfo(req, rsp); break;
            case "/newacct": hub.newacct(req, rsp); break;
            case "/acctok": hub.acctok(req, rsp); break;
            case "/updacc": hub.updacc(req, rsp); break;
            default: //handle after request is fully stabilized
                req.addListener("end", function () {
                    //GET requests:
                    try {
                        switch(pu.baseurl) {
                        case "/version": db.version(req, rsp); break;
                        case "/config": db.config(req, rsp); break;
                        case "/startdata": db.startdata(req, rsp); break;
                        case "/dbread": db.dbread(req, rsp); break;
                        case "/songscount": db.songscount(req, rsp); break;
                        case "/mergestat": db.mergestat(req, rsp); break;
                        case "/audio": db.audio(pu, req, rsp); break;
                        default:
                            fileserver.serve(req, rsp); }
                    } catch(geterr) {
                        console.error(geterr); }
                }).resume(); }
        } catch(posterr) {
            console.error(posterr); }
    }).listen(conf.port);

    var sd = conf.spawn && conf.spawn[require("os").platform()];
    if(sd) {
        setTimeout(function () {
            const { spawn } = require("child_process");
            console.log("spawn: " + JSON.stringify(sd, null, 2));
            spawn(sd.command, sd.args, sd.options); }, 800); }
});
