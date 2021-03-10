//Move ignore folders and lower rated songs out of the way.
//1st param: "remove" (default) or "restore"

//offload folder path (no terminating sep, mirrors musicPath)
var offp = "/Users/theriex/general/temp/digger/offload";
//skip folders (don't offload even if listed in igfolds)
var skfs = ["Music"];

var fs = require("fs");
var os = require("os");
var path = require("path");
var db = require("../../server/db");


var util = (function () {
    var conf = null;
    var acct = null;
    var digdat = null;
return {
    loadData: function () {
        var cfp = path.join(os.homedir(), ".digger_config.json");
        conf = fs.readFileSync(cfp, "utf8");
        conf = JSON.parse(conf);
        acct = conf.acctsinfo.accts.find((a) =>
            a.dsId === conf.acctsinfo.currid);
        digdat = fs.readFileSync(conf.dbPath);
        digdat = JSON.parse(digdat); },
    isRootFolder: function (fp) {
        return (fp === conf.musicPath || fp === offp); },
    isSkipFolder: function (fp) {
        return (util.isRootFolder(fp) ||
                skfs.find((f) => f === path.basename(fp))); },
    isIgnoreFolder: function (fp) {
        return (!util.isSkipFolder(fp) &&
                acct.igfolds.find((f) => f === path.basename(fp))); },
    getPath: function (ctx, base, fname) {
        return path.join(ctx[base], ...(ctx.rel), fname); },
    isLowRatedFile: function (ctx, fname) {
        var musicp = path.join(...(ctx.rel), fname);
        if(!db.isMusicFile(musicp)) {  //.DS_Store, *.jpg etc
            return false; } //not sure if safe to offload
        if(!digdat.songs[musicp]) {  //not rated
            return true; }  //reducing collection to known good songs
        if(digdat.songs[musicp].rv <= 7) {  //stars === rv/2
            return true; }
        return false; },
    verifyParentDirs: function (fp) {
        if(typeof fp === "string") {
            fp = fp.split(path.sep);
            if(!fp[0]) {  //replace initial path.sep into first element
                fp[1] = path.sep + fp[1];
                fp = fp.slice(1); }
            fp = fp.slice(0, -1); }
        var dir = path.join(...fp);
        if(!fs.existsSync(dir)) {
            util.verifyParentDirs(fp.slice(0, -1));
            fs.mkdirSync(dir); } },
    moveFile: function (fp, mvp) {
        util.verifyParentDirs(mvp);
        fs.renameSync(fp, mvp);
        console.log(fp + " -> " + mvp); },
    walkFiles: function (ctx) {
        ctx.files.forEach(function (fname) {
            var fp = util.getPath(ctx, "src", fname);
            var mvp = util.getPath(ctx, "dst", fname);
            if(fs.lstatSync(fp).isDirectory()) {
                if(util.isIgnoreFolder(fp)) {
                    util.moveFile(fp, mvp); }
                else if(util.isRootFolder(fp) || !util.isSkipFolder(fp)) {
                    util.walkFiles({src:ctx.src, dst:ctx.dst, mpb:ctx.mpb,
                                    rel:ctx.rel.concat([fname]),
                                    files:fs.readdirSync(fp)}); } }
            else { //regular file
                if(util.isLowRatedFile(ctx, fname)) {
                    util.moveFile(fp, mvp); } } }); },
    run: function () {
        util.loadData();
        if(process.argv[2] === "restore") {
            console.log("Restoring " + conf.musicPath + " <- " + offp);
            util.walkFiles({src:offp, dst:conf.musicPath, mpb:"dst",
                            rel:[], files:[""]}); }
        else {
            console.log("Offloading " + conf.musicPath + " -> " + offp);
            util.walkFiles({src:conf.musicPath, dst:offp, mpb:"src",
                            rel:[], files:[""]}); }
        console.log("Done."); }
};
}());

util.run();
