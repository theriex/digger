/*jslint node, white, fudge */

module.exports = (function () {
    "use strict";

    var musicPath = "";
    var dbPath = "";
    var exPath = "";
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
    var mrg = {stat:null, obj:null, dict:null};
    var exp = {stat:null, spec:null};


    //JavaScript Lint Fuckery avoids warnings about sync methods that
    //"shouldn't" be used and therefore don't have properties automatically
    //created for them.  Just a silly workaround to make the call without
    //generating warnings in the usually beloved static code analyzer.
    function jslf (obj, method, ...args) {
        return obj[method].apply(obj, args);
    }


    function createDatabaseFile () {
        dbo = {version:"dv0.1", 
               scanned:"",  //ISO latest walk of song files
               keywords:["Morning", "Office", "Workout", "Dance"],
               keysacc:false,  //customization option presented
               waitcodedays:{  //days required since last played before pulling
                   //Prefix flag values:
                   //  D: Deleted.  File no longer exists
                   //  U: Unreadable.  Tags could not read from file.
                   //"R": Reference only.  Never suggest.
                   O:365,  //Overplayed.
                   Z:180,  //Resting.
                   B:90},  //Back-burner.
                   //P: Programmable.  Generally available to play (default)
                   //N: New. Preferred select once before reverting to "P"
               songcount:0,
               //songs are indexed by relative path off of musicPath e.g.
               //"artistFolder/albumFolder/disc#?/songFile"
               songs:{}};
        //Each song entry:
        //  fq: frequency. See waitcodedays values and comments
        //  lp: last played. Local time ISO (easier to read, not critical)
        //  rv: rating. 0 is unrated, then 1-10 (5 stars with halves)
        //  al: approachability (Social/Challenging) 0-99 default 49
        //  el: energy level (Chill/Amped) 0-99 default 49
        //  kws: CSV of selected keywords (case normalized to declared vals)
        //  nt: arbitrary comment text
        //  ar: artist (from file metadata)
        //  ab: album (from file metatdata)
        //  ti: title (from file metatdata
        //  segs: [] A segue is ar/ab/ti/prob where prob is an *independent*
        //  percentage likelihood the segue will be used.  e.g. 0 is never,
        //  100 is always, 50 is a coin toss.
        jslf(fs, "writeFileSync", dbPath, JSON.stringify(dbo), "utf8");
        console.log("Created " + dbPath);
        state = "ready";
    }


    function normalizeIntegerValues (song) {
        var fields = ["rv", "al", "el"];
        fields.forEach(function (field) {
            if(typeof song[field] === "string") {
                song[field] = parseInt(song[field], 10); } });
    }


    function setPathsFromArgs () {
        var args = process.argv.slice(2);
        //by default, look for music files in the directory we are running from
        musicPath = "./";
        if(args && args.length) {
            musicPath = args[0];  //otherwise use the specified dir
            if(!musicPath.endsWith("/")) {
                musicPath += "/"; } }
        //by default, put the db file in the same directory as the music
        dbPath = musicPath + "digdat.json";
        if(args && args.length >= 2) {
            dbPath = args[1];
            if(dbPath.endsWith("/")) {  //no filename specified, use default
                dbPath += "/digdat.json"; } }
        //no default for export, disable if not specified.  Export is
        //non-destructive, which means no deleting of files, and no
        //overwriting of existing files.  Could add a fourth parameter to
        //sllow specifying destructive, but the potential for serious harm
        //if exPath is pointing to the wrong place is not worth it.
        if(args && args.length >= 3) {
            exPath = args[2];
            if(!exPath.endsWith("/")) {
                exPath += "/"; } }
        //console.log("db.init " + musicPath + " " + dbPath + " " + exPath);
    }


    function initialize () {
        setPathsFromArgs();
        if(!jslf(fs, "existsSync", dbPath)) {
            createDatabaseFile(); }
        else {
            fs.readFile(dbPath, "utf8", function (err, data) {
                if(err) { 
                    throw err; }
                dbo = JSON.parse(data);
                if(dbo.songs) {
                    Object.keys(dbo.songs).forEach(function (key) {
                        normalizeIntegerValues(dbo.songs[key]); }); }
                console.log("Read " + dbPath); }); }
    }


    function serveConfig (ignore /*req*/, res) {
        var confobj = {};
        confobj.musicPath = musicPath;
        confobj.dbPath = dbPath;
        confobj.exPath = exPath;
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(confobj));
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
            rec = {fq:"N", rv:0, al:49, el:49, kws:""};
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
            dbo.scanned = new Date().toISOString();  //note completion time.
            var jsondbo = JSON.stringify(dbo);
            jslf(fs, "writeFileSync", dbPath, jsondbo, "utf8");
            ws.response.writeHead(200, {"Content-Type": "application/json"});
            ws.response.end(jsondbo);
            state = "ready";
            return; }  //done reading
        var fn = ws.files.pop();
        if(jslf(fs, "lstatSync", fn).isDirectory()) {
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
        dbo.scanstart = new Date().toISOString();
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


    function canonicalKeyForSong (song) {
        return song.ar + "|" + song.ab + "|" + song.ti;
    }


    function csvmerge(a, b) {
        a = a || "";
        b = b || "";
        if(a) {
            a = a.split(","); }
        else {
            a = []; }
        if(b) {
            b = b.split(","); }
        else {
            b = []; }
        b.forEach(function (kwd) {
            if(a.indexOf(kwd) < 0) {
                a.push(kwd); } });
        return a.join(",");
    }


    //The merge is an outer join.  Reason being that if you are merging your
    //own data from one location to another, you don't want to lose info
    //just because you have fewer songs on another machine.  The outer join
    //approach also makes sense in terms of general discovery and utility,
    //though there is a risk of accumulating information you don't need.
    //Could add a flag to the form to do an inner join if needed, then just
    //skip adding.
    function mergeEntry (key, dat) {
        if(!key || !dat) {
            return console.log("bad mergeEntry " + key + ": " + dat); }
        normalizeIntegerValues(dat);
        var dbd = dbo.songs[key];
        if(!dbd) {
            var cankey = canonicalKeyForSong(dat);
            var dbkey = mrg.dict[cankey];
            if(dbkey) {
                dbd = dbo.songs[dbkey]; } }
        if(dbd) {  //supplement local entry if better info
            //fq: use dat frequency if db is default and dat is not.
            if((dat.fq && dat.fq.indexOf("N") < 0 && dat.fq.indexOf("P") < 0) &&
               (dbd.fq.indexOf("N") >= 0 || dbd.fq.indexOf("P") >= 0)) {
                var prefix = "";  //preserve existing marker prefix if any
                if(dbd.fq.startsWith("U") || dbd.fq.startsWith("D")) {
                    prefix = dbd.fq.slice(0, 1); }
                dbd.fq = dat.fq;
                if(dbd.fq.length > 1) {  //get rid of any "U" or "D" prefix
                    dbd.fq = dbd.fq.slice(1); }
                dbd.fq = prefix + dbd.fq; }
            //rv: use dat rating if db unspecified and dat has a value
            if(!dbd.rv && dat.rv) {
                dbd.rv = dat.rv; }
            //al: If there is a non-default value, then use it
            if((!dbd.al || dbd.al === 49) && (dat.al && dat.al !== 49)) {
                dbd.al = dat.al; }
            //el: If there is a non-default value, then use it
            if((!dbd.el || dbd.el === 49) && (dat.el && dat.el !== 49)) {
                dbd.el = dat.el; }
            //kws: outer join keywords for maximum search leverage
            dbd.kws = csvmerge(dbd.kws, dat.kws);
            //nt: pull in comment text only if nothing set locally
            if((!dbd.nt || !dbd.nt.trim()) && dat.nt) {
                dbd.nt = dat.nt; } }
        else {  //entry not in current db (so no song file). Add entry.
            dat.fq = dat.fq || "P";
            if(dat.fq.length > 1) {  //remove any "U" or "D" prefix
                dat.fq = dat.fq.slice(1); }
            dat.fq = "D" + dat.fq;  //no song file or would have had entry
            dbo.songs[key] = dat; }
        mrg.stat.merged += 1;
    }


    function mergeDataChunk () {
        var keys = Object.keys(mrg.obj.songs);
        var key = "";
        mrg.stat.cb = mrg.stat.batchsize;
        while(mrg.stat.idx < keys.length) {
            key = keys[mrg.stat.idx];
            mergeEntry(key, mrg.obj.songs[key]);
            mrg.stat.idx += 1;
            mrg.stat.cb -= 1;
            if(mrg.stat.cb <= 0) {  //done with this batch
                setTimeout(mergeDataChunk, mrg.stat.pausems);
                break; } }
        if(mrg.stat.idx >= keys.length) {
            fs.writeFile(dbPath, JSON.stringify(dbo), "utf8", function (err) {
                if(err) {
                    throw err; }
                mrg.stat.state = "ready"; }); }
    }


    function makeMergeDictionary () {
        mrg.dict = {};
        Object.keys(dbo.songs).forEach(function (key) {
            var song = dbo.songs[key];
            var cankey = canonicalKeyForSong(song);
            mrg.dict[cankey] = key; });
        setTimeout(mergeDataChunk, 50);
    }


    function mergeData (data, ignore /*req*/, res) {
        mrg.stat.state = "merging";
        if(!data || !data.trim().length) {
            mrg.stat.errmsg = "No data sent"; }
        else {
            try {
                mrg.obj = JSON.parse(data);
            } catch(e) {
                mrg.stat.errmsg = String(e);
            } }
        if(mrg.stat.errmsg) {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end("Error: " + mrg.stat.errmsg); }
        else {
            setTimeout(makeMergeDictionary, 50);
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end("Received."); }
    }


    function mergeFile (req, res) {
        mrg.stat = {batchsize:500, pausems:200, idx:0, merged:0,
                    state:"starting", errmsg:""};
        if(req.method === "GET") {
            res.writeHead(200, {"Content-Type": "text/html"});
            res.end("Ready"); }
        else {  //POST
            var form = new formidable.IncomingForm();  //utf-8 by default
            form.uploadDir = ".";
            // console.log("mergeFile uploadDir: " + form.uploadDir);
            form.parse(req, function (err, ignore /*fields*/, files) {
                if(err) {
                    throw err; }
                //have file with no contents if no file specified.
                var path = files.mergefilein.path;
                mrg.stat.state = "received";
                fs.readFile(path, "utf8", function (err, data) {
                    if(err) {
                        throw err; }
                    mergeData(data, req, res); }); }); }
    }


    function mergeStatus (ignore /*req*/, res) {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(mrg.stat));
    }


    function resError (res, code, msg) {
        console.log("resError " + code + ": " + msg);
        res.writeHead(404, {"Content-Type": "text/plain"});
        res.end(msg);
    }


    function updateSong (req, res) {
        var updat = new formidable.IncomingForm();
        updat.parse(req, function (err, fields) {
            if(err) {
                console.log("updateSong form error: " + err); }
            //PENDING: error/val checking if opening up the app scope..
            //PENDING: handle segues after there is UI for it
            var song = dbo.songs[fields.path];
            if(!song) {
                return resError(res, 404, "No song " + fields.path); }
            song.fq = fields.fq;
            song.lp = fields.lp;
            song.rv = fields.rv;
            song.al = fields.al;
            song.el = fields.el;
            song.kws = fields.kws || "";
            song.nt = fields.nt || "";
            song.ar = fields.ar || "";
            song.ab = fields.ab || "";
            song.ti = fields.ti || "";
            normalizeIntegerValues(song);
            jslf(fs, "writeFileSync", dbPath, JSON.stringify(dbo), "utf8");
            song.path = fields.path;
            console.log("Updated " + song.path);
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify(song)); });
    }


    function updateKeywords (req, res) {
        var updat = new formidable.IncomingForm();
        updat.parse(req, function (err, fields) {
            if(err) {
                console.log("updateKeywords form error: " + err); }
            dbo.keywords = fields.keywords.split(",");
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify(dbo.keywords)); });
    }


    function copyAudioToTemp (relpath) {
        var tmpdir = "./docroot/tmpaudio";
        if(!jslf(fs, "existsSync", tmpdir)) {
            jslf(fs, "mkdirSync", tmpdir); }
        var tmpfn = "temp";
        if(relpath.lastIndexOf(".") > 0) {  //keep extension for content type
            tmpfn += relpath.slice(relpath.lastIndexOf(".")); }
        jslf(fs, "copyFileSync", musicPath + relpath, tmpdir + "/" + tmpfn);
        return "/tmpaudio/" + tmpfn;
    }


    function writePlaylistFile () {
        var songs = JSON.parse(exp.spec.songs).map((s) => s.split("/").pop());
        var txt = "#EXTM3U\n" + songs.join("\n") + "\n";
        jslf(fs, "writeFileSync", exPath + exp.spec.plfilename, txt, "utf8");
    }


    function exportNextSong () {
        if(!exp.stat.remaining.length) {
            exp.stat.state = "Done";
            if(exp.spec.markplayed) {  //song.lp updated when copied, save.
                jslf(fs, "writeFileSync",
                     dbPath, JSON.stringify(dbo), "utf8"); }
            return; }
        var song = exp.stat.remaining.pop();
        var exn = song.split("/").pop();
        fs.copyFile(musicPath + song, exPath + exn, function (err) {
            if(err) {
                exp.stat.state = "Failed";
                console.log(err); }
            exp.stat.copied += 1;
            if(exp.spec.markplayed) {
                dbo.songs[song].lp = new Date().toISOString(); }
            exportNextSong(); });
    }


    function playlistExport (req, res) {
        if(req.method === "GET") {
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify(exp)); }
        else { //POST
            exp.stat = {state:"Copying", copied:0};
            var fif = new formidable.IncomingForm();
            fif.parse(req, function (err, fields) {
                if(err) {
                    exp.stat.state = "Failed";
                    return resError(res, 400, "playlistExport form error " +
                                    err); }
                exp.spec = fields;
                try {
                    exp.stat.remaining = JSON.parse(exp.spec.songs);
                    if(exp.spec.writepl) {
                        writePlaylistFile(); }
                    setTimeout(exportNextSong, 200);
                } catch(e) {
                    return resError(res, 400, "playlistExport error " + e); }
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(JSON.stringify(exp)); }); }
    }


    return {
        init: function () { initialize(); },
        config: function (req, res) { return serveConfig(req, res); },
        dbo: function (req, res) { return serveDatabase(req, res); },
        dbread: function (req, res) { return readFiles(req, res); },
        songscount: function (req, res) { return songCount(req, res); },
        mergefile: function (req, res) { return mergeFile(req, res); },
        mergestat: function (req, res) { return mergeStatus(req, res); },
        songupd: function (req, res) { return updateSong(req, res); },
        keysupd: function (req, res) { return updateKeywords(req, res); },
        copyaudio: function (relpath) { return copyAudioToTemp(relpath); },
        plistexp: function (req, res) { return playlistExport(req, res); }
    };
}());
