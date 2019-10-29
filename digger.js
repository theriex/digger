/*jslint node, white, fudge */

var db = require("./server/db");
db.init();

var nodestatic = require("node-static");
var fileserver = new nodestatic.Server("./docroot");
var portnum = 6980;
var quieturls = ["/songscount", "/mergestat"];

//start the server
require("http").createServer(function (request, response) {
    if(!quieturls.includes(request.url)) {
        console.log(request.url); }
    switch(request.url) {
    case "/mergefile": db.mergefile(request, response); break;
    default: //handle after request is fully stabilized
        request.addListener("end", function () {
            switch(request.url) {
            case "/dbo": db.dbo(request, response); break;
            case "/dbread": db.dbread(request, response); break;
            case "/songscount": db.songscount(request, response); break;
            case "/mergestat": db.mergestat(request, response); break;
            default:
                fileserver.serve(request, response); }
        }).resume(); }
}).listen(portnum);


//open the browser tab to avoid having to do that manually
setTimeout(function () {
    const { spawn } = require("child_process");
    //Mac platform
    spawn("open", ["http://localhost:" + portnum], {stdio:"ignore"});
}, 800);

