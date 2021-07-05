//Checks how many songs are in common with the given musf
var fs = require("fs");
var ddfp = "/Users/theriex/digdat.json";
var digdat = fs.readFileSync(ddfp);
digdat = JSON.parse(digdat);
var gdfp = "/Users/theriex/diggercache/musf_2020.json";
var gdat = fs.readFileSync(gdfp);
gdat = JSON.parse(gdat);

function songLookupKey (s, ignore /*p*/) {
    if(!s.ti) {
        //console.log("song has no title. p: " + p);
        return null; }
    var sk = "";
    var flds = ["ti", "ar", "ab"];
    flds.forEach(function (fld) {
        sk += (s[fld] || "").trim(); });
    sk = sk.toLowerCase();
    return sk;
}

var counts = {common:0, total:Object.keys(gdat.songs).length};
Object.entries(digdat.songs).forEach(function ([p, s]) {
    var key = songLookupKey(s);
    if(key && gdat.songs[key]) {
        counts.common += 1;
        delete gdat.songs[key]; } });
console.log("Common: " + counts.common + " of " + counts.total);
console.log("Uncommon: " + Object.keys(gdat.songs).length);

pathkeys = 0;
Object.entries(gdat.songs).forEach(function ([p, s]) {
    if(p.match(/.*\/.*\.mp3/)) {
        pathkeys += 1;
        delete gdat.songs[p]; } });
console.log("  pathkeys: " + pathkeys);

console.log("Others:");
Object.entries(gdat.songs).forEach(function ([p, s]) {
    console.log(p); });
