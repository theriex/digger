/*global app, jt */
/*jslint browser, white, fudge, for, long */

app.player = (function () {
    "use strict";

    var stat = {status:"", song:null};
    var ctrls = {};


    function hexToRGB(hexcolor) {
        var hcs = hexcolor.match(/\S\S/g);
        return {r:parseInt(hcs[0], 16),
                g:parseInt(hcs[1], 16),
                b:parseInt(hcs[2], 16)};
    }


    function noteSongModified () {
        stat.songModified = true;
        if(stat.modtimer) {
            clearTimeout(stat.modtimer); }
        stat.modtimer = setTimeout(function () {
            if(!stat.songModified) { return; }
            jt.call("POST", "/songupd", jt.objdata(stat.song),
                    function (updsong) {
                        stat.song = updsong;
                        stat.songModified = false;
                        jt.log("song data updated " + updsong.path); },
                    function (code, errtxt) {
                        jt.out("song update err " + code + ": " + errtxt); },
                    jt.semaphore("player.noteSongModified")); }, 5000);
    }


    function updatePanControl (id, val) {
        if(!val && val !== 0) {
            val = 49; }
        if(typeof val === "string") {
            val = parseInt(val, 10); }
        if(stat.song) {
            stat.song[id] = val; }
        noteSongModified();
        //set knob face color from gradient
        var g = app.filter.gradient();
        g = {f:hexToRGB(g.left), t:hexToRGB(g.right)};  //from (left) to (right)
        var pct = (val + 1) / 100;
        var res = {r:0, g:0, b:0};
        Object.keys(res).forEach(function (key) {
            res[key] = Math.round(g.f[key] + (g.t[key] - g.f[key]) * pct); });
        var pfd = jt.byId(id + "panfacediv");
        pfd.style.backgroundColor = "rgb(" + 
            res.r + ", " + res.g + ", " + res.b + ")";
        //rotate knob to value
        var anglemax = 145;
        var rot = Math.round(2 * anglemax * pct) - anglemax;
        pfd.style.transform = "rotate(" + rot + "deg)";
    }


    function createPanControl (id, det) {
        var pc = {fld:det.fld, pn:det.pn, low:det.low, high:det.high,
                  pointingActive:false};
        ctrls[id] = pc;
        jt.out(id + "pandiv", jt.tac2html(
            ["div", {cla:"pancontdiv", id:pc.fld + "pancontdiv"},
             [["div", {cla:"panleftlabdiv", id:pc.fld + "panlld"}, pc.low],
              ["div", {cla:"panrightlabdiv", id:pc.fld + "panrld"}, pc.high],
              ["div", {cla:"panfacediv", id:pc.fld + "panfacediv"},
               ["img", {cla:"panfaceimg", src:"img/panface.png"}]],
              ["div", {cla:"panbgdiv", id:pc.fld + "panbgdiv"},
               ["img", {cla:"panbackimg", src:"img/panback.png"}]],
              ["div", {cla:"pandragdiv", id:pc.fld + "pandragdiv"}]]]));
        //pack the control widthwise
        var pk = {leftlab:{elem:jt.byId(id + "panlld")},
                  rightlab:{elem:jt.byId(id + "panrld")},
                  panbg:{elem:jt.byId(id + "panbgdiv")},
                  panface:{elem:jt.byId(id + "panfacediv")}};
        Object.keys(pk).forEach(function (key) {
            pk[key].bbox = pk[key].elem.getBoundingClientRect(); });
        var left = 8 + pk.leftlab.bbox.width;
        pk.panbg.elem.style.left = left + "px";
        pk.panface.elem.style.left = left + "px";
        ctrls[id].width = left + 44 + pk.rightlab.bbox.width + 5;
        var pds = [jt.byId(id + "pancontdiv"), jt.byId(id + "pandiv"),
                   jt.byId(id + "pandragdiv")];
        pds.forEach(function (panel) {
            panel.style.width = ctrls[id].width + "px";
            panel.style.height = "40px"; });
        //activate the control
        ctrls[id].posf = function (x, ignore /*y*/) {
            ctrls[id].val = Math.round((x * 99) / ctrls[id].width);
            updatePanControl(ctrls[id].fld, ctrls[id].val); };
        app.filter.movelisten(id + "pandragdiv", ctrls[id], ctrls[id].posf);
    }


    function makePanControls () {
        var filters = app.filter.filters();
        createPanControl("el", filters[0]);
        createPanControl("al", filters[1]);
        updatePanControl("el");
        updatePanControl("al");
        jt.on("panplaydiv", "mousedown", function (event) {
            jt.evtend(event); });  //ignore to avoid selecting ctrls
        jt.on("panplaydiv", "mouseup", function (event) {
            ctrls.el.pointingActive = false;
            ctrls.al.pointingActive = false;
            jt.evtend(event); });
    }


    function verifyKeywordToggles () {
        var html = [];
        //changing which keywords will be in use is done from the db panel.
        var dbo = app.db.data();
        if(!dbo) { return; }
        dbo.keywords.forEach(function (kwd, idx) {
            var tc = "kwdtogoff";
            if(stat.song.kws && stat.song.kws.csvcontains(kwd)) {
                tc = "kwdtogon"; }
            html.push(
                ["button", {type:"button", cla:tc, id:"kwdtog" + idx,
                            onclick:jt.fs("app.player.togkwd(" + idx + ")")},
                 kwd]); });
        jt.out("kwdsdiv", jt.tac2html(html));
    }


    function toggleKeyword (idx) {
        var dbo = app.db.data();
        stat.song.kws = stat.song.kws || "";
        var button = jt.byId("kwdtog" + idx);
        if(button.className === "kwdtogoff") {
            button.className = "kwdtogon";
            stat.song.kws = stat.song.kws.csvappend(dbo.keywords[idx]); }
        else {
            button.className = "kwdtogoff";
            stat.song.kws = stat.song.kws.csvremove(dbo.keywords[idx]); }
        noteSongModified();
    }


    function initializeDisplay () {
        jt.out("panplaydiv", jt.tac2html(
            [["div", {id:"mediadiv"}, "No songs on deck yet"],
             ["div", {id:"panpotsdiv"},
              [["div", {cla:"pandiv", id:"elpandiv"}],
               ["div", {cla:"pandiv", id:"alpandiv"}]]],
             ["div", {id:"kwdsdiv"}]]));
        makePanControls();
        verifyKeywordToggles();
    }


    function play () {
        stat.status = "playing";
        jt.log(JSON.stringify(stat.song));
        updatePanControl("al", stat.song.al);
        updatePanControl("el", stat.song.el);
        verifyKeywordToggles();
        if(!jt.byId("playerdiv")) {
            jt.out("mediadiv", jt.tac2html(
                ["div", {id:"playerdiv"},
                 [["div", {id:"playertitle"}, "Starting"],
                  ["audio", {id:"playeraudio", controls:"controls",
                             autoplay:"autoplay"},  //may or may not happen
                   "WTF? Your browser doesn't support audio.."]]]));
            jt.on("playeraudio", "ended", app.player.next); }
        jt.out("playertitle", jt.tac2html(app.db.songTitleTAC(stat.song)));
        var player = jt.byId("playeraudio");
        player.src = "/audio?path=" + jt.enc(stat.song.path);
        player.play();
    }


    function next () {
        stat.status = "";
        stat.song = app.db.popdeck();
        if(!stat.song) {
            jt.out("mediadiv", "No songs to play."); }
        else {
            play(); }
    }


    function deckUpdated () {
        if(!stat.status) {  //not playing anything yet, start the first song
            next(); }
    }


return {

    init: function () { initializeDisplay(); },
    deckUpdated: function () { deckUpdated(); },
    next: function () { next(); },
    togkwd: function (idx) { toggleKeyword(idx); }

};  //end of returned functions
}());

