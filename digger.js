/*jslint node, white, fudge */

var db = require("./server/db");
db.init();

var nodestatic = require("node-static");
var fileserver = new nodestatic.Server("./docroot");
var portnum = 6980;

//start the server
require("http").createServer(function (request, response) {
    request.addListener("end", function () {
        console.log(request.url);
        switch(request.url) {
        case "/dbo": db.dbo(request, response); break;
        default:
            fileserver.serve(request, response); }
    }).resume();
}).listen(portnum);


//open the browser to avoid having to do that as a separate step
setTimeout(function () {
    const { spawn } = require('child_process');
    //Mac platform
    spawn("open", ["http://localhost:" + portnum], {stdio:"ignore"});
}, 800);

