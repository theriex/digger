/*jslint node, white, unordered, long */

var path = require("path");
var hub = require("./server/hub");
var db = require("./server/db");
try {
db.init(function (conf) {
    var nodestatic = require("node-static");
    //Not specifying any header options here, default caching is one hour.
    var fileserver = new nodestatic.Server(path.join(db.appdir(), "docroot"));
    var plat = require("os").platform();
    var websrv = {};

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


    function launchBrowser (conf, plat) {
        var digurl = "http://localhost:" + conf.port +
            "?cb=" + db.diggerVersion();  //browsers cache everything
        var sd = conf.spawn && conf.spawn[plat];
        if(!sd) {
            console.log("No command to open a default browser on " + plat);
            console.log("Open a browser and go to " + digurl);
            return; }
        //Launching Safari results in an options.env field being added, so
        //make a copy of sd to avoid writeback into .digger_config.json
        sd = JSON.parse(JSON.stringify(sd));
        sd.args = sd.args.map((arg) =>
            arg.replace(/DIGGERURL/g, digurl));
        console.log(sd.command + " " + sd.args.join(" "));
        //Yield a sec to give any higher prio setup a chance
        setTimeout(function () {
            const { spawn } = require("child_process");
            const proc = spawn(sd.command, sd.args, sd.options);
            proc.on("error", function (err) {
                console.log("Opening a browser failed. " + err);
                console.log("Open a browser and go to " + digurl +
                            " to listen."); }); },
                   800);
    }


    function stopServer () {
        console.log("Server stopping.");
        process.kill(process.pid, "SIGTERM");
    }


    function createWebServer () {
        websrv.server = require("http").createServer(function (req, rsp) {
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
            case "/createmusf": hub.createmusf(req, rsp); break;
            case "/mfcontrib": hub.mfcontrib(req, rsp); break;
            case "/mfclear": hub.mfclear(req, rsp); break;
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
                        case "/audio": db.audio(pu, req, rsp); break;
                        case "/exitnow": stopServer(); break;
                        default:
                            fileserver.serve(req, rsp); }
                    } catch(geterr) {
                        console.error(geterr); }
                }).resume(); }
        } catch(posterr) {
            console.error(posterr); } });
        return websrv.server;
    }


    function startWebServer () {
        if(!websrv.server) {
            createWebServer(); }
        websrv.server.listen(conf.port, function () {
            console.log("Digger " + db.diggerVersion() +
                        " running at http://localhost:" + conf.port);
            launchBrowser(conf, plat); });
    }


    process.on("uncaughtException", function (err) {
        if(err.code === "EADDRINUSE") {  //previous instance running
            if(!websrv.restart) {
                websrv.restart = setTimeout(function () {
                    console.log("Previous webserver still running...");
                    require("node-fetch")("http://localhost:" + conf.port +
                                          "/exitnow")
                        .then(function () {
                            console.log("exitnow actually returned..."); })
                        .catch(function () {
                            console.log("fetch exitnow failed as expected.");
                            startWebServer(); }); }, 400); } }
        else {
            console.log("process uncaughtException: " + err);
            console.log(JSON.stringify(err)); }
    });
    startWebServer();
});
} catch(crash) {
    console.log("--------");
    console.log("Digger crashed. " + crash);
    console.log(crash.stack);  //defined for Error object exceptions
    console.log("--------");
    console.log("It would be greatly appreciated if you would copy the above info and mail it to support@diggerhub.com");
    //the console window immediately disappears on windows.  Prompt to
    //hold it open so the user has a chance to read and email the err.
    const readline = require("readline");
    const rl = readline.createInterface({input: process.stdin,
                                         output: process.stdout});
    rl.question("\n", function (ignore) {
        process.exit(1); });
}
