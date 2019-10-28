/*jslint node, white, fudge */

module.exports = (function () {
    "use strict";

    var musicPath = "";
    var dbPath = "";
    var fxts = [
        //Common formats typically supported through OS libraries
        ".mp3", ".aac", ".aiff", ".wma", ".alac",
        //Firefox general media support (open formats):
        ".wav", ".wave", ".ogg", ".oga", ".ogv", ".ogx", ".spx", ".opus",
        ".webm", ".flac", ".mp4", ".m4a", ".m4p", ".m4b", ".m4r", ".m4v"];
    var ignoredirs = ["Ableton", "GarageBand", "iTunes"];
    var fs = require("fs");
    var dbo = null;
    var mt = require("jsmediatags");
    var state = "initializing";
    var mostRecentRelativePathRead = "";
    var formidable = require("formidable");
    var util = require("util");
    var mergestat = null;
    //var mergeobj = null;


    function createDatabaseFile () {
        dbo = {version:"dv0.1", 
               scanned:"",  //ISO latest walk of song files
               keywords:["Dance", "Office", "Morning", "Workout"],
               keysacc:false,  //customization option presented
               waitcodedays:{  //days required since last played before pulling
                   //Prefix flag values:
                   //  "D": Deleted.  File no longer exists
                   //  "U": Unreadable.  Tags could not read from file.
                   //"R": Reference only.  Never suggest.
                   "O":365,  //Overplayed.
                   "Z":180,  //Resting.
                   "B":90},  //Back-burner.
                   //"P": Programmable.  Generally available to play (default)
                   //"N": New. Preferred select once before reverting to "P"
               songcount:0,
               //songs are indexed by relative path off of musicPath e.g.
               //"artistFolder/albumFolder/disc#?/songFile"
               songs:{}};
        //Each song entry:
        //  fq: frequency. See waitcodedays values and comments
        //  lp: last played. Local time ISO (easier to read, not critical)
        //  rv: rating. 0 is unrated, then 1-10 (5 stars with halves)
        //  al: attention level (Social/Challenging) 0-99 default 49
        //  el: energy level (Chill/Amped) 0-99 default 49
        //  kws: CSV of selected keywords (case normalized to declared vals)
        //  nt: arbitrary comment text
        //  ar: artist (from file metadata)
        //  ab: album (from file metatdata)
        //  ti: title (from file metatdata
        //  segs: [] A segue is ar/ab/ti/prob where prob is an *independent*
        //  percentage likelihood the segue will be used.  e.g. 0 is never,
        //  100 is always, 50 is a coin toss.
        fs.writeFileSync(dbPath, JSON.stringify(dbo), "utf8");
        console.log("Created " + dbPath);
        state = "ready";
    }


    function initialize () {
        var args = process.argv.slice(2);
        musicPath = "./";
        if(args && args.length) {
            musicPath = args[0];
            args = args.slice(1);
            if(!musicPath.endsWith("/")) {
                musicPath += "/"; } }
        if(args && args.length) {
            dbPath = args[0];
            args = args.slice(1); }
        if(!dbPath) {
            dbPath = musicPath + "digdat.json"; }
        //console.log("db.init " + musicPath + " " + dbPath);
        if(!fs.existsSync(dbPath)) {
            createDatabaseFile(); }
        else {
            fs.readFile(dbPath, "utf8", function (err, data) {
                if(err) { 
                    throw err; }
                dbo = JSON.parse(data); 
                console.log("Read " + dbPath); }); }
    }


    function serveDatabase (ignore /*req*/, res) {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(dbo));
    }


    function isMusicFile (fn) {
        if(fn.indexOf(".") >= 0) {
            fn = fn.slice(fn.lastIndexOf(".")).toLowerCase();
            return fxts.includes(fn); }
        return false;
    }


    function addSongToDb (fn, tagdata) {
        dbo.songcount += 1;
        var rpath = fn.slice(musicPath.length);  //make path relative
        mostRecentRelativePathRead = rpath;
        var rec = dbo.songs[rpath];
        if(rec) {  //updating existing entry
            //console.log(dbo.songcount + " updating " + rpath);
            if(rec.fq.startsWith("D")) {  //remove deletion mark since found
                rec.fq = rec.fq.slice(1); } }
        else {  //make new entry
            //console.log(dbo.songcount + " creating " + rpath);
            rec = {fq:"N", rv:3, al:49, el:49, kws:""};
            dbo.songs[rpath] = rec; }
        if(!tagdata) {  //tags could not be read, mark as unreadable
            if(!rec.fq.startsWith("U")) {
                rec.fq = "U" + rec.fq; } }
        else { 
            rec.ar = tagdata.tags.artist;
            rec.ab = tagdata.tags.album;
            rec.ti = tagdata.tags.title; }
    }


    function walkFiles (ws) {
        if(!ws.files.length) {
            dbo.scanned = new Date().toISOString();
            var jsondbo = JSON.stringify(dbo);
            fs.writeFileSync(dbPath, jsondbo, "utf8");
            ws.response.writeHead(200, {"Content-Type": "application/json"});
            ws.response.end(jsondbo);
            state = "ready";
            return; }  //done reading
        var fn = ws.files.pop();
        if(fs.lstatSync(fn).isDirectory()) {
            fs.readdir(fn, function (err, files) {
                if(err) {
                    console.log("walkFiles readdir error: " + err); }
                files.forEach(function (childfile) {
                    if(!ignoredirs.includes(childfile)) {
                        ws.files.push(fn + "/" + childfile); } });
                walkFiles(ws); }); }
        else if(isMusicFile(fn)) {
            new mt.Reader(fn)
                .setTagsToRead(["artist", "album", "title"])
                .read({
                    onSuccess: function (tags) {
                        addSongToDb(fn, tags);
                        walkFiles(ws); },
                    onError: function (err) {
                        console.log("mt.read error " + err.info + ": " + fn);
                        addSongToDb(fn, null);
                        walkFiles(ws); } }); }
        else {  //not a directory and not a music file, continue.
            walkFiles(ws); }
    }


    function readFiles (req, res) {
        if(state === "reading") {
            var msg = "readFiles already in progress";
            res.statusCode = 409;
            res.statusMessage = msg;
            res.end();
            return console.log(msg); }
        state = "reading";
        dbo.songcount = 0;
        //mark everything deleted, then undo as the songs are found.
        Object.keys(dbo.songs).forEach(function (key) {
            var fq = dbo.songs[key].fq;
            if(!fq.startsWith("D")) {  //already marked as deleted
                dbo.songs[key].fq = "D" + fq; } });
        var root = musicPath;
        if(root.endsWith("/")) {
            root = root.slice(0, -1); }
        walkFiles({request:req, response:res, files:[root]});
    }


    function songCount (ignore /*req*/, res) {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify({count:dbo.songcount,
                                status:state,
                                lastrpath:mostRecentRelativePathRead,
                                musicpath:musicPath}));
    }


    function mergeData (data, req, res) {
        mergestat.state = "merging";
        console.log(data.slice(0, 500));
        res.writeHead(200, {"Content-Type": "text/html"});
        res.end("Error: mergeData not implemented yet.");
    }


    function mergeFile (req, res) {
        mergestat = {batchsize:500, pausems:200, idx:0, applied:0, saved:0,
                     state:"starting", errmsg:""};
        if(req.method === "GET") {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end("Ready"); }
        else {  //POST
            var form = new formidable.IncomingForm();  //utf-8 by default
            form.uploadDir = ".";
            // console.log("mergeFile uploadDir: " + form.uploadDir);
            form.parse(req, function (err, fields, files) {
                if(err) {
                    throw err; }
                else {  //have file with no contents if no file specified.
                    var path = files.mergefilein.path;
                    fs.readFile(path, "utf8", function (err, data) {
                        if(err) {
                            throw err; }
                        mergeData(data, req, res); }); } }); }
    }


    function mergeStatus (ignore /*req*/, res) {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(mergestat));
    }


    return {
        init: function () { initialize(); },
        dbo: function (req, res) { return serveDatabase(req, res); },
        dbread: function (req, res) { return readFiles(req, res); },
        songscount: function (req, res) { return songCount(req, res); },
        mergefile: function (req, res) { return mergeFile(req, res); },
        mergestat: function (req, res) { return mergeStatus(req, res); }
    };
}());
