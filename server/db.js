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
    var fs = require("fs");
    var dbo = null;
    var ws = [];  //The working set of available songs
    //when sorting the working set, prefer songs with segues to lower the
    //likelihood that the segued songs get overplayed relative to their
    //preceding tracks.


    function createDatabaseFile () {
        dbo = {version:"dv0.1", 
               scanned:"",  //ISO latest walk of song files
               written:new Date().toISOString(),
               keywords:["Dance", "Workout", "Morning"], 
               keysacc:false,  //customization option presented
               waitcodedays:{  //days required since last played before pulling
                   //"D": Deleted song file.  Kept for rating only
                   //"R": Reference only.  Never suggest.
                   "O":365,  //Overplayed.
                   "Z":180,  //Resting.
                   "B":90},  //Back-burner.
                   //"P": Programmable.  Generally available to play (default)
                   //"N": New. Preferred select once before reverting to "P"
               songs:[]};
        //Each song entry:
        //  fq: frequency. See waitcodedays values and comments
        //  lp: last played. Local time ISO (easier to read, not critical)
        //  rv: rating. 0 is unrated, then 1-10 (5 stars with halves)
        //  al: attention level (Social/Challenging) 0-99 default 49
        //  el: energy level (Chill/Amped) 0-99 default 49
        //  kws: CSV of selected keywords (case normalized to declared vals)
        //  pt: path tuple. artistFolder/albumFolder/songFileName
        //  ar: artist (from file metadata)
        //  ab: album (from file metatdata)
        //  ti: title (from file metatdata
        //  segs: [] A segue is ar/ab/ti/prob where prob is an *independent*
        //  percentage likelihood the segue will be used.  e.g. 0 is never,
        //  100 is always, 50 is a coin toss.
        fs.writeFileSync(dbPath, JSON.stringify(dbo), "utf8");
        console.log("Created " + dbPath);
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


    return {
        init: function () { initialize(); }
    };
}());
