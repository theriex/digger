/*jslint node, white, fudge, long */

module.exports = (function () {
    "use strict";

    var fs = require("fs");
    var os = require("os");
    var path = require("path");
    var fects = {  //file extension content types
        //Common formats typically supported through OS libraries
        ".mp3":"audio/mp3",
        ".aac":"audio/aac",
        ".aiff":"audio/aiff",
        ".wma":"audio/x-ms-wma",
        ".alac":"audio/mp4",
        //Firefox general media support (open formats):
        ".3gp":"audio/3gpp",
        ".wav":"audio/wav",
        ".wave":"audio/wav",
        ".ogg":"audio/ogg",
        ".oga":"audio/ogg",
        ".opus":"audio/opus",  //ogg
        ".webm":"audio/webm",
        ".flac":"audio/flac",
        ".mpg":"audio/mpeg",
        ".mpeg":"audio/mpeg",
        ".mp4":"audio/mp4",
        ".m4a":"audio/mp4"};
    var conf = null;
    var dbo = null;
    var mt = require("jsmediatags");
    var state = "initializing";
    var mostRecentRelativePathRead = "";
    var formidable = require("formidable");
    var mrg = {stat:null, obj:null, dict:null};
    var exp = {stat:null, spec:null};
    var appdir = path.normalize(path.join(__dirname, ".."));
    var caud = {path:"", buf:null};


    //JavaScript Lint Fuckery avoids warnings about sync methods that
    //"shouldn't" be used and therefore don't have properties automatically
    //created for them.  Just a silly workaround to make the call without
    //generating warnings in the usually beloved static code analyzer.
    function jslf (obj, method, ...args) {
        return obj[method].apply(obj, args);
    }


    function diggerVersion () {
        return "dv0.4";
    }


    function writeDatabaseObject () {
        dbo.version = diggerVersion();
        //write the json with newlines so it can be read in a text editor
        var json = JSON.stringify(dbo, null, 2);
        //max 1 ongoing file write at a time, so use fs.writeFileSync.
        jslf(fs, "writeFileSync", conf.dbPath, json, "utf8");
    }


    function createDatabaseFile () {
        dbo = {version:diggerVersion(),
               scanned:"",  //ISO latest walk of song files
               songcount:0,
               //songs are indexed by relative path off of musicPath e.g.
               //"artistFolder/albumFolder/disc#?/songFile"
               songs:{}};
        //Each song entry:
        //  fq: frequency. See waitcodedays values and comments
        //  lp: last played. Local time ISO (easier to read, not critical)
        //  rv: rating. 0 is unrated, then 1-10 (5 stars with halves)
        //  al: approachability (Easy/Hard) 0-99 default 49
        //  el: energy level (Chill/Amped) 0-99 default 49
        //  kws: CSV of selected keywords (case normalized to declared vals)
        //  nt: arbitrary comment text
        //  ar: artist (from file metadata)
        //  ab: album (from file metatdata)
        //  ti: title (from file metatdata
        //  segs: [] A segue is ar/ab/ti/prob where prob is an *independent*
        //  percentage likelihood the segue will be used.  e.g. 0 is never,
        //  100 is always, 50 is a coin toss.
        writeDatabaseObject();
        console.log("Created " + conf.dbPath);
        state = "ready";
    }


    function normalizeIntegerValues (song) {
        var fields = ["rv", "al", "el"];
        fields.forEach(function (field) {
            if(typeof song[field] === "string") {
                song[field] = parseInt(song[field], 10); } });
    }


    function cleanLoadedConfig () {
        var confpaths = ["musicPath", "dbPath", "exPath", "cachePath"];
        confpaths.forEach(function (cp) {
            var fp = conf[cp];
            //convert any forward slash specs to platform file separators so
            //the default config has a hope of working on windows.
            if(fp.indexOf("/") >= 0) {
                fp = fp.replace(/\//g, path.sep); }
            if(fp.startsWith("~")) {
                conf[cp] = path.join(
                    os.homedir(),
                    ...fp.split(path.sep).slice(1)); }
            console.log(cp + ": " + conf[cp]); });
        require("./hub").verifyDefaultAccount(conf);
    }


    function getConfigFileName () {
        var cfp = path.join(os.homedir(), ".digger_config.json");
        if(!jslf(fs, "existsSync", cfp)) {
            //copyFileSync fails when running within pkg. Do manually:
            //console.log("appdir: " + appdir);
            //console.log(fs.readdirSync(appdir));
            var afp = path.join(appdir, "config.json");
            var cc = jslf(fs, "readFileSync", afp, "utf8");  //read as string
            jslf(fs, "writeFileSync", cfp, cc, "utf8");
            console.log("Created " + cfp); }
        return cfp;
    }


    function readConfigurationFile (contf) {
        var cfp = getConfigFileName();
        fs.readFile(cfp, "utf8", function (err, data) {
            if(err) {
                console.log("readConfigurationFile error reading " + cfp);
                throw err; }
            conf = JSON.parse(data);
            cleanLoadedConfig();
            // console.log("readConfigurationFile conf: " +
            //             JSON.stringify(conf, null, 2));
            if(contf) {
                contf(conf); } });
    }


    function writeConfigurationFile () {
        var cfp = getConfigFileName();
        jslf(fs, "writeFileSync", cfp, JSON.stringify(conf, null, 2), "utf8");
    }


    //On MacOS, if you put digdat.json somewhere like ~/Documents and the
    //node process hasn't been granted access, then the read will fail.  If
    //server processing continues, and write access is subsequently granted,
    //the client read request will trigger a new dbo being written from
    //scratch, with all of previous data overwritten.  A read failure here
    //needs to fail catastrophically to avoid potential data loss.
    function readDatabaseFile (contf) {
        if(!jslf(fs, "existsSync", conf.dbPath)) {
            createDatabaseFile(); }
        fs.readFile(conf.dbPath, "utf8", function (err, data) {
            if(err) {
                conf.dbPath = "UNREADABLE_DBPATH_FILE_" + conf.dbPath;
                console.log("readDatabaseFile failed: " + conf.dbPath);
                throw err; }
            dbo = JSON.parse(data);
            if(dbo.songs) {
                Object.values(dbo.songs).forEach(function (song) {
                    normalizeIntegerValues(song); }); }
            console.log("readDatabaseFile success: " + conf.dbPath);
            if(contf) {
                contf(dbo); } });
    }


    function initialize (contf) {
        readConfigurationFile(function (conf) {
            readDatabaseFile(function () {
                if(contf) {
                    contf(conf); } }); });
    }


    function serveConfig (ignore /*req*/, res) {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(conf));
    }


    function startupData (ignore /*req*/, res) {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify({config:conf, songdata:dbo}));
    }


    function isMusicFile (fn) {
        if(fn.indexOf(".") >= 0) {
            fn = fn.slice(fn.lastIndexOf(".")).toLowerCase();
            return fects[fn]; }
        return false;
    }


    function addSongToDb (fn, tagdata) {
        dbo.songcount += 1;
        var rpath = fn.slice(conf.musicPath.length);  //make path relative
        if(rpath.startsWith(path.sep)) {
            rpath = rpath.slice(1); }
        mostRecentRelativePathRead = rpath;
        var rec = dbo.songs[rpath];
        if(rec) {  //updating existing entry
            //console.log(dbo.songcount + " updating " + rpath);
            if(rec.fq.startsWith("D")) {  //remove deletion mark since found
                rec.fq = rec.fq.slice(1); } }
        else {  //make new entry
            //console.log(dbo.songcount + " creating " + rpath);
            rec = {fq:"N", al:49, el:49, kws:"", rv:5};
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
            writeDatabaseObject();
            ws.response.writeHead(200, {"Content-Type": "application/json"});
            ws.response.end(JSON.stringify(dbo));
            state = "ready";
            return; }  //done reading
        var fn = ws.files.pop();
        if(jslf(fs, "lstatSync", fn).isDirectory()) {
            fs.readdir(fn, function (err, files) {
                if(err) {
                    console.log("walkFiles readdir error: " + err); }
                files.forEach(function (childfile) {
                    if(!require("./hub").isIgnoreDir(ws, childfile)) {
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
        var root = conf.musicPath;
        if(root.endsWith("/")) {
            root = root.slice(0, -1); }
        walkFiles({request:req, response:res, files:[root]});
    }


    function songCount (ignore /*req*/, res) {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify({count:dbo.songcount,
                                status:state,
                                lastrpath:mostRecentRelativePathRead,
                                musicpath:conf.musicPath}));
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
            writeDatabaseObject();
            mrg.stat.state = "ready"; }
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
                var mpath = files.mergefilein.path;
                mrg.stat.state = "received";
                fs.readFile(mpath, "utf8", function (err, data) {
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
            if(fields.settings) {
                dbo.settings = JSON.parse(fields.settings); }
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
            writeDatabaseObject();
            song.path = fields.path;
            console.log("Updated " + song.path);
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify(song)); });
    }


    function writePlaylistFile () {
        var songs = JSON.parse(exp.spec.songs).map((s) => s.split("/").pop());
        var txt = "#EXTM3U\n" + songs.join("\n") + "\n";
        jslf(fs, "writeFileSync", conf.exPath + exp.spec.plfilename,
             txt, "utf8");
    }


    function exportNextSong () {
        if(!exp.stat.remaining.length) {
            exp.stat.state = "Done";
            if(exp.spec.markplayed) {  //song.lp updated when copied, save.
                writeDatabaseObject(); }
            return; }
        var song = exp.stat.remaining.pop();
        var exn = song.split(path.sep).pop();
        fs.copyFile(conf.musicPath + song, conf.exPath + exn, function (err) {
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


    function serveAudio (pu, req, res) {
        var fn = path.join(conf.musicPath, pu.query.path);
        if(caud.path !== fn) {
            caud.path = fn;
            caud.buf = jslf(fs, "readFileSync", fn);
            var ext = fn.slice(fn.lastIndexOf(".")).toLowerCase();
            caud.ct = fects[ext] || "audio/" + ext.slice(1); }
        var resh = {"Content-Type": caud.ct,
                    "Content-Length": caud.buf.length,
                    "Accept-Ranges": "bytes"};
        var rescode = 200;
        var resb = caud.buf;
        //console.log(req.headers);
        if(req.headers.range) {  //e.g. "bytes=0-1" (inclusive range)
            var rspec = req.headers.range.split("=")[1];
            rspec = rspec.split("-");
            if(!rspec[1]) {  //second range index may be omitted
                rspec[1] = String(caud.buf.length - 1); }
            rspec = rspec.map((x) => parseInt(x, 10));
            var start = rspec[0];
            var end = rspec[1];
            resh["Content-Range"] = "bytes " + start + "-" + end + "/" +
                caud.buf.length;
            resh["Content-Length"] = (end + 1) - start;
            rescode = 206;
            resb = caud.buf.subarray(start, end + 1); }
        //console.log(resh);
        res.writeHead(rescode, resh);
        res.end(resb);
    }


    function serveVersion (ignore /*req*/, res) {
        res.writeHead(200, {"Content-Type": "text/plain"});
        res.end(diggerVersion());
    }


    return {
        //server utilities
        appdir: function () { return appdir; },
        init: function (contf) { initialize(contf); },
        conf: function () { return conf; },
        writeConfigurationFile: function () { writeConfigurationFile(); },
        dbo: function () { return dbo; },
        writeDatabaseObject: function () { writeDatabaseObject(); },
        fileExists: function (path) { return jslf(fs, "existsSync", path); },
        readFile: function (path) { return jslf(fs, "readFileSync", path); },
        writeFile: function (path, txt) {
            return jslf(fs, "writeFileSync", path, txt, "utf8"); },
        mkdir: function (path) { return jslf(fs, "mkdirSync", path); },
        diggerVersion: function () { return diggerVersion(); },
        //server endpoints
        config: function (req, res) { return serveConfig(req, res); },
        startdata: function (req, res) { return startupData(req, res); },
        dbread: function (req, res) { return readFiles(req, res); },
        songscount: function (req, res) { return songCount(req, res); },
        mergefile: function (req, res) { return mergeFile(req, res); },
        mergestat: function (req, res) { return mergeStatus(req, res); },
        songupd: function (req, res) { return updateSong(req, res); },
        plistexp: function (req, res) { return playlistExport(req, res); },
        audio: function (pu, req, res) { return serveAudio(pu, req, res); },
        version: function (req, res) { return serveVersion(req, res); }
    };
}());
