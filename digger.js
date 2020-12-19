/*jslint node, white, fudge */

var db = require("./server/db");
db.init();

var nodestatic = require("node-static");
var fileserver = new nodestatic.Server("./docroot");
var portnum = 6980;
var quieturls = ["/songscount", "/mergestat"];

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
}).listen(portnum);


//open a browser tab to avoid having to do that manually
setTimeout(function () {
    const { spawn } = require("child_process");
    //On MacOS, Safari has the best support for multiple media file types,
    //so it is helpful to open it automatically to kick off some tunes
    //immediately on launch.  With Catalina 10.15.7
    // spawn("open", ["-a", "/Applications/Safari.app",
    //                "http://localhost:" + portnum],
    //       {stdio:"ignore"});
    //causes both safari and the default browser to open the url, which
    //is annoying.  This needs to be replaced.
    spawn("open", ["-a", "/Applications/Safari.app"],
          {stdio:"ignore"});
}, 800);
