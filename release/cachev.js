/*jslint node, white, fudge */

var cachev = (function () {
    "use strict";

    var fs = require("fs");
    var ws = {
        sr:"docroot",  //search root relative to one level up from this script
        srch:["css", //reload updated look
              "img", //use most recent images
              "js"], //need consistent fetch with most recent source
        upd:["index.html", //index page needs to load most recent app.js
             "js/app.js"], //load most recent application source
        mrmf:{name:"unknown", time:"0"}};


    var walker = {
        walkFiles: function  () {
            var dn = __dirname;
            ws.sr = dn.slice(0, dn.lastIndexOf("/") + 1) + ws.sr + "/";
            //console.log("ws.srchroot: " + ws.srchroot);
            ws.files = [];
            ws.dirs = ws.srch.map((dn) => ws.sr + dn);
            walker.checkNext(); },
        checkNext: function () {
            if(ws.files.length) {
                return walker.checkFile(ws.files.pop()); }
            if(ws.dirs.length) {
                return walker.walkDirectory(ws.dirs.pop()); }
            console.log("Most recently modified: " + ws.mrmf.name)
            updater.updateSourceCode(); },
        checkFile: function (path) {
            //console.log("checkFile: " + path);
            fs.stat(path, function (err, stats) {
                if(err) { throw err; }
                var mod = stats.mtime.toISOString();
                if(mod > ws.mrmf.time) {
                    ws.mrmf = {name:path, time:mod}; }
                walker.checkNext(); }); },
        isIgnoreFile: function (fn) {
            if(fn.startsWith(".")) { return true; }
            if(fn === "__pycache__") { return true; }
            if(fn.endsWith("~")) { return true; }
            return false; },
        walkDirectory: function (dir) {
            //console.log("walkDirectory: " + dir);
            var options = {encoding:"utf8", withFileTypes:true};
            fs.readdir(dir, options, function (err, dirents) {
                if(err) { throw err; }
                dirents.forEach(function (dirent) {
                    if(!walker.isIgnoreFile(dirent.name)) {
                        var path = dir + "/" + dirent.name;
                        if(dirent.isFile()) {
                            ws.files.push(path); }
                        else if(dirent.isDirectory()) {
                            ws.dirs.push(path); } } });
                walker.checkNext(); }); }
    };


    var updater = {
        updateSourceCode: function () {
            if(!ws.cbv) {  //make YYMMDD cache bust value
                var iso = ws.mrmf.time;
                ws.cbv = iso.slice(2,4) + iso.slice(5,7) + iso.slice(8,10);
                ws.cbtag = "v=" + ws.cbv;
                console.log("Cache bust version tag: v=" + ws.cbv); }
            if(ws.upd.length) {
                return updater.updateFile(ws.upd.pop()); } },
        updateFile: function (fn) {
            var path = ws.sr + fn;
            fs.readFile(path, "utf8", function (err, text) {
                if(err) { throw err; }
                var treg = /v=\d{6}/g;
                var match = text.match(treg);
                if(match && match[0] !== ws.cbtag) {  //needs updating
                    text = text.replace(treg, ws.cbtag);
                    fs.writeFileSync(path, text, "utf8");
                    console.log("Updated " + path); }
                updater.updateSourceCode(); }); }
    };


    return {
        update: function () { walker.walkFiles(); }
    };
}());

cachev.update();
