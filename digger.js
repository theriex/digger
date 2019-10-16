/*jslint node, white, fudge */

var db = require("./server/db");
db.init();

var nodestatic = require("node-static");
var fileserver = new nodestatic.Server("./docroot");

require("http").createServer(function (request, response) {
    request.addListener("end", function () {
        console.log(request.url);
        switch(request.url) {
        case "/dbo": db.dbo(request, response); break;
        default:
            fileserver.serve(request, response); }
    }).resume();
}).listen(6980);

