/*global app, jt */
/*jslint browser, white, for, long, unordered */

app.filter = (function () {
    "use strict";

    var ctrls = {activecolor:"#ffab00", movestats:[], trapdrag:true,
                 el:{fld:"el", pn:"Energy Level",
                     low:"Chill", high:"Amped"},
                 al:{fld:"al", pn:"Approachability", 
                     low:"Easy", high:"Hard"},
                 rat:{pn:"Minimum Rating"},
                 fq:{pn:"Frequency Eligible"}};
    var ranger = {dims:{x:0, y:0, w:120, h:120},
                  dflt:{x:55, y:76},  //default values if not previously set
                  gradient:{left:"0cd8e5", right:"faee0a"}};


    //General container for all managers, used for dispatch
    var mgrs = {};
    function mdfs (mgrfname, ...args) {  //module dispatch function string
        return app.dfs("filter", mgrfname, args);
    }


    function findSetting (avs) {
        var settings = mgrs.stg.settings() || {};
        settings.ctrls = settings.ctrls || [];
        return settings.ctrls.find((x) =>
            Object.entries(avs).every(function ([attr, val]) {
                return x[attr] === val; }));
    }


    function touchToOffset (event) {
        var rect = event.target.getBoundingClientRect();
        var coords = {
            offsetX:event.targetTouches[0].pageX - rect.left,
            offsetY:event.targetTouches[0].pageY - rect.top};
        return coords;
    }


    function updateCoords (stat, posf, event) {
        if(!ctrls.filtersReady) { return; }  //still setting up
        if(event) {
            stat.lastX = event.offsetX;
            stat.lastY = event.offsetY;
            stat.roundx = Math.round(((stat.roundpcnt || 0) / 100) *
                                     (stat.maxxlim || 0));
            stat.roundy = Math.round(((stat.roundpcnt || 0) / 100) *
                                     (stat.maxylim || 0));
            // jt.log("x:" + stat.lastX + ", y:" + stat.lastY + 
            //        ", roundx:" + stat.roundx + ", roundy:" + stat.roundy);
            if(stat.maxxlim) {
                if(stat.lastX + stat.roundx >= stat.maxxlim) {
                    stat.lastX = stat.maxxlim; }
                if(stat.lastX - stat.roundx <= 0) {
                    stat.lastX = 0; } }
            if(stat.maxylim) {
                if(stat.lastY + stat.roundy >= stat.maxylim) {
                    stat.lastY = stat.maxylim; }
                if(stat.lastY - stat.roundy <= 0) {
                    stat.lastY = 0; } } }
        if(Number.isFinite(stat.lastX) && Number.isFinite(stat.lastY)) {
            posf(stat.lastX, stat.lastY, stat.pointingActive); }
    }


    function attachMovementListeners (divid, stat, posf) {
        var div = jt.byId(divid);
        jt.on(div, "mousedown", function (event) {
            stat.pointingActive = true;
            updateCoords(stat, posf, event); });
        jt.on(div, "mouseup", function (ignore /*event*/) {
            stat.pointingActive = false;
            updateCoords(stat, posf); });
        jt.on(div, "mouseout", function (ignore /*event*/) {
            stat.pointingActive = false;
            updateCoords(stat, posf); });
        jt.on(div, "mousemove", function (event) {
            if(stat.pointingActive) {
                updateCoords(stat, posf, event); } });
        jt.on(div, "click", function (event) {  //down + up to avoid latching
            stat.pointingActive = true;
            updateCoords(stat, posf, event);
            stat.pointingActive = false;
            updateCoords(stat, posf, event); });
        //Touch interfaces are essentially the same as the mouse actions.
        //They may be intermixed on devices that support both interfaces.
        jt.on(div, "touchstart", function (event) {
            stat.pointingActive = true;
            updateCoords(stat, posf, touchToOffset(event)); });
        jt.on(div, "touchend", function (ignore /*event*/) {
            stat.pointingActive = false;
            updateCoords(stat, posf); });
        jt.on(div, "touchcancel", function (ignore /*event*/) {
            stat.pointingActive = false;
            updateCoords(stat, posf); });
        jt.on(div, "touchmove", function (event) {
            if(stat.pointingActive) {
                updateCoords(stat, posf, touchToOffset(event)); } });
    }


    //Range manager handles selection range window controls
    mgrs.rng = (function () {
        var rcids = ["el", "al"];  //energy level, approachability level
        function verifyValue (val, dflt, min, max) {
            val = val || dflt;
            if(!Number.isInteger(val)) {
                val = dflt; }
            val = Math.floor(val);  //verify integer value
            val = Math.min(val, max);
            val = Math.max(val, min);
            return val; }
    return {
        initRangeCtrlStatus: function (rcr) {
            var maw = Math.round(0.1 * ranger.dims.h);  //min active width
            var stat = {pointingActive:false, roundpcnt:7,
                        minx:ranger.dims.x, maxx:ranger.dims.w,
                        miny:ranger.dims.y + maw, maxy:ranger.dims.h};
            stat.thrx = Math.round((stat.roundpcnt / 100) * stat.maxx);
            stat.thry = Math.round((stat.roundpcnt / 100) * stat.maxy);
            rcr.stat = stat; },
        updateRangeValues: function (x, y, cid) {
            const stat = ctrls[cid].stat;
            y = stat.maxy - y;  //invert y so bottom is zero
            if(x <= stat.thrx) { x = stat.minx; }  //round x down
            if(x >= stat.maxx - stat.thrx) { x = stat.maxx; }  //or up
            if(y < stat.miny) { y = stat.miny; }  //round y down
            if(y >= stat.maxy - stat.thry) { y = stat.maxy; }  //or up
            //jt.out(cid + "tit", x + "," + y);
            stat.setx = x;  //value to save for settings (state restore)
            stat.sety = y;  //settings restore reinverts when calling here
            const wesx = Math.round(y / 2);  //width either side x
            const cw = {lc:Math.max((x - wesx), 0),  //left curtain width
                        rc:Math.max((stat.maxx - (x + wesx)), 0)};  //right
            if(y === stat.maxy) { cw.lc = 0; cw.rc = 0; }  //no curtains, at max
            jt.byId(cid + "lcdiv").style.width = cw.lc + "px";
            jt.byId(cid + "rcdiv").style.width = cw.rc + "px";
            //jt.out(cid + "tit", wesx + ", " + cw.lc + "|" + cw.rc);
            const lox = stat.minx + cw.lc;  //leftmost open x val
            const rox = stat.maxx - cw.rc;  //rightmost open x val
            stat.mnrv = Math.round((lox / stat.maxx) * 99);  //min rating value
            stat.mxrv = Math.round((rox / stat.maxx) * 99);  //max rating value
            //jt.out(cid + "tit", stat.mnrv + "<=rv=>" + stat.mxrv);
            mgrs.stg.filterValueChanged(); },
        attachRangeCtrlMovement: function (cid) {
            const rcr = ctrls[cid];
            ctrls.movestats.push(rcr.stat);  //catch containing div mouseup
            rcr.mpos = function (x, y, hardset) {
                var stat = rcr.stat;
                //jt.log("x:" + x + ", y:" + y + (hardset? " (hardset)" : ""));
                if(stat.pointingActive || hardset) {
                    mgrs.rng.updateRangeValues(x, y, cid); } };
            attachMovementListeners(cid + "mousediv", rcr.stat, rcr.mpos);
            rcr.mpos(ranger.dflt.h, ranger.dflt.v, "init"); },
        addRangeSettingsFunc: function (cid) {
            ctrls[cid].settings = function () {
                return {tp:"range", c:cid,
                        x:ctrls[cid].setx,
                        y:ctrls[cid].sety}; }; },
        addRangeSongMatchFunc: function (cid) {
            //Every song should have a numeric value set.
            ctrls[cid].match = function (song) {
                if(song[cid] >= ctrls[cid].stat.mnrv &&
                   song[cid] <= ctrls[cid].stat.mxrv) {
                    return true; }
                return false; }; },
        initRangeSetting: function (cid) {
            var settings = findSetting({tp:"range", c:cid}) || ranger.dflt;
            if(settings.x !== 0) { //have some kind of possibly invalid value
                settings.x = verifyValue(settings.x, ranger.dflt.x,
                                         ranger.dims.x, ranger.dims.w); }
            if(settings.y !== 0) {
                settings.y = verifyValue(settings.y, ranger.dflt.y,
                                         ranger.dims.y, ranger.dims.h); }
            //re-invert y value like it is coming from the mouse tracking
            ctrls[cid].mpos(settings.x, ranger.dims.h - settings.y, "init"); },
        createRangeControl: function (cid) {
            jt.out(cid + "div", jt.tac2html(
                [["img", {src:"img/ranger.png"}],
                 ["div", {cla:"rangetitlediv", id:cid + "tit"}, ctrls[cid].pn],
                 ["div", {cla:"rangelowlabeldiv"}, ctrls[cid].low],
                 ["div", {cla:"rangehighlabeldiv"}, ctrls[cid].high],
                 ["div", {cla:"rangeleftcurtdiv", id:cid + "lcdiv"}],
                 ["div", {cla:"rangerightcurtdiv", id:cid + "rcdiv"}],
                 ["div", {cla:"mouseareadiv", id:cid + "mousediv",
                          style:"left:" + ranger.dims.x + "px;" +
                                "top:" + ranger.dims.y + "px;" +
                                "width:" + ranger.dims.w + "px;" +
                                "height:" + ranger.dims.h + "px;"}]]));
            mgrs.rng.initRangeCtrlStatus(ctrls[cid]);
            mgrs.rng.attachRangeCtrlMovement(cid);
            mgrs.rng.addRangeSettingsFunc(cid);
            mgrs.rng.addRangeSongMatchFunc(cid);
            mgrs.rng.initRangeSetting(cid); },
        rebuildControls: function () {
            rcids.forEach(function (cid) {
                if(!jt.byId(cid + "vnd")) {  //no range control displayed yet
                    mgrs.rng.createRangeControl(cid); }
                else {
                    mgrs.rng.initRangeSetting(cid); } }); }
    };  //end mgrs.rng returned functions
    }());


    //Keyword filter toggle manager handles 3-way keyword filtering controls
    mgrs.kft = (function () {
        var kwdefs = null;
    return {
        setValue: function (idx, tog, changed) {
            ctrls.kts[idx].tog = tog;  //note the value for filtering
            jt.byId("kwtbimg" + idx).src = "img/kwtog" + tog + ".png";
            if(changed) {
                mgrs.stg.filterValueChanged();  //save updated kwtog value
                app.deck.update("keyword filter"); } },
        togClick: function (idx) {
            const kt = ctrls.kts[idx];
            switch(kt.tog) {
                case "off": kt.tog = "pos"; break;
                case "pos": kt.tog = "neg"; break;
                case "neg": kt.tog = "off"; break;
                default: jt.log("Bad state tog " + idx + ": " + kt.tog); }
            mgrs.kft.setValue(idx, kt.tog, "changed"); },
        openKeywordSelectDialog: function () {
            app.top.dispatch("kwd", "chooseKeywords"); },
        makeControl: function (kwdef, idx) {
            jt.out("kwtdiv" + idx, jt.tac2html(
                ["div", {cla:"kwtcontdiv",
                         onclick:mdfs("kft.togClick", idx),
                         ondblclick:mdfs("kft.openKeywordSelectDialog")},
                 [["div", {cla:"kwtoglabel"}, kwdef.pn],
                  ["div", {cla:"kwtbdiv"},
                   ["img", {cla:"kwtbimg", id:"kwtbimg" + idx,
                            src:"img/kwtogoff.png"}]]]])); },
        addKWTSettingsFunc: function (idx) {
            var kt = ctrls.kts[idx];
            kt.settings = function () {
                return {tp:"kwbt", k:kt.pn, v:kt.tog}; }; },
        addKWTSongMatchFunc: function (idx) {
            var kt = ctrls.kts[idx];
            kt.match = function (song) {
                if(kt.tog === "neg" &&
                   song.kws && (song.kws.indexOf(kt.pn) >= 0)) {
                    return false; }
                if(kt.tog === "pos" &&
                   (!song.kws || (song.kws.indexOf(kt.pn) < 0))) {
                    return false; }
                return true; }; },
        makeFiltersAndDivs: function () {
            var kwtdivs = [];
            kwdefs.slice(0, 4).map((kd) => kd.kw).forEach(function (kwd, idx) {
                ctrls.kts.push({pn:kwd, tog:"off"});
                mgrs.kft.addKWTSettingsFunc(idx);
                mgrs.kft.addKWTSongMatchFunc(idx);
                kwtdivs.push(["div", {cla:"kwtogdiv", id:"kwtdiv" + idx}]); });
            jt.out("kwtogsdiv", jt.tac2html(kwtdivs)); },
        createAndInitControls: function () {
            ctrls.kts.forEach(function (kt, idx) {
                mgrs.kft.makeControl(kt, idx);
                const dfltset = {v:"off"};
                const setting = findSetting({tp:"kwbt", k:kt.pn}) || dfltset;
                mgrs.kft.setValue(idx, setting.v || dfltset.v); }); },
        rebuildControls: function () {
            kwdefs = app.top.dispatch("kwd", "defsArray", true);
            ctrls.kts = [];
            mgrs.kft.makeFiltersAndDivs();
            mgrs.kft.createAndInitControls(); }
    };  //end mgrs.kft returned functions
    }());


    //Minimum rating and untagged filter
    mgrs.mruc = (function () {
        const tgds = {
            mrf:{vs:[
                {tx:"Everything", ti:"All Songs in your Collection", v:0},
                {tx:"Avoid Duds", ti:"1.5 stars or higher", v:3},
                {tx:"Standard", ti:"2.5 stars or higher", v:5},
                {tx:"Charting", ti:"3.5 stars or higher, no unrated", v:7},
                {tx:"Top Hits", ti:"4.5 stars or higher, no unrated", v:9}],
                 idx:2, bid:"pullscopeb"},
            tgf:{vs:[
                {tx:"Allow Untagged", ti:"Allow untagged songs on deck."},
                {tx:"Tagged Only", ti:"Only pull songs with keywords."},
                {tx:"Untagged Only", ti:"Only pull songs with no keywords."}],
                 idx:0, bid:"incluntb"}};
    return {
        writeHTML: function (divid) {
            var elems = Object.entries(tgds).map(function ([dn, dd]) {
                return ["button", {type:"button", id:dd.bid,
                                   style:"color:" + ctrls.activecolor,
                                   onclick:mdfs("mruc.toggle", dn)},
                        dd.vs[dd.idx].tx]; });
            elems.push(["div", {id:"fqftogdiv"}]);
            jt.out(divid, jt.tac2html(elems)); },
        minrat2idx: function (rv) {
            var idx = 0;
            while(idx < tgds.mrf.vs.length && rv > tgds.mrf.vs[idx].v) {
                idx += 1; }
            return idx; },
        setFromSettings: function () {
            const dfltset = {tp:"minrat", u:0, m:4};
            const sts = findSetting({tp:"minrat"}) || {};
            mgrs.mruc.toggle("mrf", mgrs.mruc.minrat2idx(sts.m || dfltset.m));
            mgrs.mruc.toggle("tgf", sts.u || dfltset.u); },
        toggle: function (dn, idx) {
            const tdef = tgds[dn];
            if(idx >= 0) {  //use specified idx
                tdef.idx = idx; }
            else {  //increment current idx
                tdef.idx = (tdef.idx + 1) % tdef.vs.length; }
            const button = jt.byId(tdef.bid);
            if(button) {
                button.innerHTML = tdef.vs[tdef.idx].tx;
                button.title = tdef.vs[tdef.idx].ti;
                mgrs.stg.filterValueChanged();  //save updated tag filter value
                app.deck.update("pull filter " + dn); } },
        makeFilter: function () {
            ctrls.rat.settings = function () {
                return {tp:"minrat", u:tgds.tgf.idx,
                        m:tgds.mrf.vs[tgds.mrf.idx].v}; };
            ctrls.rat.match = function (song) {
                if(tgds.mrf.idx > 0 &&  //filtering based on minimum rating
                   song.rv < tgds.mrf.vs[tgds.mrf.idx].v) {  //song below min
                    return false; }
                if(!song.kws && tgds.tgf.idx === 1) {
                    return false; }  //song is untagged, playing tagged only
                if(song.kws && tgds.tgf.idx === 2) {
                    return false; }  //song is tagged, playing untagged only
                return true; }; },
        minrat: function () { return tgds.mrf.vs[tgds.mrf.idx].v; },
        tagf: function () { return tgds.tgf.idx; },
        init: function (divid) {
            mgrs.mruc.writeHTML(divid);
            mgrs.mruc.setFromSettings();
            mgrs.mruc.makeFilter();
            mgrs.fq.init("fqftogdiv"); }
    };  //end of mgrs.mruc returned functions
    }());


    //Frequency filter (removes songs that were played recently)
    mgrs.fq = (function () {
        var fqb = "on";  //"off" to deactivate frequency filtering
        var waitdays = null;
    return {
        initWaitDays: function () {
            var settings = mgrs.stg.settings() || {};
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
            const button = jt.byId("fqtogb");
            if(fqb === "on") {
                button.title = "Song play frequency filtering active.";
                button.style.background = ctrls.activecolor; }
            else {
                button.title = "Song play frequency filtering disabled.";
                button.style.background = "transparent"; }
            mgrs.stg.filterValueChanged();  //save updated freq filter value
            app.deck.update("freq filter"); },
        makeFilter: function () {
            ctrls.fq.settings = function () {
                return {tp:"fqb", v:fqb}; };
            ctrls.fq.match = function (song) {
                var eligible;
                if(fqb === "off") {
                    return true; }
                if(!song.lp) {  //not played before
                    return true; }
                if(!song.fq || !waitdays[song.fq]) {
                    return false; }  //"R" (reference only), or invalid fq
                try {
                    eligible = jt.isoString2Day(song.lp).getTime();
                    eligible += waitdays[song.fq] * (24 * 60 * 60 * 1000);
                    return (eligible < Date.now());
                } catch(e) {
                    jt.log("Frequency calc failure " + song.path + ": " + e);
                }}; },
        setFrequencyFiltering: function (fqsetting) {
            fqsetting = fqsetting || {tp:"fqb", v:"on"};
            mgrs.fq.toggleFreqFiltering(fqsetting.v); },
        getFrequencyFiltering: function () {
            return fqb; },
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
        var tmofilt = null;
        var tmosave = null;
    return {
        settings: function () { return settings; },
        filterValueChanged: function () {  //waits until controls stop moving
            if(!ctrls.filtersReady) { //ignore spurious startup events
                return; }
            app.deck.update("filterValueChanged");  //flag deck update needed
            if(tmofilt) {  //reset the filtering timer if currently waiting
                clearTimeout(tmofilt); }
            tmofilt = setTimeout(function () {
                tmofilt = null;
                mgrs.stg.saveSettings(); }, 700); },
        saveSettings: function () {
            if(tmosave) {
                clearTimeout(tmosave); }
            tmosave = setTimeout(function () {
                tmosave = null;
                settings.ctrls = mgrs.stg.arrayOfAllFilters()
                    .map((filt) => filt.settings());
                const acct = app.top.dispatch("aaa", "getAccount");
                acct.settings = settings;
                app.top.dispatch("aaa", "updateAccount", acct, acct.token,
                    function () {
                        jt.log("stg.saveSettings completed"); },
                    function (code, errtxt) {
                        jt.log("stg.saveSettings " + code + ": " +
                               errtxt); }); }, 5 * 1000); },
        arrayOfAllFilters: function (mode) {
            var filts = [ctrls.el, ctrls.al];
            if(ctrls.kts) {
                ctrls.kts.forEach(function (kt) {
                    if(!mode) {
                        filts.push(kt); }
                    else if(mode === "active" && kt.tog !== "off") {
                        kt.actname = "+";
                        if(kt.tog === "neg") {
                            kt.actname = "-"; }
                        kt.actname += kt.pn;
                        filts.push(kt); } }); }
            filts.push(ctrls.rat);
            filts.push(ctrls.fq);
            return filts; },
        rebuildAllControls: function (ready) {
            var ca = app.top.dispatch("aaa", "getAccount");
            if(ca && ca.settings) { settings = ca.settings; }
            ctrls.filtersReady = false;  //turn off to avoid spurious events
            mgrs.rng.rebuildControls();
            mgrs.kft.rebuildControls();
            mgrs.mruc.init("ratdiv");
            ctrls.filtersReady = ready;
            app.deck.update("filters rebuilt"); }
    };  //end of mgrs.stg returned functions
    }());


    //Description manager returns filter summary information
    mgrs.dsc = (function () {
        function buttonsCSV (togval) {
            return ctrls.kts.filter((b) => b.tog === togval)
                .map((b) => b.pn).join(","); }
        function formatCSV (csv, sep, prefix) {
            prefix = prefix || "";
            return prefix + csv.csvarray().join(sep + prefix); }
    return {
        summarizeFiltering: function () {
            return {elmin:ctrls.el.rgfoc.min, elmax:ctrls.el.rgfoc.max,
                    almin:ctrls.al.rgfoc.min, almax:ctrls.al.rgfoc.max,
                    poskws:buttonsCSV("pos"), negkws:buttonsCSV("neg"),
                    minrat:mgrs.mruc.minrat(),
                    tagfidx:mgrs.mruc.tagf(),
                    fq:mgrs.fq.getFrequencyFiltering(),  //on|off
                    fpst:mgrs.dsc.filteringPanelState(),  //on|off
                    ddst:mgrs.dsc.deckDisplayState(),  //normal|newest
                    srchtxt:jt.byId("srchin").value || ""}; },
        name: function () {
            var name = "Digger";  //caps sort before lowercase.
            var sep = "_";
            var summary = mgrs.dsc.summarizeFiltering();
            if(summary.fq === "on") {
                if(ctrls.el.actname) {  //particularly Chill or Amped
                    name += sep + ctrls.el.actname; }
                if(ctrls.al.actname) {  //particularly Easy or Hard
                    name += sep + ctrls.al.actname; }
                if(summary.poskws) {
                    name += sep + formatCSV(summary.poskws, sep); }
                if(summary.negkws) {
                    name += sep + formatCSV(summary.negkws, sep, "X"); } }
            if(summary.srchtxt) {
                name += sep + summary.srchtxt.replace(/\s/g, sep); }
            return name; },
        desc: function () {
            var sum = mgrs.dsc.summarizeFiltering();
            var desc = "Songs on deck in Digger";
            if(sum.fq === "on") {
                desc += ", energy level " + sum.elmin + " to " + sum.elmax +
                    ", approachability " + sum.almin + " to " + sum.almax;
                if(sum.poskws) {
                    desc += ", " + formatCSV(sum.poskws, ", "); }
                if(sum.negkws) { 
                    desc += ", " + formatCSV(sum.negkws, ", ", "not "); } }
            if(sum.srchtxt) {
                desc += ", " + sum.srchtxt; }
            return desc; },
        filteringPanelState: function () {
            var togfiltb = jt.byId("togfiltb");
            if(togfiltb && togfiltb.dataset.togstate === "off") {
                return "off"; }
            return "on"; },
        deckDisplayState: function () {
            const view = app.deck.dispatch("vws", "getView");
            const di = app.deck.dispatch("gen", "deckinfo");
            if(di.disp === "views" && view === "newest") {
                return "newest"; }
            return "normal"; }
    };  //end of mgrs.dsc returned functions
    }());


    //General panel level setup and dispatch
    mgrs.gen = (function () {
        const spte = "rotate(0deg)";
        const sptc = "rotate(90deg) translate(25%, 25%)";
    return {
        containingDivEventHooks: function () {
            //trap and ignore clicks in the controls container div to avoid
            //selecting controls when you want to be changing a control value.
            jt.on("panfiltdiv", "mousedown", function (event) {
                if(ctrls.trapdrag) {
                    jt.evtend(event); }});
            //stop tracking if the mouse is released outside of the control
            //area, so that tracking doesn't get stuck "on" leaving the drag
            //still in progress.
            jt.on("panfiltdiv", "mouseup", function (event) {
                ctrls.movestats.forEach(function (movestat) {
                    movestat.pointingActive = false; });
                jt.evtend(event); }); },
        togglePanelView: function () {
            const fpeca = jt.byId("fpeca");
            const bspan = jt.byId("fpecspan");
            if(fpeca.href.endsWith("#collapse")) {
                fpeca.href = "#expand";
                bspan.style.transform = spte;
                jt.byId("filtpanelcontdiv").style.display = "none"; }
            else {
                fpeca.href = "#collapse";
                bspan.style.transform = sptc;
                jt.byId("filtpanelcontdiv").style.display = "block"; } },
        initializeInterface: function () {
            jt.out("panfiltdiv", jt.tac2html(
                ["div", {id:"panfiltcontentdiv"},
                 [["div", {cla:"paneltitlediv"},
                   ["a", {id:"fpeca", href:"#init",
                          onclick:mdfs("gen.togglePanelView")},
                    [["span", {id:"fpecspan"}, ">"],
                     "FILTERS"]]],
                  ["div", {id:"filtpanelcontdiv"},
                   [["div", {id:"rangesdiv"},
                     [["div", {cla:"rangectrldiv", id:"eldiv"}],
                      ["div", {cla:"rangectrldiv", id:"aldiv"}]]],
                    ["div", {id:"kwtogsdiv"}],
                    ["div", {id:"ratdiv"}]]]]]));
            mgrs.gen.togglePanelView();
            mgrs.gen.containingDivEventHooks();
            mgrs.stg.rebuildAllControls(); }
    };  //end of mgrs.gen returned functions
    }());


return {
    init: function () { mgrs.gen.initializeInterface(); },
    initialDataLoaded: function () { mgrs.stg.rebuildAllControls(true); },
    filtersReady: function () { return ctrls.filtersReady; },
    filters: function (mode) { return mgrs.stg.arrayOfAllFilters(mode); },
    summary: function () { return mgrs.dsc.summarizeFiltering(); },
    filteringPanelState: function () { return mgrs.dsc.filteringPanelState(); },
    gradient: function () { return ranger.gradient; },
    movelisten: function (d, s, p) { attachMovementListeners(d, s, p); },
    dispatch: function (mgrname, fname, ...args) {
        return mgrs[mgrname][fname].apply(app.filter, args); }


};  //end of returned functions
}());
