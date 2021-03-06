/*jslint node, white, unordered */

var path = require("path");
var hub = require("./server/hub");
var db = require("./server/db");
db.init(function (conf) {
    var nodestatic = require("node-static");
    //Not specifying any header options here, default caching is one hour.
    var fileserver = new nodestatic.Server(path.join(db.appdir(), "docroot"));
    var sd = conf.spawn && conf.spawn[require("os").platform()];

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

    //If a server is already running on a given port, the server throws.  If
    //you closed the browser, and then clicked the digger app to get the
    //interface back, then the server throw needs to be caught so the spawn
    //command has a chance to execute before the process exits.  If there
    //is a catastrophic failure from some REST endpoint it is also better
    //to keep going.  So just catch it all.
    process.on("uncaughtException", function (err) {
        console.log("uncaughtException: " + err);
    });

    //start the server
    require("http").createServer(function (req, rsp) {
        try {
            const quieturls = ["/songscount", "/mergestat"];
            const pu = parsedURL(req.url);
            if(!quieturls.includes(pu.baseurl)) {
                console.log(req.url); }
            //POST requests (with optional GET support):
            switch(pu.baseurl) {
            case "/mergefile": db.mergefile(req, rsp); break;
            case "/songupd": db.songupd(req, rsp); break;
            case "/plistexp": db.plistexp(req, rsp); break;
            case "/cfgchg": db.cfgchg(req, rsp); break;
            case "/acctsinfo": hub.acctsinfo(req, rsp); break;
            case "/newacct": hub.newacct(req, rsp); break;
            case "/acctok": hub.acctok(req, rsp); break;
            case "/updacc": hub.updacc(req, rsp); break;
            case "/hubsync": hub.hubsync(req, rsp); break;
            case "/addmusf": hub.addmusf(req, rsp); break;
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
                        case "/mailpwr": hub.mailpwr(pu, req, rsp); break;
                        case "/musfdat": hub.musfdat(pu, req, rsp); break;
                        case "/ratimp": hub.ratimp(pu, req, rsp); break;
                        case "/gdclear": hub.gdclear(pu, req, rsp); break;
                        case "/audio": db.audio(pu, req, rsp); break;
                        default:
                            fileserver.serve(req, rsp); }
                    } catch(geterr) {
                        console.error(geterr); }
                }).resume(); }
        } catch(posterr) {
            console.error(posterr); }
    }).listen(conf.port);

    console.log("Digger running at http://localhost:" + conf.port);

    if(sd) {
        console.log(sd.command + " " + sd.args.join(" "));
        //Launching Safari results in an options.env field being added, so
        //make a copy of sd to avoid writeback into .digger_config.json
        sd = JSON.parse(JSON.stringify(sd));
        setTimeout(function () {
            const { spawn } = require("child_process");
            spawn(sd.command, sd.args, sd.options); }, 800); }
});
