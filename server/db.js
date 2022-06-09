/*jslint node, white, long, unordered */

const fs = require("fs");
const os = require("os");
const path = require("path");
const mm = require("music-metadata");
const formidable = require("formidable");

module.exports = (function () {
    "use strict";

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
    var state = "initializing";
    var mostRecentRelativePathRead = "";
    var mrg = {stat:null, obj:null, dict:null};
    var exp = {stat:null, spec:null};
    var caud = {path:"", buf:null};


    function diggerVersion () {
        return "v1.0.2";
    }


    function crepTimeout (fun, ms) {
        setTimeout(function () {
            try {
                fun();
            } catch(e) {
                console.log("crepTimeout caught exception " + e);
                console.error(e);
            } }, ms);
    }


    //JavaScript Lint Fuckery avoids warnings about sync methods that
    //"shouldn't" be used and therefore don't have properties automatically
    //created for them.  Just a silly workaround to make the call without
    //generating warnings in the usually beloved static code analyzer.
    function jslf (obj, method, ...args) {
        return obj[method].apply(obj, args);
    }


    function writeDatabaseObject () {
        dbo.version = diggerVersion();
        //write the json with newlines so it can be read in a text editor
        const json = JSON.stringify(dbo, null, 2);
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
        //See diggerhub datadefs, aid and spid not saved locally.
        writeDatabaseObject();
        console.log("Created " + conf.dbPath);
        state = "ready";
    }


    function normalizeIntegerValues (song) {
        var fields = ["rv", "al", "el", "pc"];
        fields.forEach(function (field) {
            if(typeof song[field] === "string") {
                song[field] = parseInt(song[field], 10); } });
    }


    function cleanLoadedConfig () {
        var confpaths = ["musicPath", "dbPath", "exPath"];
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
    }


    function safeCopyJSONFile (source, target) {
        //copyFileSync fails when running within pkg, so do manually.
        console.log("safeCopyJSONFile reading " + source);
        const cc = jslf(fs, "readFileSync", source, "utf8");  //read as string
        console.log("safeCopyJSONFile writing " + target);
        jslf(fs, "writeFileSync", target, cc, "utf8");
    }


    function backupFileName (name) {
        var prefix = name; var suffix = "";
        var ts = new Date().toISOString();
        ts = ts.replace(/[\-:.]/g, "");
        if(name.indexOf(".") > 0) {
            prefix = name.slice(0, name.lastIndexOf("."));
            suffix = name.slice(name.lastIndexOf(".")); }
        return prefix + "_" + ts + suffix;
    }


    function getAppDir () {
        if(process.pkg && process.pkg.entrypoint) {
            return path.dirname(process.pkg.entrypoint); }
        return process.cwd();
    }


    function getConfigFileName () {
        var cfp = path.join(os.homedir(), ".digger_config.json");
        if(!jslf(fs, "existsSync", cfp)) {
            const appdir = getAppDir();
            //console.log("appdir: " + appdir);
            //console.log(fs.readdirSync(appdir));
            safeCopyJSONFile(path.join(appdir, "config.json"), cfp);
            console.log("Created " + cfp); }
        return cfp;
    }


    //The config file read expected to always succeed. The user's home
    //directory is supposed to be used for this sort of thing, and the
    //default config is copied in as needed.
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


    //By default, the database file is placed in the user's home directory
    //which should work.  Where to find the actual music files might vary.
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
            dbo.version = diggerVersion();
            if(dbo.songs) {
                Object.entries(dbo.songs).forEach(function ([path, song]) {
                    song.path = path;  //for ease of reference and sorting
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


    function titleFromFilename (fname) {  //no path
        var noext = fname.slice(0, fname.lastIndexOf("."));
        var title = noext.replace(/^\d\d?[\s\-]/, "");  //track number
        title = title.replace(/^\s?-\s/, "");  //dash separator
        title = title.trim();
        if(!title) {  //nothing but numbers and dashes in title
            title = noext.trim(); }
        return title;
    }


    //This is a fallback in the absence of proper meta data, so that all
    //music files can at least be loaded and played.  This is NOT where to
    //fix broken song files and structures.  Digger does not modify music
    //files, so filling song metadata from file names should be done via a
    //separate tool.
    //Top level files:
    //  While it is tempting to try and smartly parse top level files
    //  delimited by " - " or whatever, there is no standard format and names
    //  are not reliably consistent.
    //Buried subdirectories:
    //  It would be great if 4+ deep subdirectories had some kind of
    //  meaningful general structure but they don't.  More typically it's
    //  Compilations/Fan Name/Party/Maybe Right Title.mp3
    function mdtagsFromPath (rpath) {
        const nonas = ["compilations", "various", "various artists", "music",
                       "soundtracks"];
        const pes = rpath.split(path.sep);
        if(pes.length === 1 ||  //top level file. No further parsing. See note.
           pes.length > 3) {    //buried subfolder. See note.
            return {artist:"Unknown",
                    album:"Singles",
                    title:rpath}; }
        if(pes.length === 2) {  //artist|title
            return {artist:pes[0].trim(),
                    album:"Singles",
                    title:titleFromFilename(pes[1])}; }
        if(pes.length === 3) {  //artist|album|title
            if(nonas.indexOf(pes[0].toLowerCase()) < 0) {
                return {artist:pes[0].trim(),
                        album:pes[1].trim(),
                        title:titleFromFilename(pes[2])}; }
            return {artist:"Unknown",
                    album:"Singles",
                    title:rpath}; }
        return null;
    }


    function findOrAddDbSong (fn) {
        var rpath; var rec;
        dbo.songcount += 1;
        rpath = fn.slice(conf.musicPath.length);  //make path relative
        if(rpath.startsWith(path.sep) || rpath.startsWith("/")) {
            rpath = rpath.slice(1); }
        mostRecentRelativePathRead = rpath;
        rec = dbo.songs[rpath];
        if(rec) {  //updating existing entry
            //console.log(dbo.songcount + " updating " + rpath);
            if(rec.fq.startsWith("D")) {  //remove deletion mark since found
                rec.fq = rec.fq.slice(1); }
            if(rec.fq.startsWith("U")) {  //retry metadata read
                rec.fq = rec.fq.slice(1); } }
        else {  //make new entry
            //console.log(dbo.songcount + " creating " + rpath);
            rec = {fq:"N", al:49, el:49, kws:"", rv:5, path:rpath};
            dbo.songs[rpath] = rec; }
        return rec;
    }


    function makeMetadataRef (tags, complete) {
        var mrd = (complete? "C": "I");
        const flds = ["title", "artist", "album"];
        flds.forEach(function (fld) {
            var val = tags[fld] || "";
            val = val.replace(/|/g, "");  //strip any contained delimiters
            mrd += "|" + val; });
        return mrd;
    }


    //tags: title, artist, album. min req metadata: title + artist
    function updateMetadata (song, tags) {
        var pmrd = song.mrd || "";
        var complete = false;
        if(tags && tags.title && tags.artist && tags.album) {
            complete = true; }
        if(!tags || !tags.title || !tags.artist) {
            tags = mdtagsFromPath(song.path); }
        if(!tags || !tags.title || !tags.artist) {
            console.log("missing metadata " + song.path);
            if(!song.fq.startsWith("U")) {  //mark as unreadable
                song.fq = "U" + song.fq; } }
        else {  //have at least title and artist
            song.mrd = makeMetadataRef(tags, complete);
            if(pmrd !== song.mrd) {  //metadata has changed
                if(pmrd && song.lp) {  //song is not new and has been played
                    song.lp = new Date().toISOString(); } //include in hubsync
                if(complete) {  //new metadata overrides prev
                    song.ar = "";
                    song.ab = "";
                    song.ti = ""; } }
            //fill in any empty fields
            song.ar = song.ar || tags.artist;
            song.ab = song.ab || tags.album || "Singles";
            song.ti = song.ti || tags.title; }
        return song;
    }


    //create or update the song corresponding to the given a full file path.
    //contf is responsible for writing the updated dbo as needed.
    function readMetadata (ffp, contf) {
        mm.parseFile(ffp)
            .then(function (md) {
                //console.log(JSON.stringify(md, null, 2));
                var song = findOrAddDbSong(ffp);
                song = updateMetadata(song, md.common);
                contf(song); })
            .catch(function (err) {
                var song;
                console.log("mm.parseFile exception " + ffp);
                console.log(err);
                song = findOrAddDbSong(ffp);
                song = updateMetadata(song);
                contf(song); });
    }


    function getCurrentAccount () {
        var ca = null;
        var info = conf.acctsinfo;
        if(info) {
            if(info.currid) {
                ca = info.accts.find((a) => a.dsId === info.currid); }
            if(!ca) {  //missing currid or bad currid value
                conf.acctsinfo.currid = "101";
                ca = info.accts.find((a) => a.dsId === info.currid); } }
        return ca;
    }


    function initIgnoreFolders (ws) {
        ws.igfolds = conf.dfltigfolds || [];
        ws.curracct = ws.curracct || getCurrentAccount();
        if(ws.curracct) {
            ws.igfolds = ws.curracct.igfolds || []; }
        if(!Array.isArray(ws.igfolds)) {
            ws.curracct.igfolds = []; }
        if(!ws.wildms) { //wildcard ending match strings array
            ws.wildms = ws.igfolds.filter((ign) => ign.endsWith("*"));
            ws.wildms = ws.wildms.map((wm) => wm.slice(0, -1)); }
        console.log("ws.igfolds: " + JSON.stringify(ws.igfolds));
    }


    function isIgnoreDir (ws, dirname) {
        if(!ws.igfolds) {
            initIgnoreFolders(ws); }
        if(ws.igfolds.includes(dirname)) {
            return true; }
        return ws.wildms.some((wm) => dirname.startsWith(wm));
    }


    //Walk the file tree, starting at the root.
    function walkFiles (ws) {
        if(!ws.files.length) {
            dbo.scanned = new Date().toISOString();  //note completion time.
            writeDatabaseObject();
            ws.response.writeHead(200, {"Content-Type": "application/json"});
            ws.response.end(JSON.stringify(dbo));
            state = "ready";
            return; }  //done reading
        const fn = ws.files.pop();
        if(jslf(fs, "lstatSync", fn).isDirectory()) {
            fs.readdir(fn, function (err, files) {
                if(err) {
                    console.log("walkFiles readdir error: " + err); }
                files.forEach(function (childfile) {
                    if(!isIgnoreDir(ws, childfile)) {
                        ws.files.push(fn + "/" + childfile); } });
                walkFiles(ws); }); }
        else if(isMusicFile(fn)) {
            readMetadata(fn, function () { walkFiles(ws); }); }
        else {  //not a directory and not a music file, continue.
            walkFiles(ws); }
    }


    function readFiles (req, res) {
        var root; var msg;
        if(state === "reading") {
            msg = "readFiles already in progress";
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
            if(!fq.startsWith("D")) {  //not already marked as deleted
                dbo.songs[key].fq = "D" + fq; } });
        root = conf.musicPath;
        if(root.endsWith("/") || root.endsWith("\\")) {
            root = root.slice(0, -1); }
        if(!jslf(fs, "existsSync", root)) {
            msg = "readFiles " + root + " does not exist";
            state = "badMusicPath";
            res.statusCode = 404;
            res.statusMessage = msg;
            res.end();
            return console.log(msg); }
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
        var dbd; var prefix;
        if(!key || !dat) {
            return console.log("bad mergeEntry " + key + ": " + dat); }
        normalizeIntegerValues(dat);
        dbd = dbo.songs[key];
        if(!dbd) {
            const cankey = canonicalKeyForSong(dat);
            const dbkey = mrg.dict[cankey];
            if(dbkey) {
                dbd = dbo.songs[dbkey]; } }
        if(dbd) {  //supplement local entry if better info
            //fq: use dat frequency if db is default and dat is not.
            if((dat.fq && dat.fq.indexOf("N") < 0 && dat.fq.indexOf("P") < 0) &&
               (dbd.fq.indexOf("N") >= 0 || dbd.fq.indexOf("P") >= 0)) {
                prefix = "";  //preserve existing marker prefix if any
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
                crepTimeout(mergeDataChunk, mrg.stat.pausems);
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
        crepTimeout(mergeDataChunk, 50);
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
            crepTimeout(makeMergeDictionary, 50);
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
            const form = new formidable.IncomingForm();  //utf-8 by default
            form.uploadDir = ".";
            // console.log("mergeFile uploadDir: " + form.uploadDir);
            form.parse(req, function (err, ignore /*fields*/, files) {
                if(err) {
                    throw err; }
                //have file with no contents if no file specified.
                const mpath = files.mergefilein.path;
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


    function resError (res, msg, code) {
        code = code || 400;
        console.log("db resError " + code + ": " + msg);
        res.writeHead(code, {"Content-Type": "text/plain"});
        res.end(msg);
    }


    function recheckMetadata (song, res) {
        var rp = song.path;
        if(rp.startsWith("/")) {
            rp = rp.slice(1); }
        //console.log("recheckMetadata " + rp);
        readMetadata(conf.musicPath + "/" + rp, function (song) {
            writeDatabaseObject();
            console.log(new Date().toLocaleString() + " Updated " + song.path);
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify([song])); });
    }


    //When a song is loaded into the player, lp and pc are updated to
    //reflect that it was played.  A secondary use of lp is comparing it to
    //modified, to determine which songs need to be sent in hubsync.  The
    //update of lp here is for hubsync processing, pc remains the same.
    function updateSong (req, res) {
        var updat = new formidable.IncomingForm();
        updat.parse(req, function (err, fields) {
            if(err) {
                console.log("updateSong form error: " + err); }
            //PENDING: error/val checking if opening up the app scope..
            //PENDING: handle segues after there is UI for it
            const song = dbo.songs[fields.path];
            if(!song) {
                return resError(res, "No song " + fields.path, 404); }
            if(fields.settings) {
                dbo.settings = JSON.parse(fields.settings); }
            song.fq = fields.fq;
            song.lp = new Date().toISOString();  //trigger hubsync, see note
            song.rv = fields.rv;
            song.al = fields.al;
            song.el = fields.el;
            song.kws = fields.kws || "";
            song.nt = fields.nt || "";
            song.ar = fields.ar || "";
            song.ab = fields.ab || "";
            song.ti = fields.ti || "";
            song.pc = fields.pc;
            song.srcid = fields.srcid || "";
            song.srcrat = fields.srcrat || "";
            normalizeIntegerValues(song);
            require("./hub.js").verifyFanRating(song);
            song.path = fields.path;  //note local path for hub sync
            recheckMetadata(song, res); });
    }


    function writePlaylistFile () {
        var songs = JSON.parse(exp.spec.songs).map((s) => s.split("/").pop());
        var txt = "#EXTM3U\n" + songs.join("\n") + "\n";
        jslf(fs, "writeFileSync", path.join(conf.exPath, exp.spec.plfilename),
             txt, "utf8");
    }


    function exportNextSong () {
        if(!exp.stat.remaining.length) {
            exp.stat.state = "Done";
            return; }
        const song = exp.stat.remaining.pop();
        const src = path.join(conf.musicPath, song);
        const exn = song.split(path.sep).pop();
        const dest = path.join(conf.exPath, exn);
        fs.copyFile(src, dest, function (err) {
            if(err) {
                exp.stat.state = "Failed";
                exp.stat.errmsg = "Could not copy " + exn;
                return console.log(err); }
            exp.stat.copied += 1;
            exportNextSong(); });
    }


    function playlistExport (req, res) {
        if(req.method === "GET") {
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify(exp)); }
        else { //POST
            exp.stat = {state:"Copying", copied:0};
            const fif = new formidable.IncomingForm();
            fif.parse(req, function (err, fields) {
                if(err) {
                    exp.stat.state = "Failed";
                    exp.stat.errmsg = "playlistExport form error " + err;
                    return resError(res, "playlistExport form error " + err); }
                exp.spec = fields;
                try {
                    exp.stat.remaining = JSON.parse(exp.spec.songs);
                    if(exp.spec.writepl) {
                        writePlaylistFile(); }
                    crepTimeout(exportNextSong, 200);
                } catch(e) {
                    exp.stat.state = "Failed";
                    exp.stat.errmsg = "playlistExport error " + e;
                    return resError(res, "playlistExport error " + e); }
                res.writeHead(200, {"Content-Type": "application/json"});
                res.end(JSON.stringify(exp)); }); }
    }


    function serveAudio (pu, req, res) {
        var rspec; var rescode; var resb;
        const fn = path.join(conf.musicPath, pu.query.path);
        if(caud.path !== fn) {
            caud.path = fn;
            caud.buf = jslf(fs, "readFileSync", fn);
            const ext = fn.slice(fn.lastIndexOf(".")).toLowerCase();
            caud.ct = fects[ext] || "audio/" + ext.slice(1); }
        const resh = {"Content-Type": caud.ct,
                    "Content-Length": caud.buf.length,
                    "Accept-Ranges": "bytes"};
        rescode = 200;
        resb = caud.buf;
        //console.log(req.headers);
        if(req.headers.range) {  //e.g. "bytes=0-1" (inclusive range)
            rspec = req.headers.range.split("=")[1];
            rspec = rspec.split("-");
            if(!rspec[1]) {  //second range index may be omitted
                rspec[1] = String(caud.buf.length - 1); }
            rspec = rspec.map((x) => parseInt(x, 10));
            const start = rspec[0];
            const end = rspec[1];
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
        res.writeHead(200, {"Content-Type": "text/plain; charset=UTF-8"});
        res.end(diggerVersion());
    }


    function changeConfig (req, res) {
        var vmf;
        const updat = new formidable.IncomingForm();
        updat.parse(req, function (err, fields) {
            if(err) {
                return resError(res, "changeConfig form error: " + err); }
            vmf = false;  //valid music folder
            try {
                vmf = jslf(fs, "lstatSync", fields.musicPath).isDirectory();
            } catch(ignore) {}
            if(!vmf) {
                return resError(res, "Folder not found: " + fields.musicPath); }
            try {
                if(jslf(fs, "lstatSync", fields.dbPath).isDirectory()) {
                    fields.dbPath = path.join(fields.dbPath, "digdat.json"); }
                //If the music path has changed, then the current digdat
                //file likely contains thousands of relative paths that
                //don't match real files anymore.  That leads to a seemingly
                //never ending sequence of player failures, which is not ok.
                //There is an off chance all the music files will also have
                //been moved over manually, but in that case the user can
                //restore the backup.
                if(conf.musicPath !== fields.musicPath) {
                    safeCopyJSONFile(conf.dbPath, backupFileName(conf.dbPath));
                    createDatabaseFile();
                    console.log("changeConfig musicPath: " + conf.musicPath +
                                " -> " + fields.musicPath);
                    conf.musicPath = fields.musicPath; }
                //Regardless of whether the db file was reinitialized or not,
                //copy it to the new location and remove the old one.
                if(conf.dbPath !== fields.dbPath) {
                    safeCopyJSONFile(conf.dbPath, fields.dbPath);
                    jslf(fs, "unlinkSync", conf.dbPath);
                    console.log("changeConfig dbPath: " + conf.dbPath +
                                " -> " + fields.dbPath);
                    conf.dbPath = fields.dbPath; }
                writeConfigurationFile();
            } catch(e) {
                return resError(res, e.toString()); }
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify(conf)); });
    }


    function doctext (pu, ignore /*req*/, res) {
        var fn = decodeURIComponent(pu.query.docurl);
        var sidx = fn.lastIndexOf("/");
        if(sidx >= 0) {
            fn = fn.slice(sidx + 1); }
        fn = path.join(getAppDir(), "docroot", "docs", fn);
        console.log("doctext reading " + fn);
        const text = jslf(fs, "readFileSync", fn, "utf8");
        res.writeHead(200, {"Content-Type": "text/plain; charset=UTF-8"});
        res.end(text);
    }


    function writeConfig (req, res) {
        const updat = new formidable.IncomingForm();
        updat.parse(req, function (err, fields) {
            if(err) {
                return resError(res, "writeConfig form error: " + err); }
            try {
                conf = JSON.parse(fields.cfg);
                writeConfigurationFile();
            } catch(e) {
                return resError(res, e.toString()); }
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify(conf)); });
    }


    return {
        //server utilities
        appdir: function () { return getAppDir(); },
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
        isMusicFile: function (fn) { return isMusicFile(fn); },
        mdtagsFromPath: function (rpath) { return mdtagsFromPath(rpath); },
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
        version: function (req, res) { return serveVersion(req, res); },
        cfgchg: function (req, res) { return changeConfig(req, res); },
        doctext: function (pu, req, res) { return doctext(pu, req, res); },
        wrtcfg: function (req, res) { return writeConfig(req, res); }
    };
}());
