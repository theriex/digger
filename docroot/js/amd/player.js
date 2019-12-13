/*global app, jt */
/*jslint browser, white, fudge, for, long */

app.player = (function () {
    "use strict";

    var stat = {status:"", song:null, tfqs:["B", "Z", "O"]};
    var ctrls = {};


    function hexToRGB(hexcolor) {
        var hcs = hexcolor.match(/\S\S/g);
        return {r:parseInt(hcs[0], 16),
                g:parseInt(hcs[1], 16),
                b:parseInt(hcs[2], 16)};
    }


    function saveSongDataIfModified (ignoreupdate) {
        if(!stat.songModified) { return; }
        app.db.updateSavedSongData(stat.song, function (updsong) {
            if(!ignoreupdate) {
                stat.song = updsong;
                stat.songModified = false; }
            jt.log("song data updated " + JSON.stringify(updsong)); });
    }


    function noteSongModified () {
        if(!stat.song) { return; }
        stat.songModified = true;
        if(stat.modtimer) {
            clearTimeout(stat.modtimer); }
        stat.modtimer = setTimeout(saveSongDataIfModified, 5000);
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
            if(!event.target || event.target.id !== "kwdin") {
                jt.evtend(event); } });  //ignore to avoid selecting ctrls
        jt.on("panplaydiv", "mouseup", function (event) {
            ctrls.el.pointingActive = false;
            ctrls.al.pointingActive = false;
            ctrls.rat.pointingActive = false;
            jt.evtend(event); });
    }


    function makeKeywordToggleButton (kwd, idx) {
        var tc = "kwdtogoff";
        if(stat.song.kws && stat.song.kws.csvcontains(kwd)) {
            tc = "kwdtogon"; }
        return ["button", {type:"button", cla:tc, id:"kwdtog" + idx,
                           onclick:jt.fs("app.player.togkwd(" + idx + ")")},
                kwd];
    }


    function verifyKeywordToggles () {
        //changing which keywords will be in use is done from the db panel.
        var dbo = app.db.data();
        if(!dbo) { return; }
        var html = [];
        html.push(["button", {type:"button", id:"kwdexpb",
                              onclick:jt.fs("app.player.togkwexp()")}, "+"]);
        html.push(["span", {id:"newkwspan"}]);
        stat.mainkwds = "";
        dbo.keywords.forEach(function (kwd, idx) {
            stat.mainkwds = stat.mainkwds.csvappend(kwd);
            html.push(makeKeywordToggleButton(kwd, idx)); });
        html.push(["span", {id:"extrakwspan"}]);
        jt.out("kwdsdiv", jt.tac2html(html));
    }


    function verifyOtherKeywords () {
        if(stat.otherkwdschecked) { return; }
        stat.otherkwdschecked = true;
        stat.otherkwds = "";
        var dbo = app.db.data();
        Object.keys(dbo.songs).forEach(function (path) {
            var song = dbo.songs[path];
            song.kws = song.kws || "";
            song.kws.csvarray().forEach(function (kwd) {
                if(!stat.mainkwds.csvcontains(kwd) &&
                   !stat.otherkwds.csvcontains(kwd)) {
                    stat.otherkwds = stat.otherkwds.csvappend(kwd); } }); });
    }


    function toggleKeywordsExpansion () {
        var togb = jt.byId("kwdexpb");
        if(togb.innerHTML === "+") {
            jt.out("newkwspan", jt.tac2html(
                [["input", {type:"text", id:"kwdin", size:10, value:"",
                            placeholder:"new keyword"}],
                 ["button", {type:"button", id:"addkwb",
                             onclick:jt.fs("app.player.addkwd()")}, "+"]]));
            verifyOtherKeywords();
            var html = [];
            stat.otherkwds.csvarray().forEach(function (kwd, idx) {
                html.push(makeKeywordToggleButton(kwd, idx + 4)); });
            jt.out("extrakwspan", jt.tac2html(html));
            togb.innerHTML = "-"; }
        else {
            jt.out("newkwspan", "");
            jt.out("extrakwspan", "");
            togb.innerHTML = "+"; }
    }


    function addNewKeyword() {
        var kwd = jt.byId("kwdin").value;
        if(!kwd || !kwd.trim()) { return; }
        //canonical form for a keyword is first letter capitalized.
        //multi-word keywords are possible, but horrible on real-estate,
        //semantically less than helpful, and usually reflect a lack of
        //thought.  Not a priority.
        kwd = kwd.toLowerCase().capitalize();
        if(!stat.otherkwds.csvcontains(kwd)) {
            stat.otherkwds = stat.otherkwds.csvappend(kwd); }
        if(!stat.song.kws.csvcontains(kwd)) {
            stat.song.kws = stat.song.kws.csvappend(kwd);
            noteSongModified();
            toggleKeywordsExpansion();   //clear expanded content
            toggleKeywordsExpansion(); } //rebuild with new kw
    }


    function toggleKeyword (idx) {
        stat.song.kws = stat.song.kws || "";
        var button = jt.byId("kwdtog" + idx);
        if(button.className === "kwdtogoff") {
            button.className = "kwdtogon";
            stat.song.kws = stat.song.kws.csvappend(button.innerHTML); }
        else {
            button.className = "kwdtogoff";
            stat.song.kws = stat.song.kws.csvremove(button.innerHTML); }
        noteSongModified();
    }


    function makeRatingValueControl () {
        jt.out("rvdiv", jt.tac2html(
            ["div", {cla:"ratstarscontainerdiv", id:"playerstarsdiv"},
             ["div", {cla:"ratstarsanchordiv", id:"playerstarsanchordiv"},
              [["div", {cla:"ratstarbgdiv"},
                ["img", {cla:"starsimg", src:"img/stars18ptCg.png"}]],
               ["div", {cla:"ratstarseldiv", id:"playerstarseldiv"},
                ["img", {cla:"starsimg", src:"img/stars18ptC.png"}]]]]]));
        ctrls.rat = {stat:{pointingActive:false},
                     posf:function (x, ignore /*y*/) {
                         //jt.log("ctrls.rat.posf x: " + x);
                         jt.byId("playerstarseldiv").style.width = x + "px";
                         var val = Math.round((x / 17) * 2);
                         if(stat.song) {
                             stat.song.rv = val;
                             noteSongModified(); } } };
        app.filter.movelisten("playerstarsanchordiv", ctrls.rat.stat,
                              ctrls.rat.posf);
        ctrls.rat.posf(0);  //no stars until set or changed.
    }


    function initializeDisplay () {
        jt.out("panplaydiv", jt.tac2html(
            [["div", {id:"mediadiv"}, "No songs on deck yet"],
             ["div", {id:"panpotsdiv"},
              [["div", {cla:"pandiv", id:"elpandiv"}],
               ["div", {cla:"pandiv", id:"alpandiv"}]]],
             ["div", {id:"keysratdiv"},
              [["div", {id:"kwdsdiv"}],
               ["div", {id:"rvdiv"}]]]]));
        makePanControls();
        verifyKeywordToggles();
        makeRatingValueControl();
    }


    function toggleTuningOptions (togstate) {
        var tdiv = jt.byId("playertuningdiv");
        if(!tdiv) { return; }  //nothing to do
        if(tdiv.innerHTML || !stat.song || togstate === "off") {
            tdiv.innerHTML = "";
            return; }
        var opts = [{lab:"Playable"}, {lab:"Tired"}, {lab:"Don't Suggest"}];
        if(stat.song.fq === "R") {
            opts[2].checked = "checked"; }
        else if(stat.tfqs.indexOf(stat.song.fq) >= 0) {
            opts[1].checked = "checked"; }
        else {
            opts[0].checked = "checked"; }
        var html = [];
        opts.forEach(function (opt, idx) {
            html.push(["div", {cla:"tuneoptiondiv"},
                       [["input", {type:"radio", id:"tunerad" + idx,
                                   name:"tuneoption", value:String(idx),
                                   checked:opt.checked,
                                   onclick:jt.fsd("app.player.fqradsel(" + 
                                                  idx + ")")}],
                        ["label", {fo:"tunerad" + idx}, opt.lab]]]); });
        tdiv.innerHTML = jt.tac2html(
            ["div", {id:"frequencyoptionsdiv"}, html]);
    }


    function handleFrequencyRadioSelect (idx) {
        switch(idx) {
        case 0: stat.song.fq = "P"; break;
        case 1: stat.song.fq = "B"; break;
        case 2: stat.song.fq = "R"; break; }
        noteSongModified();
    }


    function bumpPlayerLeftIfOverhang () {
        var player = jt.byId("playeraudio");
        var playw = player.offsetWidth;
        var maxw = jt.byId("panplaydiv").offsetWidth;
        maxw -= (2 * 6) + (2 * 8);  //padding and border
        if(playw > maxw) {
            var shift = Math.round(-0.5 * (playw - maxw));
            player.style.marginLeft = shift + "px"; }
    }


    function play () {
        stat.status = "playing";
        jt.log(JSON.stringify(stat.song));
        verifyKeywordToggles();
        if(!jt.byId("playerdiv")) {
            jt.out("mediadiv", jt.tac2html(
                ["div", {id:"playerdiv"},
                 [["div", {id:"playertitle"}, "Starting"],
                  ["div", {id:"playertuningdiv"}],
                  ["audio", {id:"playeraudio", controls:"controls",
                             autoplay:"autoplay"},  //may or may not happen
                   "WTF? Your browser doesn't support audio.."]]]));
            jt.on("playeraudio", "ended", app.player.next); }
        bumpPlayerLeftIfOverhang();
        var titleTAC = app.db.songTitleTAC(stat.song);
        titleTAC[2].unshift(jt.tac2html(
            ["div", {id:"playtitlebuttonsdiv"},
             [["a", {href:"#tuneoptions", title:"Tune Playback Options",
                     id:"tuneopta", onclick:jt.fs("app.player.tuneopt()")},
               ["img", {src:"img/tunefork.png", cla:"ptico"}]],
              ["a", {href:"#skip", title:"Skip To Next Song",
                     onclick:jt.fs("app.player.skip()")},
               ["img", {src:"img/skip.png", cla:"ptico"}]]]]));
        jt.out("playertitle", jt.tac2html(titleTAC));
        updatePanControl("al", stat.song.al);
        updatePanControl("el", stat.song.el);
        stat.song.rv = stat.song.rv || 0;  //verify numeric value
        ctrls.rat.posf(Math.round((stat.song.rv * 17) / 2));
        var player = jt.byId("playeraudio");
        player.src = "/audio?path=" + jt.enc(stat.song.path);
        //player.play() will fail in the promise if autoplay is disallowed.
        //Wrapping in a try block doesn't help.  Letting it go for now...
        player.play();
    }


    function next () {
        saveSongDataIfModified("ignoreUpdatedSongDataReturn");
        toggleTuningOptions("off");
        stat.status = "";
        stat.song = app.db.popdeck();
        if(!stat.song) {
            jt.out("mediadiv", "No songs to play."); }
        else {
            play(); }
    }


    function skip () {
        //if skipping a Tired song, bump the fq value
        if(stat.song && stat.song.fq) {
            var tfqidx = stat.tfqs.indexOf(stat.song.fq);
            if(tfqidx >= 0 && tfqidx < stat.tfqs.length - 1) {
                stat.song.fq = stat.tfqs[tfqidx + 1];
                noteSongModified(); } }
        next();
    }


    function deckUpdated () {
        if(!stat.status) {  //not playing anything yet, start the first song
            next(); }
    }


return {

    init: function () { initializeDisplay(); },
    deckUpdated: function () { deckUpdated(); },
    next: function () { next(); },
    skip: function () { skip(); },
    togkwd: function (idx) { toggleKeyword(idx); },
    tuneopt: function () { toggleTuningOptions(); },
    fqradsel: function (idx) { handleFrequencyRadioSelect(idx); },
    song: function () { return stat.song; },
    togkwexp: function () { toggleKeywordsExpansion(); },
    addkwd: function () { addNewKeyword(); }

};  //end of returned functions
}());

