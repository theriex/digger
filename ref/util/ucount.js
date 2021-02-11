//Checks how many unrated songs there are and how many of those are keyable
var fs = require("fs");
var ddfp = "/Users/theriex/digdat.json";
var digdat = fs.readFileSync(ddfp);
digdat = JSON.parse(digdat);

function isUnratedSong (s) {
    return (!s.kws && s.el === 49 && s.al === 49);
}

function songLookupKey (s, ignore /*p*/) {
    if(!s.ti) {
        //console.log("song has no title. p: " + p);
        return null; }
    var slk = s.ti + s.ar + s.ab;
    slk = slk.toLowerCase();
    return slk;
}

var counts = {total:0, unrat:0, keyable:0};

Object.entries(digdat.songs).forEach(function ([p, s]) {
    counts.total += 1; 
    if(isUnratedSong(s)) { counts.unrat += 1; }
    if(songLookupKey(s)) { counts.keyable += 1; }
});
console.log(counts);
