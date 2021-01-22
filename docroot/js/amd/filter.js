/*global app, jt */
/*jslint browser, white, fudge, for, long */

app.filter = (function () {
    "use strict";

    var ctrls = {activecolor:"#ffab00", movestats:[], trapdrag:true,
                 el:{fld:"el", pn:"Energy Level",
                     low:"Chill", high:"Amped"},
                 al:{fld:"al", pn:"Approachability", 
                     low:"Easy", high:"Hard"},
                 rat:{pn:"Minimum Rating", w:85, h:15,
                      tagf:{labels:["Include Untagged",
                                    "Tagged Only",
                                    "Untagged Only"],
                            titles:["Include untagged songs on deck.",
                                    "Only play songs with keywords tagged.",
                                    "Only play songs without keywords."],
                            idx:0}},
                 fq:{pn:"Frequency Eligible"}};
    var ranger = {entire:{x:0, y:0, w:270, h:80},
                  panel:{outer:{x:25, y:0, w:244, h:56},
                         inner:{x:27, y:2, w:240, h:54},
                         gradient:{left:"0cd8e5", right:"faee0a"}},
                  vnob:{x:0, y:5, w:21, h:10, maxy:52},
                  hnob:{x:25, y:59, w:10, h:21, maxx:263}};


    function findSetting (avs) {
        var settings = app.filter.settings() || {};
        settings.ctrls = settings.ctrls || [];
        return settings.ctrls.find((x) =>
            Object.entries(avs).every(function ([attr, val]) {
                return x[attr] === val; }));
    }


    function dimstyle (dims, mousearea) {
        var rd = {x:dims.x, y:dims.y, w:dims.w, h:dims.h};
        if(mousearea === "maxy") {
            rd.h = dims.maxy - rd.y; }
        else if(mousearea === "maxx") {
            rd.w = dims.maxx - rd.x; }
        var style = "left:" + rd.x + "px;" +
                    "top:" + rd.y + "px;" +
                    "width:" + rd.w + "px;" +
                    "height:" + rd.h + "px;";
        return style;
    }


    function touchEventToOffsetCoords (event) {
        var rect = event.target.getBoundingClientRect();
        var coords = {x:event.targetTouches[0].pageX - rect.left,
                      y:event.targetTouches[0].pageY - rect.top};
        return coords;
    }


    function attachMovementListeners (divid, stat, posf) {
        var div = jt.byId(divid);
        jt.on(div, "mousedown", function (event) {
            stat.pointingActive = true;
            posf(event.offsetX, event.offsetY); });
        jt.on(div, "mouseup", function (ignore /*event*/) {
            stat.pointingActive = false; });
        //Not tracking mouseout to stop pointing, since it is easy to drag
        //past the bounding tracking div while trying to adjust.  Rather err
        //on the side of live than dead for dragging.  Right approach is to
        //capture mouseup at the panel level and stop all pointing.
        // jt.on(div, "mouseout", function (event) {
        //     stat.pointingActive = false; });
        jt.on(div, "mousemove", function (event) {
            if(stat.pointingActive) {
                posf(event.offsetX, event.offsetY); } });
        jt.on(div, "click", function (event) {
            stat.pointingActive = false;
            posf(event.offsetX, event.offsetY); });
        //Touch interfaces are essentially the same as the mouse actions.
        //They may be intermixed on devices that support both interfaces.
        jt.on(div, "touchstart", function (event) {
            stat.pointingActive = true;
            var coords = touchEventToOffsetCoords(event);
            posf(coords.x, coords.y); });
        jt.on(div, "touchend", function (ignore /*event*/) {
            stat.pointingActive = false; });
        jt.on(div, "touchcancel", function (ignore /*event*/) {
            stat.pointingActive = false; });
        jt.on(div, "touchmove", function (event) {
            if(stat.pointingActive) {
                posf(event.offsetX, event.offsetY); } });
    }


    function updateRangeControlFocus (cid, rcr) {
        //set the width of the range focus using the percentage indicated by
        //the position of the vertical slider
        var invy = ranger.vnob.maxy - rcr.cy - ranger.vnob.y;
        var rangemax = ranger.vnob.maxy - ranger.vnob.y;
        var pcnt = invy / rangemax;
        var focw = Math.round(pcnt * ranger.panel.inner.w);
        //adjust the percentage so the midpoint of the focus is zero
        var basex = rcr.cx - ranger.hnob.x;
        rangemax = ranger.hnob.maxx - ranger.hnob.x;
        pcnt = -1 * (0.5 - (basex / rangemax));
        //update the left and right curtains to reflect the focus.
        var curtw = Math.floor((ranger.panel.inner.w - focw) / 2);
        var ladj = curtw + Math.round(2 * pcnt * curtw);
        var radj = curtw - Math.round(2 * pcnt * curtw);
        jt.byId(cid + "lcdiv").style.width = ladj + "px";
        jt.byId(cid + "rcdiv").style.width = radj + "px";
        //update the current range focus min/max search values
        rcr.rgfoc.min = Math.round((ladj / rangemax) * 100);
        rcr.rgfoc.max = 99 - Math.round((radj / rangemax) * 100);
        //jt.out(cid + "tit", "rlx:" + rlx + " rrx:" + rrx);
        app.filter.filterValueChanged();
    }


    function attachRangeCtrlMovement (cid) {
        var rcr = ctrls[cid];
        //vertical
        rcr.vstat = {pointingActive:false};
        ctrls.movestats.push(rcr.vstat);
        rcr.vpos = function (ignore /*x*/, y) {
            rcr.cy = y;  //base vertical offset is zero
            jt.byId(cid + "vnd").style.top = rcr.cy + "px";
            updateRangeControlFocus(cid, rcr); };
        attachMovementListeners(cid + "vmad", rcr.vstat, rcr.vpos);
        rcr.vpos(0, Math.floor(ranger.vnob.maxy / 2));
        //horizontal
        rcr.hstat = {pointingActive:false};
        ctrls.movestats.push(rcr.hstat);
        rcr.hpos = function (x, ignore /*y*/) {
            rcr.cx = x + ranger.hnob.x;
            jt.byId(cid + "hnd").style.left = rcr.cx + "px";
            updateRangeControlFocus(cid, rcr); };
        attachMovementListeners(cid + "hmad", rcr.hstat, rcr.hpos);
        rcr.hpos(Math.floor((ranger.hnob.maxx - ranger.hnob.x) / 2), 0);
    }


    function addRangeSettingsFunc (cid) {
        ctrls[cid].settings = function () {
            return {tp:"range", c:cid,
                    v:ctrls[cid].cy,
                    h:ctrls[cid].cx - ranger.hnob.x}; };
    }


    function initRangeSetting (cid) {
        var dfltset = {v:18, h:117};
        var settings = findSetting({tp:"range", c:cid}) || dfltset;
        if(settings.v !== 0) {  //zero is valid value, check for invalid.
            settings.v = settings.v || dfltset.v;  //verify value defined
            if(!Number.isInteger(settings.v)) {    //if not int, use default
                settings.v = dfltset.v; }
            settings.v = Math.floor(settings.v); } //verify true integer
        if(settings.h !== 0) {  //zero is valid, value, check for invalid
            if(!Number.isInteger(settings.h)) {    //if not int, use default
                settings.h = dfltset.h; }
            settings.h = Math.floor(settings.h); } //verify true integer
        ctrls[cid].vpos(0, settings.v);
        ctrls[cid].hpos(settings.h, 0);
    }


    function addRangeSongMatchFunc (cid) {
        //Every song should have a numeric value set.
        ctrls[cid].match = function (song) {
            if(song[cid] >= ctrls[cid].rgfoc.min && 
               song[cid] <= ctrls[cid].rgfoc.max) {
                return true; }
            return false; };
    }


    function createRangeControl (cid) {
        jt.out(cid + "div", jt.tac2html(
            [["img", {src:"img/ranger.png"}],
             ["div", {cla:"rangetitlediv", id:cid + "tit"}, ctrls[cid].pn],
             ["div", {cla:"rangelowlabeldiv"}, ctrls[cid].low],
             ["div", {cla:"rangehighlabeldiv"}, ctrls[cid].high],
             ["div", {cla:"rangeleftcurtdiv", id:cid + "lcdiv"}],
             ["div", {cla:"rangerightcurtdiv", id:cid + "rcdiv"}],
             ["div", {cla:"vnobdiv", id:cid + "vnd",
                      style:dimstyle(ranger.vnob)},
              ["img", {src:"img/vknob.png"}]],
             ["div", {cla:"hnobdiv", id:cid + "hnd",
                      style:dimstyle(ranger.hnob)},
              ["img", {src:"img/hknob.png"}]],
             ["div", {cla:"mouseareadiv", id:cid + "vmad",
                      style:dimstyle(ranger.vnob, "maxy")}],
             ["div", {cla:"mouseareadiv", id:cid + "hmad",
                      style:dimstyle(ranger.hnob, "maxx")}]]));
        ctrls[cid].rgfoc = {min:0, max:99};
        attachRangeCtrlMovement(cid);
        addRangeSettingsFunc(cid);
        addRangeSongMatchFunc(cid);
        initRangeSetting(cid);
    }


    function containingDivEventTraps () {
        //trap and ignore clicks in the controls container div to avoid
        //selecting controls when you want to be changing a control value.
        jt.on("panfiltdiv", "mousedown", function (event) {
            if(ctrls.trapdrag) {
                jt.evtend(event); }});
        //stop tracking if the mouse is released outside of the control area,
        //so that tracking doesn't get stuck "on" leaving the drag still in
        //progress.  It might feel more resilient if the trap at this level
        //instead passed the event through to the currently active control,
        //then the general trap would be at the next containing div instead.
        jt.on("panfiltdiv", "mouseup", function (event) {
            ctrls.movestats.forEach(function (movestat) {
                movestat.pointingActive = false; });
            jt.evtend(event); });
    }


    function mainLayout () {
        jt.out("panfiltdiv", jt.tac2html(
            ["div", {id:"panfiltcontentdiv"},
             [["div", {cla:"paneltitlediv"}, "FILTERS"],
              ["div", {id:"rangesdiv"},
               [["div", {cla:"rangectrldiv", id:"eldiv"}],
                ["div", {cla:"rangectrldiv", id:"aldiv"}]]],
              ["div", {id:"bowtiesdiv"}],
              ["div", {id:"ratdiv"}]]]));
        containingDivEventTraps();
    }


    //manager dispatch function string shorthand generator
    function mdfs (mgrfname, ...args) {
        var pstr = app.paramstr(args);
        mgrfname = mgrfname.split(".");
        var fstr = "app.filter.managerDispatch('" + mgrfname[0] + "','" +
            mgrfname[1] + "'" + pstr + ")";
        if(pstr !== ",event") {  //don't return false from event hooks
            fstr = jt.fs(fstr); }
        return fstr;
    }


    //General container for all managers, used for dispatch
    var mgrs = {};


    //BowTie manager handles 3-way toggle controls for keyword filtering
    mgrs.btc = (function () {
        var tbs = [{sy:"-", id:"neg", bp:"left", ti:"No $NAME Songs"},
                   {sy:"o", id:"off", bp:"mid", ti:"Unset $NAME Filtering"},
                   {sy:"+", id:"pos", bp:"right", ti:"Only $NAME Songs"}];
        var labind = {neg:{td:"line-through", fw:"normal"},
                      off:{td:"none", fw:"normal"},
                      pos:{td:"none", fw:"bold"}};
        var kwdefs = null;
    return {
        makeControl: function (btc, idx) {
            jt.out("btdiv" + idx, jt.tac2html(
                [["div", {cla:"btlabeldiv", id:"btlab" + idx}, btc.pn],
                 ["div", {cla:"btbuttonsdiv"}, tbs.map((b) =>
                     ["button", {type:"button", cla:"bt" + b.bp + "b",
                                 id:"btb" + idx + b.id,
                                 title:b.ti.replace(/\$NAME/g, btc.pn),
                                 onclick:mdfs("btc.setValue", idx, b.id)},
                      b.sy])]])); },
        updateToggleIndicators: function (idx, tog) {
            tbs.forEach(function (tb) {
                var button = jt.byId("btb" + idx + tb.id);
                if(tog === tb.id && tog !== "off") {
                    button.style.fontWeight = "bold";
                    button.style.color = ctrls.activecolor; }
                else {
                    button.style.fontWeight = "normal";
                    button.style.color = "#ffffff"; } }); },
        updateToggleLabel: function (idx, tog) {
            var labdiv = jt.byId("btlab" + idx);
            var kwd = ctrls.bts[idx].pn;
            if(tog === "off") {
                kwd = ["a", {href:"#swapkeyword", cla:"btlaba",
                             onclick:mdfs("btc.activateLabel", idx)}, kwd]; }
            jt.out("btlab" + idx, jt.tac2html(kwd));
            labdiv.style.textDecoration = labind[tog].td;
            labdiv.style.fontWeight = labind[tog].fw; },
        activateLabel: function (idx) {
            ctrls.trapdrag = false;
            var kwd = ctrls.bts[idx].pn;
            jt.out("btlab" + idx, jt.tac2html(
                ["select", {id:"btswapsel" + idx, title:"Swap Keyword",
                            onchange:mdfs("btc.swapKeyword", idx)},
                 [["option", {value:kwd}, kwd],
                  ...kwdefs.slice(4).map((kd) =>
                      ["option", {value:kd.kw}, kd.kw])]])); },
        swapKeyword: function (idx) {
            ctrls.trapdrag = true;
            var kwd = jt.byId("btswapsel" + idx).value;
            var pos = idx + 1;
            app.db.managerDispatch("kwd", "swapFilterKeyword", kwd, pos); },
        setValue: function (idx, tog) {
            ctrls.trapdrag = true;
            ctrls.bts[idx].tog = tog;  //note the value for filtering
            mgrs.btc.updateToggleIndicators(idx, tog);
            mgrs.btc.updateToggleLabel(idx, tog);
            app.db.deckupd(); },
        addBTSettingsFunc: function (idx) {
            var bt = ctrls.bts[idx];
            bt.settings = function () {
                return {tp:"kwbt", k:bt.pn, v:bt.tog}; }; },
        addBTSongMatchFunc: function (idx) {
            var bt = ctrls.bts[idx];
            bt.match = function (song) {
                if(bt.tog === "neg" &&
                   song.kws && (song.kws.indexOf(bt.pn) >= 0)) {
                    return false; }
                if(bt.tog === "pos" &&
                   (!song.kws || (song.kws.indexOf(bt.pn) < 0))) {
                    return false; }
                return true; }; },
        makeFiltersAndDivs: function () {
            var btdivs = [];
            kwdefs.slice(0, 4).map((kd) => kd.kw).forEach(function (kwd, idx) {
                ctrls.bts.push({pn:kwd, tog:"off"});
                mgrs.btc.addBTSettingsFunc(idx);
                mgrs.btc.addBTSongMatchFunc(idx);
                btdivs.push(["div", {cla:"bowtiediv", id:"btdiv" + idx}]); });
            jt.out("bowtiesdiv", jt.tac2html(btdivs)); },
        createAndInitControls: function () {
            ctrls.bts.forEach(function (bt, idx) {
                mgrs.btc.makeControl(bt, idx);
                var dfltset = {v:"off"};
                var setting = findSetting({tp:"kwbt", k:bt.pn}) || dfltset;
                mgrs.btc.setValue(idx, setting.v || dfltset.v); }); },
        rebuildControls: function () {
            kwdefs = app.db.managerDispatch("kwd", "defsArray", true);
            ctrls.bts = [];
            mgrs.btc.makeFiltersAndDivs();
            mgrs.btc.createAndInitControls(); }
    };  //end mgrs.btc returned functions
    }());


    //Minimum rating and untagged filter
    mgrs.mruc = (function () {
    return {
        writeHTML: function (divid) {
            jt.out(divid, jt.tac2html(
                [["span", {cla:"gtoreqspan"}, "&#x2265;&nbsp;"],
                 ["div", {cla:"ratstarscontainerdiv", id:"filterstarsdiv"},
                  ["div", {cla:"ratstarsanchordiv", id:"filterstarsanchordiv"},
                   [["div", {cla:"ratstarbgdiv"},
                     ["img", {cla:"starsimg", src:"img/stars18ptCg.png"}]],
                    ["div", {cla:"ratstarseldiv", id:"filterstarseldiv"},
                     ["img", {cla:"starsimg", src:"img/stars18ptC.png"}]]]]],
                 ["button", {type:"button", id:"incluntb",
                             style:"color:" + ctrls.activecolor,
                             onclick:mdfs("mruc.toggleTagFiltering")},
                  ctrls.rat.tagf.labels[0]],
                 ["div", {id:"fqftogdiv"}]])); },
        makeControls: function () {
            ctrls.rat.stat = {pointingActive:false};
            ctrls.movestats.push(ctrls.rat.stat);
            ctrls.rat.posf = function (x, ignore /*y*/) {
                ctrls.rat.stat.minrat = Math.max(Math.round((x / 17) * 2), 1);
                jt.byId("filterstarseldiv").style.width = x + "px";
                jt.byId("filterstarsdiv").title = "Match songs rated " +
                    ctrls.rat.stat.minrat + " or higher.";
                app.db.deckupd(); };
            attachMovementListeners("filterstarsanchordiv", ctrls.rat.stat,
                                    ctrls.rat.posf); },
        makeFilter: function () {
            ctrls.rat.settings = function () {
                return {tp:"minrat", u:ctrls.rat.tagf.idx,
                        m:ctrls.rat.stat.minrat}; };
            ctrls.rat.match = function (song) {
                if(ctrls.rat.stat.minrat >= 2 &&  //slider at least at one star
                   song.rv < ctrls.rat.stat.minrat) {  //song below min
                    return false; }
                if(!song.kws && ctrls.rat.tagf.idx === 1) {
                    return false; }  //song is untagged, playing tagged only
                if(song.kws && ctrls.rat.tagf.idx === 2) {
                    return false; }  //song is tagged, playing untagged only
                return true; }; },
        setMinRating: function (rvs) {
            var dfltset = {u:0, m:4};
            rvs = rvs || dfltset;
            rvs.u = rvs.u || dfltset.u;
            rvs.m = rvs.m || dfltset.m;
            ctrls.rat.tagf.idx = rvs.u - 1;  //incremented in toggle call
            mgrs.mruc.toggleTagFiltering();
            //set ctrls.rat.stat.minrat via ui control update
            ctrls.rat.posf(Math.round((rvs.m / 2) * 17)); },
        toggleTagFiltering: function () {
            ctrls.rat.tagf.idx = (ctrls.rat.tagf.idx + 1) % 3;
            var button = jt.byId("incluntb");
            button.innerHTML = ctrls.rat.tagf.labels[ctrls.rat.tagf.idx];
            button.title = ctrls.rat.tagf.titles[ctrls.rat.tagf.idx];
            app.db.deckupd(); },
        init: function (divid) {
            mgrs.mruc.writeHTML(divid);
            mgrs.mruc.makeControls();
            mgrs.mruc.makeFilter();
            mgrs.mruc.setMinRating(findSetting({tp:"minrat"}));
            mgrs.fq.init("fqftogdiv"); }
    };  //end of mgrs.mruc returned functions
    }());


    //Frequency filter (removes songs that were played recently)
    mgrs.fq = (function () {
        var fqb = "on";  //"off" to deactivate frequency filtering
        var waitdays = null;
    return {
        initWaitDays: function () {
            var settings = mgrs.stg.settings();
            settings.waitcodedays = settings.waitcodedays || {
                B:90,   //Backburner songs max once per 90 days by default
                Z:180,  //Sleeper songs max once per 180 days by default
                O:365}; //Overplayed songs max once per year by default
            waitdays = {
                N:1,  //New songs should get marked as P when played first time
                P:1,  //Playable songs get played at most once per day
                B:settings.waitcodedays.B,
                Z:settings.waitcodedays.Z,
                O:settings.waitcodedays.O}; },
        writeHTML: function (divid) {
            jt.out(divid, jt.tac2html(
                ["button", {type:"button", id:"fqtogb",
                            onclick:mdfs("fq.toggleFreqFiltering")},
                 "Fq"])); },
        toggleFreqFiltering: function (value) {
            if(!value) {
                if(fqb === "on") {
                    value = "off"; }
                else {
                    value = "on"; } }
            fqb = value;
            var button = jt.byId("fqtogb");
            if(fqb === "on") {
                button.title = "Song play frequency filtering active.";
                button.style.background = ctrls.activecolor; }
            else {
                button.title = "Song play frequency filtering disabled.";
                button.style.background = "transparent"; }
            app.db.deckupd(); },
        makeFilter: function () {
            ctrls.fq.settings = function () {
                return {tp:"fqb", v:fqb}; };
            ctrls.fq.match = function (song) {
                if(fqb === "off") {
                    return true; }
                if(!song.lp) {  //not played before
                    return true; }
                if(!song.fq || !waitdays[song.fq]) {
                    return false; }  //"R" (reference only), or invalid fq
                try {
                    var eligible = jt.isoString2Day(song.lp).getTime();
                    eligible += waitdays[song.fq] * (24 * 60 * 60 * 1000);
                    return (eligible < Date.now());
                } catch(e) {
                    jt.log("Frequency calc failure " + song.path + ": " + e);
                }}; },
        setFrequencyFiltering: function (fqsetting) {
            fqsetting = fqsetting || {tp:"fqb", v:"on"};
            mgrs.fq.toggleFreqFiltering(fqsetting.v); },
        init: function (divid) {
            mgrs.fq.initWaitDays();
            mgrs.fq.writeHTML(divid);
            mgrs.fq.makeFilter();
            mgrs.fq.setFrequencyFiltering(findSetting({tp:"fqb"})); }
    };  //end of mgrs.fq returned functions
    }());


    //Settings manager handles changes to account settings (current filter
    //settings and other custom values for the account).
    mgrs.stg = (function () {
        var settings = null;
        var rcids = ["el", "al"];  //energy level, approachability level
        var tmofilt = null;
        var tmosave = null;
    return {
        settings: function () { return settings; },
        filterValueChanged: function () {  //waits until controls stop moving
            if(!ctrls.filtersReady) { //ignore spurious startup events
                return; }
            if(tmofilt) {  //reset the filtering timer if currently waiting
                clearTimeout(tmofilt); }
            tmofilt = setTimeout(function () {
                tmofilt = null;
                app.db.deckupd();
                mgrs.stg.saveSettings(); }, 700); },
        saveSettings: function () {
            if(tmosave) {
                clearTimeout(tmosave); }
            tmosave = setTimeout(function () {
                tmosave = null;
                settings.ctrls = mgrs.stg.arrayOfAllFilters()
                    .map((filt) => filt.settings());
                app.hub.managerDispatch(
                    "loc", "updateAccount",
                    function () {
                        jt.log("stg.saveSettings completed"); },
                    function (code, errtxt) {
                        jt.log("stg.saveSettings " + code + ": " +
                               errtxt); }); }, 5 * 1000); },
        arrayOfAllFilters: function (mode) {
            var filts = [ctrls.el, ctrls.al];
            if(ctrls.bts) {
                ctrls.bts.forEach(function (bt) {
                    if(!mode) {
                        filts.push(bt); }
                    else if(mode === "active" && bt.tog !== "off") {
                        bt.actname = "+";
                        if(bt.tog === "neg") {
                            bt.actname = "-"; }
                        bt.actname += bt.pn;
                        filts.push(bt); } }); }
            filts.push(ctrls.rat);
            filts.push(ctrls.fq);
            return filts; },
        rebuildAllControls: function () {
            settings = app.hub.curracct().settings;
            rcids.forEach(function (cid) {
                if(!jt.byId(cid + "vnd")) {  //no knob displayed yet
                    createRangeControl(cid); }
                else {
                    initRangeSetting(cid); } });
            mgrs.btc.rebuildControls();
            mgrs.mruc.init("ratdiv");
            ctrls.filtersReady = true; }
    };  //end of mgrs.stg returned functions
    }());



return {

    init: function () { mainLayout(); },
    filterValueChanged: function () { mgrs.stg.filterValueChanged(); },
    settings: function () { return mgrs.stg.settings(); },
    filtersReady: function () { return ctrls.filtersReady; },
    filters: function (mode) { return mgrs.stg.arrayOfAllFilters(mode); },
    gradient: function () { return ranger.panel.gradient; },
    movelisten: function (d, s, p) { attachMovementListeners(d, s, p); },
    managerDispatch: function (mgrname, fname, ...args) {
        return mgrs[mgrname][fname].apply(app.filter, args); }


};  //end of returned functions
}());

