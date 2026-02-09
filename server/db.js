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
    var exp = {stat:null, spec:null};
    var caud = {path:"", buf:null};


    function diggerVersion () {
        return "v1.6.46";
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
    function readConfigFile (contf) {
        var cfp = getConfigFileName();
        fs.readFile(cfp, "utf8", function (err, data) {
            if(err) {
                console.log("readConfigFile error reading " + cfp);
                throw err; }
            conf = JSON.parse(data);
            cleanLoadedConfig();
            // console.log("readConfigFile conf: " +
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
        readConfigFile(function (conf) {
            readDatabaseFile(function () {
                if(contf) {
                    contf(conf); } }); });
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


    function makeMetadataRef (tags) {
        var mrd = "I";    //incomplete identification
        if(tags && tags.title && tags.artist && tags.album) {
            mrd = "C";  } //complete identifying info
        const flds = ["title", "artist", "album"];
        flds.forEach(function (fld) {
            var val = tags[fld] || "";
            val = val.replace(/|/g, "");  //strip any contained delimiters
            mrd += "|" + val; });
        return mrd;
    }


    //If given, tags parameter has "title", "artist", "album" fields.
    //A song must have at least title and artist specified to be identified.
    //Updated tag info from metadata always takes precedence.
    function updateMetadata (song, tags) {
        if(!tags || !tags.title || !tags.artist) {
            console.log("guessing metadata from path " + song.path);
            tags = mdtagsFromPath(song.path); }
        if(!tags || !tags.title || !tags.artist) {
            console.log("missing metadata " + song.path);
            if(!song.fq.startsWith("U")) {  //mark as unreadable
                song.fq = "U" + song.fq; } }
        else {  //have at least title and artist, update song
            song.ar = tags.artist || song.ar;
            song.ar = song.ar.trim();
            song.ab = tags.album || song.ab || "Singles";
            song.ab = song.ab.trim();
            song.ti = tags.title || song.ti;
            song.ti = song.ti.trim();
            song.mddn = (tags.disk && tags.disk.no) || 0;
            song.mdtn = (tags.track && tags.track.no) || 0;
            song.genrejson = "";
            if(tags.genre) {
                song.genrejson = JSON.stringify(tags.genre); }
            const pmrd = song.mrd || "";
            song.mrd = makeMetadataRef(tags);
            if(pmrd !== song.mrd) {  //metadata has changed
                if(pmrd && song.lp) {  //song is not new and has been played
                    //bump lp to include updated song data in hubsync
                    song.lp = new Date().toISOString(); } } }
        return song;
    }


    // function consoleDumpMetadata (md) {
    //     if(!md) {
    //         return console.log("No md"); }
    //     const mdc = md.common;
    //     if(mdc) {
    //         delete mdc.picture;
    //         return console.log("md.common: " +
    //                            JSON.stringify(md.common, null, 2)); }
    //     console.log("md: " + JSON.stringify(md, null, 2));
    // }


    //create or update the song corresponding to the given a full file path.
    //contf is responsible for writing the updated dbo as needed.
    function readMetadata (ffp, contf) {
        mm.parseFile(ffp)
            .then(function (md) {
                //consoleDumpMetadata(md);
                var song = findOrAddDbSong(ffp);
                //console.log("rmd song: " + JSON.stringify(song, null, 2));
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


    function appendDigIgFoldsFileLines (ws) {
        const igfname = path.join(os.homedir(), ".digigfolds");
        if(jslf(fs, "existsSync", igfname)) {
            const fc = jslf(fs, "readFileSync", igfname, "utf8");
            fc.split("\n").forEach(function (igfoldname) {
                if(igfoldname) {
                    ws.igfolds.push(igfoldname); } }); }
    }


    function initIgnoreFolders (ws) {
        ws.igfolds = conf.dfltigfolds || [];
        ws.curracct = ws.curracct || getCurrentAccount();
        if(ws.curracct) {
            ws.igfolds = ws.curracct.igfolds || conf.dlftigfolds || [];
            if(!Array.isArray(ws.igfolds)) {  //bad config value
                ws.igfolds = conf.dfltigfolds || [];
                ws.curracct.igfolds = ws.igfolds; } }
        appendDigIgFoldsFileLines(ws);
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


    //Walk the file tree, starting at the root.  Return the updated dbo, but
    //leave it for the app to write so that the log can show if a previous
    //save gets overwritten, and digdat update listeners in the app are
    //notified as usual.
    function walkFiles (ws) {
        if(!ws.files.length) {
            dbo.scanned = new Date().toISOString();  //note completion time.
            //writeDatabaseObject();  //caller writes result merged data
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


    //The app can call wwwWriteDigDat while wwwReadSongFiles is ongoing, so
    //it is possible the dbo object being updated here could end up being an
    //older version of what is actually saved in digdat.
    function wwwReadSongFiles (req, res) {
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


    function wwwSongCount (ignore /*req*/, res) {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify({count:dbo.songcount,
                                status:state,
                                lastrpath:mostRecentRelativePathRead,
                                musicpath:conf.musicPath}));
    }


    function resError (res, msg, code) {
        code = code || 400;
        console.log("db resError " + code + ": " + msg);
        res.writeHead(code, {"Content-Type": "text/plain"});
        res.end(msg);
    }


    function fullFilePath (song) {
        var rp = song.path;
        if(rp.startsWith("/")) {
            rp = rp.slice(1); }
        return conf.musicPath + "/" + rp;
    }


    function writeUpdatedSongs (ws) {
        var song;
        if(ws.songs.length) {
            song = ws.songs.pop();
            readMetadata(fullFilePath(song), function (updsg) {
                ws.rsgs.push(updsg);
                console.log(new Date().toLocaleString() + " Updated " +
                            updsg.path);
                writeUpdatedSongs(ws); }); }
        else {
            writeDatabaseObject();
            console.log("writeUpdatedSongs finished.");
            ws.resp.writeHead(200, {"Content-Type": "application/json"});
            ws.resp.end(JSON.stringify(ws.rsgs)); }
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


    function serveAudio (req, res, pu) {
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


    function getDocContent (ignore /*req*/, res, pu) {
        var fn = decodeURIComponent(pu.query.docurl);
        var sidx = fn.lastIndexOf("/");
        if(sidx >= 0) {
            fn = fn.slice(sidx + 1); }
        fn = path.join(getAppDir(), "docroot", "docs", fn);
        console.log("getDocContent reading " + fn);
        const text = jslf(fs, "readFileSync", fn, "utf8");
        res.writeHead(200, {"Content-Type": "text/plain; charset=UTF-8"});
        res.end(text);
    }


    function returnJSON (res, obj) {
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(obj));
    }


    function wwwReadConfig (ignore /*req*/, res) {
        readConfigFile(function (config) {
            returnJSON(res, config); });
    }


    function wwwReadDigDat (ignore /*req*/, res) {
        readDatabaseFile(function (digdat) {
            returnJSON(res, digdat); });
    }


    function wwwWriteConfig (req, res) {
        const updat = new formidable.IncomingForm();
        updat.parse(req, function (err, fields) {
            if(err) {
                return resError(res, "wwwwriteConfig form error: " + err); }
            try {
                conf = JSON.parse(fields.cfg);
                writeConfigurationFile();
            } catch(e) {
                return resError(res, e.toString()); }
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify(conf)); });
    }


    function wwwWriteDigDat (req, res) {
        var updat = new formidable.IncomingForm();
        updat.parse(req, function (err, fields) {
            if(err) {
                console.log("wwwWriteDigDat form error: " + err); }
            try {
                dbo = JSON.parse(fields.dbo);
                writeDatabaseObject();
            } catch(e) {
                return resError(res, e.toString()); }
            res.writeHead(200, {"Content-Type": "application/json"});
            res.end(JSON.stringify(dbo)); });
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
        readConfig: wwwReadConfig,
        readDigDat: wwwReadDigDat,
        writeConfig: wwwWriteConfig,
        writeDigDat: wwwWriteDigDat,
        readsongs: wwwReadSongFiles,
        songscount: wwwSongCount,
        plistexp: playlistExport,
        audio: serveAudio,
        version: serveVersion,
        cfgchg: changeConfig,
        doctext: getDocContent
    };
}());
