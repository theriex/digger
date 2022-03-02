/*jslint node, white, long, unordered */

//Copy all charting songs to the export directory
const pcd = "/Users/theriex/general/temp/phonetunes/";

var fs = require("fs");
var path = require("path");
var db = require("../../server/db");
var copied = 0;

function getAccount () {
    const aci = db.conf().acctsinfo;
    return aci.accts.find((a) => a.dsId === aci.currid);
}

function isIgPath (igfolds, p) {  //copied from top.js
    var pes = p.split("/");
    if(pes.length <= 1) {  //top level file, or windows
        pes = p.split("\\"); }
    if(pes.length > 1) {
        return igfolds.some((f) =>
            (pes[pes.length - 2] === f ||
             (f.endsWith("*") &&
              pes[pes.length  - 2].startsWith(f)))); }
    if(!p.endsWith(".mp3")) { return true; }
    return false;
}

function fqOk (s) {
    if(!s.fq) { return true; }
    if(s.fq.match(/^[DU]/)) { return false; }  //missing file
    if(s.fq.match(/[BZO]/)) { return false; }  //don't copy overplayed
    return true;
}

function verifyParentDirs (fp) {
    if(typeof fp === "string") {
        fp = fp.split(path.sep);
        if(!fp[0]) {  //replace initial path.sep into first element
            fp[1] = path.sep + fp[1];
            fp = fp.slice(1); }
        fp = fp.slice(0, -1); }
    const dir = path.join(...fp);
    if(!fs.existsSync(dir)) {
        verifyParentDirs(fp.slice(0, -1));
        fs.mkdirSync(dir); }
}

function copySong(p) {
    //flatten all problematic os file path element chars to enable copy from
    //Mac to FAT32 SD card mounted on Android.  Ratings are found on server
    //via ti/ar/ab values so path is just to write values back to digdat.json
    var q = p.split(path.sep);
    q = q.map((e) => e.replace(/[|\\?*<\":>+\[\]\/']/g, "_"));
    q = q.join(path.sep);
    if(fs.existsSync(pcd + q)) { return; }  //already there
    verifyParentDirs(pcd + q);
    fs.copyFileSync(db.conf().musicPath + path.sep + p, pcd + q);
    copied += 1;
}

function copyFilesToExport () {
    db.init(function () {
        //console.log(JSON.stringify(db.conf()));
        const acc = getAccount();
        //console.log(JSON.stringify(acc));
        Object.entries(db.dbo().songs).forEach(function ([p, s]) {
            if(s.rv >= 7 && fqOk(s) && !isIgPath(acc.igfolds, p)) {
                copySong(p); } });
        console.log("Copied " + copied + " songs."); });
}

copyFilesToExport();
