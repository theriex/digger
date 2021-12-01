/*jslint node, white, unordered, long */

const path = require("path");
const hub = require("./server/hub");
const db = require("./server/db");
const plat = require("os").platform();
const nodestatic = require("node-static");
const { spawn } = require("child_process");
const http = require("http");
const fetch = require("node-fetch");
const readline = require("readline");

try {
db.init(function (conf) {
    //Not specifying any header options here, default caching is one hour.
    var fileserver = new nodestatic.Server(path.join(db.appdir(), "docroot"));
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


    function alternateCommand (sd, plat) {
        websrv.aci = websrv.aci || 0;  //alt command index
        if(plat === "win32") {
            websrv.wdir = process.env.SYSTEMROOT || "C:\\Windows";
            websrv.wsys = websrv.wdir + "\\System32"; }
        const acs = {
            win32: [
                {command:websrv.wdir + "\\explorer.exe",
                 args:[websrv.digurl]},  //options left undefined
                {command:websrv.wsys + "\\WindowsPowerShell\\v1.0\\powershell",
                 args:["Start", websrv.digurl]}  //options left undefined
                ]};
        sd = null;
        const fallbacks = acs[plat];
        if(fallbacks && websrv.aci < fallbacks.length) {
            sd = fallbacks[websrv.aci];
            websrv.aci += 1; }
        return sd;
    }


    function launchNow (sd, plat) {
        console.log(sd.command + " " + sd.args.join(" "));
        const proc = spawn(sd.command, sd.args, sd.options);
        proc.on("error", function (err) {
            console.log(err);
            sd = alternateCommand(sd, plat);
            if(sd) {
                launchNow(sd, plat); }
            else {
                console.log("Open a browser and go to " + websrv.digurl); } });
    }


    function launchBrowser (conf, plat) {
        var sd = conf.spawn && conf.spawn[plat];
        if(!sd) {
            console.log("No command to open a default browser on " + plat);
            console.log("Digger available at " + websrv.digurl);
            return; }
        //Launching Safari results in an options.env field being added, so
        //make a copy of sd to avoid writeback into .digger_config.json
        sd = JSON.parse(JSON.stringify(sd));
        sd.args = sd.args.map((arg) =>
            arg.replace(/DIGGERURL/g, websrv.digurl));
        //Yield a sec to give any higher prio setup a chance
        websrv.blaunch = setTimeout(function () {
            launchNow(sd, plat); }, 800);
    }


    function stopServer () {
        console.log("Server stopping.");
        process.kill(process.pid, "SIGTERM");
    }


    function createWebServer () {
        websrv.server = http.createServer(function (req, rsp) {
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


    function startWebServer (text) {
        if(!websrv.digurl) {
            //No '=' in launch URL because that would need to be quoted if
            //being interpreted via windows command. The result is the spawned
            //browser process reports a successful start but does nothing.
            //Essentially this URL passes the version as an attribute with
            //an undefined value.  Enough to trigger a cache bust. 30nov21
            websrv.digurl = "http://localhost:" + conf.port +
                "?" + db.diggerVersion(); } //browsers cache everything
        if(!websrv.server) {
            createWebServer(); }
        if(!websrv.listening) {
            websrv.server.listen(conf.port, function () {
                websrv.listening = true;
                console.log("startWebServer " + text);
                console.log("Digger " + db.diggerVersion() +
                            " available at " + websrv.digurl);
                launchBrowser(conf, plat); }); }
    }


    process.on("uncaughtException", function (err) {
        if(err.code === "EADDRINUSE") {  //previous instance running
            if(!websrv.takingover) {
                websrv.takingover = true;
                setTimeout(function () {
                    console.log("Previous webserver still running...");
                    fetch("http://localhost:" + conf.port + "/exitnow")
                        .then(function () {
                            console.log("exitnow actually returned...");
                            startWebServer("exitnow success"); })
                        .catch(function () {
                            console.log("fetch exitnow failed as expected.");
                            startWebServer("exitnow fail"); }); }, 400); } }
        else {
            console.log("process uncaughtException: " + err);
            console.log(JSON.stringify(err)); }
    });

    startWebServer("normal start");

});
} catch(crash) {
    console.log("--------");
    console.log("Digger crashed. " + crash);
    console.log(crash.stack);  //defined for Error object exceptions
    console.log("--------");
    console.log("It would be greatly appreciated if you would copy the above info and mail it to support@diggerhub.com");
    //the console window immediately disappears on windows.  Prompt to
    //hold it open so the user has a chance to read and email the err.
    const rl = readline.createInterface({input: process.stdin,
                                         output: process.stdout});
    rl.question("\n", function (ignore) {
        process.exit(1); });
}
