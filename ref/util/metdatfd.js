//Dump the metadata and file derived metadata for songs where they differ
//Neither file metadata nor file path structure is without errors.  With a
//sizeable collection this will usually dump a lot of differences, which are
//probably not worth cleaning up. The resulting console output is just
//illustrative.

var db = require("../../server/db");
var fs = require("fs");
var ddfp = "/Users/theriex/digdat.json";
var digdat = fs.readFileSync(ddfp);
digdat = JSON.parse(digdat);

function canonize (txt) {
    if(!txt) {
        return ""; }
    //txt = txt.replace(/[^\p{L}\s]/gu,"");  //wonky. Just strip basics
    txt = txt.replace(/[\-\s\:\[\]\(\)\!\.\'\"\_\/\?]/g, "");
    return txt.toLowerCase();
}


function chardiff (a, b) {
    return canonize(a).localeCompare(canonize(b));
}


Object.entries(digdat.songs).forEach(function ([p, s]) {
    var fpd = db.mdtagsFromPath(p);
    if(s.fq && s.fq.startsWith("U")) {
        fpd = null; }
    if(fpd && (chardiff(fpd.tags.artist, s.ar) ||
               chardiff(fpd.tags.album, s.ab) ||
               chardiff(fpd.tags.title, s.ti))) {
        console.log(p);
        console.log("  m: " + s.ar + " - " + s.ab + " - " + s.ti);
        console.log("  f: " + fpd.tags.artist + " - " + fpd.tags.album +
                    " - " + fpd.tags.title); } });
