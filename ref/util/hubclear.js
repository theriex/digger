//Clears the "modified" value out of every song in digdat.json so the next
//launch of digger will push of all local data to the hub, overwriting
//whatever is saved on the server.
var fs = require("fs");
var ddfp = "/Users/theriex/ep/music/digdat.json";
var digdat = fs.readFileSync(ddfp);
digdat = JSON.parse(digdat);
Object.values(digdat.songs).forEach(function (s) {
    delete s.modified; });
fs.writeFileSync(ddfp, JSON.stringify(digdat, null, 2), "utf8");
