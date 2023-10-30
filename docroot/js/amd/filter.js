/*global app, jt */
/*jslint browser, white, for, long, unordered */

app.filter = (function () {
    "use strict";

    var ctrls = {activecolor:"#ffab00", movestats:[], trapdrag:true,
                 al:{fld:"al", pn:"Approachability", 
                     low:"Easy", high:"Hard"},
                 el:{fld:"el", pn:"Energy Level",
                     low:"Chill", high:"Amped"},
                 rat:{pn:"Minimum Rating"},
                 fq:{pn:"Frequency Eligible"}};
    var ranger = {dims:{x:0, y:0, w:160, h:120},
                  dflt:{x:50, y:65},  //pcnt values as used in account settings
                  gradient:{left:"0cd8e5", right:"faee0a"},
                  svg:{vb:{w:200, h:100},
                       asw:5,  //axis stroke width
                       hwh:6,  //half winglet height (above or below x)
                       wsw:3,  //winglet stroke width
                       tcr:14,  //thumb circle radius
                       tsw:3,   //thumb stroke width
                       dfy:75}}; //default y value


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
        stat.eventType = "";
        if(event) {
            stat.lastX = event.offsetX;
            stat.lastY = event.offsetY;
            stat.eventType = String(event.type);
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
        jt.on(div, "dblclick", function (/*event*/) {
            const dfltcoords = stat.dflt || {x:0, y:0};
            const dfltevt = {type:"dblclick",
                             offsetX:dfltcoords.x, offsetY:dfltcoords.y};
            stat.pointingActive = true;
            updateCoords(stat, posf, dfltevt);
            stat.pointingActive = false;
            updateCoords(stat, posf, dfltevt); });
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
        var rcids = ["al", "el"];  //approachability level, energy level
        function verifyValue (val, dflt, min, max) {
            val = val || dflt;
            if(!Number.isInteger(val)) {
                val = dflt; }
            val = Math.floor(val);  //verify integer value
            val = Math.min(val, max);
            val = Math.max(val, min);
            return val; }
        function initRangeCtrlStatus (rcr) {
            var stat = {pointingActive:false,
                        minfocpcnt:20};
            rcr.stat = stat; }
        function updateStatValues (xp, yp, cid) {
            const stat = ctrls[cid].stat;
            stat.setx = xp;  //value to save for settings (state restore)
            stat.sety = yp;  //restore processing unpacks values into screen
            const ay = ranger.yp2myp(yp);
            stat.mnpx = Math.max(0, Math.round(xp - (ay / 2)));
            stat.mxpx = Math.min(100, Math.round(xp + (ay / 2)));
            stat.mnrv = Math.round((stat.mnpx / 100) * 99);
            stat.mxrv = Math.round((stat.mxpx / 100) * 99); }
        function setCurtainWidths (xp, yp, cid) {
            const drec = ranger.drec;
            const cx = (xp / 100) * drec.w;   //center x
            const ay = ranger.yp2myp(yp);
            const wesx = ((ay / 100) * drec.w) / 2;  //act width either side x
            const cw = {  //curtain widths
                lc:Math.max(0, cx - wesx),
                rc:Math.max(0, drec.w - (cx + wesx))};
            jt.byId(cid + "lcdiv").style.width = cw.lc + "px";
            jt.byId(cid + "rcdiv").style.width = cw.rc + "px"; }
        function setCtrlSurfaceValues (xp, yp, cid) {
            const stat = ctrls[cid].stat;
            const sd = ranger.svg;
            yp = 100 - yp;  //uninvert to get svg coordinates from % value.
            const yval = sd.ypr2yvr(yp);
            const xval = sd.xpr2xvr(xp);
            const xaxis = jt.byId(cid + "horz");
            xaxis.setAttribute("y1", yval);
            xaxis.setAttribute("y2", yval);
            const thumb = jt.byId(cid + "thm");
            thumb.setAttribute("cx", xval);
            thumb.setAttribute("cy", yval);
            const leftWinglet = jt.byId(cid + "lw");
            const lwx = sd.xpr2xvr(stat.mnpx);
            leftWinglet.setAttribute("x1", lwx);
            leftWinglet.setAttribute("x2", lwx);
            leftWinglet.setAttribute("y1", yval - sd.hwh);
            leftWinglet.setAttribute("y2", yval + sd.hwh);
            const rightWinglet = jt.byId(cid + "rw");
            const rwx = sd.xpr2xvr(stat.mxpx);
            rightWinglet.setAttribute("x1", rwx);
            rightWinglet.setAttribute("x2", rwx);
            rightWinglet.setAttribute("y1", yval - sd.hwh);
            rightWinglet.setAttribute("y2", yval + sd.hwh); }
        function updateRangeValues (x, y, cid) {
            const r = ranger;
            //convert trec coordinates to working range visual coordinates
            const vpad = Math.round((r.svg.yvr.s / r.svg.vb.h) * r.irec.h);
            x -= r.irec.x;
            x = Math.max(0, x);
            x = Math.min(x, r.irec.w);
            y -= ((r.irec.y - r.trec.y) + vpad);
            y = Math.max(0, y);
            y = Math.min(y, r.irec.h - (2 * vpad));
            //convert to percentage values
            x = Math.round((x / r.irec.w) * 100);
            y = Math.round((y / (r.irec.h - (2 * vpad))) * 100);
            y = 100 - y;  //invert y so bottom of rect is zero
            //jt.out(cid + "tit", x + "," + y);  //debug output
            updateStatValues(x, y, cid);
            setCurtainWidths(x, y, cid);
            setCtrlSurfaceValues(x, y, cid);
            mgrs.stg.filterValueChanged();
            app.deck.filtersChanged("range"); }
        function pcnts2Coords (pc) {
            const tc = {x:pc.x, y:pc.y};
            tc.y = 100 - tc.y;   //re-invert so top of rect is zero
            const r = ranger;
            tc.x = ((tc.x / 100) * r.irec.w) + r.irec.x;
            tc.y = ((tc.y / 100) * r.irec.h) + (r.irec.y - r.trec.y);
            return tc; }
        function attachRangeCtrlMovement (cid) {
            const rcr = ctrls[cid];
            ctrls.movestats.push(rcr.stat);  //catch containing div mouseups
            rcr.mpos = function (x, y, hs) {  //optional hard-set flag
                var stat = rcr.stat;
                //jt.log("x:" + x + ", y:" + y + (hs? " (" + hs + ")" : ""));
                if(stat.pointingActive || hs) {
                    updateRangeValues(x, y, cid); } };
            attachMovementListeners(cid + "mousediv", rcr.stat, rcr.mpos);
            const coords = pcnts2Coords({x:ranger.dflt.x, y:ranger.dflt.y});
            rcr.mpos(coords.x, coords.y, "attachRangeCtrlMovement"); }
        function addRangeSettingsFunc (cid) {
            ctrls[cid].settings = function () {
                return {tp:"range", c:cid,
                        x:ctrls[cid].stat.setx,
                        y:ctrls[cid].stat.sety}; }; }
        function addRangeSongMatchFunc (cid) {
            //Every song should have a numeric value set.
            ctrls[cid].match = function (song) {
                if(song[cid] >= ctrls[cid].stat.mnrv &&
                   song[cid] <= ctrls[cid].stat.mxrv) {
                    return true; }
                return false; }; }
        function initRangeSetting (cid) {
            const settings = findSetting({tp:"range", c:cid}) || ranger.dflt;
            const coords = pcnts2Coords({
                x:verifyValue(settings.x, ranger.dflt.x, 0, 100),
                y:verifyValue(settings.y, ranger.dflt.y, 0, 100)});
            ctrls[cid].mpos(coords.x, coords.y, "initRangeSetting"); }
        function verifyRangerDefValues(cid) {  //display, tracking, interaction
            const r = ranger;
            r.drec = {x:0, y:0, w:r.dims.w, h:Math.round(r.dims.h * 2 / 5)};
            r.trec = {x:0, y:Math.round(r.drec.h / 2), w:r.dims.w};
            r.trec.h = r.dims.h - r.trec.y;
            ctrls[cid].stat.dflt = {x:Math.round(r.trec.w / 2),
                                    y:Math.round(r.trec.h / 2)};
            const sidecolw = Math.round(0.1 * r.trec.w);
            r.irec = {x:sidecolw, y:r.drec.h + 4, w:r.drec.w - (2 * sidecolw)};
            r.irec.h = r.trec.h - (r.irec.y - r.trec.y) - 6;
            const minyp = ctrls[cid].stat.minfocpcnt;
            r.yp2myp = function (y) {
                const ratio = (100 - minyp) / (100 - 0);
                return (y - 0) * ratio + minyp; };
            const sd = r.svg;
            sd.midx = sd.vb.w / 2;
            const htw = sd.tcr + sd.tsw;  //half thumb width
            sd.yvr = {  //control surface y value axis start/end range
                s:htw, e:sd.vb.h - htw};
            sd.ypr = {s:0, e:100}; //percent y value axis start/end range
            sd.ypr2yvr = function (y) {  //vertical range linear interpolation
                const ratio = (sd.yvr.e - sd.yvr.s) / (sd.ypr.e - sd.ypr.s);
                return (y - sd.ypr.s) * ratio + sd.yvr.s; };
            sd.xvr = {  //control surface x value axis start/end range
                s:htw, e:sd.vb.w - htw};
            sd.xpr = {s:0, e:100};  //percent x value axis start/end range
            sd.xpr2xvr = function (x) {  //horizontal range linear interpolation
                const ratio = (sd.xvr.e - sd.xvr.s) / (sd.xpr.e - sd.xpr.s);
                return (x - sd.xpr.s) * ratio + sd.xvr.s; };
            return r; }
        function boxPosStyle (rec) {
            const style = ("width:" + rec.w + "px;" +
                           "height:" + rec.h + "px;" +
                           "left:" + rec.x + "px;" +
                           "top:" + rec.y + "px;");
            return style; }
        function createControlElements (cid) {
            const r = verifyRangerDefValues(cid);
            const svg = r.svg;
            jt.byId(cid + "div").style.height = r.dims.h + "px";
            jt.out(cid + "div", jt.tac2html(
                [["div", {cla:"rangetopdispdiv", style:boxPosStyle(r.drec)},
                  [["div", {cla:"rangebgraddiv",
                            style:boxPosStyle(r.drec) +
                                  "background:linear-gradient(.25turn, #" +
                                  r.gradient.left + ", #" + r.gradient.right}],
                   ["div", {cla:"rangetitlediv", id:cid + "tit"},
                    ctrls[cid].pn],
                   ["div", {cla:"rangelowlabeldiv"}, ctrls[cid].low],
                   ["div", {cla:"rangehighlabeldiv"}, ctrls[cid].high],
                   ["div", {cla:"rangeleftcurtdiv", id:cid + "lcdiv",
                            style:"height:" + r.drec.h + "px"}],
                   ["div", {cla:"rangerightcurtdiv", id:cid + "rcdiv",
                            style:"height:" + r.drec.h + "px"}]]],
                 ["div", {cla:"rangesurfdiv", style:boxPosStyle(r.irec)},
                  ["svg", {xmlns:"http://www.w3.org/2000/svg",
                           viewBox:"0 0 " + svg.vb.w + " " + svg.vb.h,
                           stroke:"black", fill:"#555555"},
                   [["line", {id:cid + "vert", "stroke-width":svg.asw,
                              x1:svg.midx, y1:svg.yvr.s,
                              x2:svg.midx, y2:svg.yvr.e}],
                    ["line", {id:cid + "horz", "stroke-width":svg.asw,
                              x1:svg.xvr.s, y1:svg.dfy,
                              x2:svg.xvr.e, y2:svg.dfy}],
                    ["line", {id:cid + "lw", "stroke-width":svg.wsw,
                              x1:75, y1:svg.dfy - svg.hwh,
                              x2:75, y2:svg.dfy + svg.hwh}],
                    ["line", {id:cid + "rw", "stroke-width":svg.wsw,
                              x1:125, y1:svg.dfy - svg.hwh,
                              x2:125, y2:svg.dfy + svg.hwh}],
                    ["circle", {id:cid + "thm", "stroke-width":svg.tsw,
                                cx:svg.midx, cy:svg.dfy, r:svg.tcr}]]]],
                 ["div", {cla:"mouseareadiv", id:cid + "mousediv",
                          style:boxPosStyle(r.trec)}]])); }
        function createRangeControl (cid) {
            initRangeCtrlStatus(ctrls[cid]);
            createControlElements(cid);
            attachRangeCtrlMovement(cid);
            addRangeSettingsFunc(cid);
            addRangeSongMatchFunc(cid);
            initRangeSetting(cid); }
    return {
        rebuildControls: function () {
            rcids.forEach(function (cid) {
                if(!jt.byId(cid + "vnd")) {  //no range control displayed yet
                    createRangeControl(cid); }
                else {
                    initRangeSetting(cid); } }); }
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
                app.deck.filtersChanged("keyword filter"); } },
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
        function writeHTML (divid) {
            var elems = Object.entries(tgds).map(function ([dn, dd]) {
                return ["button", {type:"button", id:dd.bid,
                                   style:"color:" + ctrls.activecolor,
                                   onclick:mdfs("mruc.toggle", dn)},
                        dd.vs[dd.idx].tx]; });
            elems.unshift(["div", {id:"toginfob"}]);  //used by deck.ddc
            elems.unshift(["div", {id:"toghistb"}]);  //used by deck.ddc
            elems.push(["div", {id:"fqftogdiv"}]);
            jt.out(divid, jt.tac2html(elems));
            app.deck.dispatch("ddc", "makeHistoryToggle");
            app.deck.dispatch("ddc", "makeInfoToggle"); }
    return {
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
                app.deck.filtersChanged("pull filter " + dn); } },
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
            writeHTML(divid);
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
            app.deck.filtersChanged("freq filter"); },
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
        function verifySettingsInitialized () {
            if(!settings) {
                const ca = app.top.dispatch("aaa", "getAccount");
                if(ca && ca.settings) {
                    settings = ca.settings; }
                else {
                    jt.log("filter.stg settings initialized empty");
                    settings = {}; } }
        }
    return {
        settings: function () { return settings; },
        filterValueChanged: function () {  //waits until controls stop moving
            if(!ctrls.filtersReady) { //ignore spurious startup events
                return; }
            //app.deck.filtersChanged(); filters handle notifications
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
                verifySettingsInitialized();
                settings.ctrls = mgrs.stg.arrayOfAllFilters()
                    .map((filt) => filt.settings());
                const acct = app.top.dispatch("aaa", "getAccount");
                acct.settings = settings;
                app.top.dispatch("aaa", "updateCurrAcct", acct, acct.token,
                    function () {
                        jt.log("stg.saveSettings completed"); },
                    function (code, errtxt) {
                        jt.log("stg.saveSettings " + code + ": " +
                               errtxt); }); }, 5 * 1000); },
        arrayOfAllFilters: function (mode) {
            var filts = [ctrls.al, ctrls.el];
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
            settings = null;  //reset to force account info check
            verifySettingsInitialized();
            ctrls.filtersReady = false;  //turn off to avoid spurious events
            mgrs.rng.rebuildControls();
            mgrs.kft.rebuildControls();
            mgrs.mruc.init("ratdiv");
            ctrls.filtersReady = ready;
            app.deck.filtersChanged("filters rebuilt"); }
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
            return {almin:ctrls.al.rgfoc.min, almax:ctrls.al.rgfoc.max,
                    elmin:ctrls.el.rgfoc.min, elmax:ctrls.el.rgfoc.max,
                    poskws:buttonsCSV("pos"), negkws:buttonsCSV("neg"),
                    minrat:mgrs.mruc.minrat(),
                    tagfidx:mgrs.mruc.tagf(),
                    fq:mgrs.fq.getFrequencyFiltering()}; },
        name: function () {
            var name = "Digger";  //caps sort before lowercase.
            var sep = "_";
            var summary = mgrs.dsc.summarizeFiltering();
            if(summary.fq === "on") {
                if(ctrls.al.actname) {  //particularly Easy or Hard
                    name += sep + ctrls.al.actname; }
                if(ctrls.el.actname) {  //particularly Chill or Amped
                    name += sep + ctrls.el.actname; }
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
                desc += ", approachability " + sum.almin + " to " + sum.almax +
                    ", energy level " + sum.elmin + " to " + sum.elmax;
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
            return "on"; }
    };  //end of mgrs.dsc returned functions
    }());


    //Digger console message manager handles app log messages.
    mgrs.dcm = (function () {
        const bufmax = 200;
        const buf = [];
        function timestamp () {
            var date = new Date();
            const h = date.getHours();
            const m = date.getMinutes();
            const s = date.getSeconds();
            var ts = "";
            if(h <= 9) { ts += "0"; }
            ts += h;
            ts += ":";
            if(m <= 9) { ts += "0"; }
            ts += m;
            ts += ":";
            if(s <= 9) { ts += "0"; }
            ts += s;
            return ts; }
        function internalConsistencyMatch (md, rows) {
            return rows[md.ar][md.av] === rows[md.br][md.bv]; }
        function rowEquivalenceMatch (md, rs1, rs2) {
            return rs1[md.r][md.v] === rs2[md.r][md.v]; }
        function combineBufferRows (sidx, didx, numrows) {
            var i;
            for(i = 0; i < numrows; i += 1) {
                buf[didx + i].c = buf[sidx + i].c + 1;
                buf[sidx + i] = buf[didx + i]; }
            buf.splice((-1 * numrows), numrows); }
        function droidLogPollingDef () {
            const def = {
                mrxs:[/requestStatusUpdate dst.det.length: (\d+)/,
                      /svc.mp.queueCommand (\d+): (\S+)/,
                      /svc.mp.notePlaybackStatus stat: \{"state":"([a-z]+)","pos":\d+,"dur":\d+,"path":"([^"]+)/,
                      /svc.mp.notePlaybackStatus finished (\d+): (\S+)/],
                icms:[{ar:1, av:1, br:3, bv:1},   //same queue count val
                      {ar:1, av:2, br:3, bv:2}],  //same queue command val
                rmts:[{r:0, v:1},   //length remaining on deck
                      {r:1, v:2},   //e.g. "status" command
                      {r:2, v:1},   //playback state is the same
                      {r:2, v:2},   //playback path is the same
                      {r:3, v:2}],  //e.g. "status" command
                samp:[
{t:"13:47:53", c:1, m:"requestStatusUpdate dst.det.length: 200"},
{t:"13:47:53", c:1, m:"svc.mp.queueCommand 41: status"},
{t:"13:47:53", c:1, m:"svc.mp.notePlaybackStatus stat: {\"state\":\"playing\",\"pos\":40690,\"dur\":261642,\"path\":\"file%3A%2F%2F%2Fstorage%2Femulated%2F0%2FMusic%2F808%2520State%2Fex_el%2F13%2520Olympic.mp3\",\"cc\":41,\"dbts\":\"2023-09-29T17:45:15.567Z\"}"},
{t:"13:47:53", c:1, m:"svc.mp.notePlaybackStatus finished 41: status"},
{t:"13:47:57", c:1, m:"requestStatusUpdate dst.det.length: 200"},
{t:"13:47:57", c:1, m:"svc.mp.queueCommand 42: status"},
{t:"13:47:57", c:1, m:"svc.mp.notePlaybackStatus stat: {\"state\":\"playing\",\"pos\":44716,\"dur\":261642,\"path\":\"file%3A%2F%2F%2Fstorage%2Femulated%2F0%2FMusic%2F808%2520State%2Fex_el%2F13%2520Olympic.mp3\",\"cc\":42,\"dbts\":\"2023-09-29T17:45:15.567Z\"}"},
{t:"13:47:57", c:1, m:"svc.mp.notePlaybackStatus finished 42: status"}]};
            return def; }
        function iosLogPollingDef () {
            const def = {
                mrxs:[/callIOS: main:(\d+):([^:]+):/,
                      /ios.retv: main:(\d+):([^:]+):\{"state":"([a-z]+)","pos":\d+,"dur":\d+,"path":"([^"]+)/],
                icms:[{ar:0, av:1, br:1, bv:1},   //same queue count val
                      {ar:0, av:2, br:1, bv:2}],  //same queue command val
                rmts:[{r:0, v:2},   //same command, e.g. statusSync
                      {r:1, v:2},   //same command
                      {r:1, v:3},   //same playback state
                      {r:1, v:4}],  //same path
                samp:[
{t:"11:42:17", c:1, m:"callIOS: main:767:statusSync:[\"ipod-library://item/item.mp3?id=969038086138737235\",\"ipod-library://item/item.mp3?id=969038086138737483\",\"ipod-library://item/it...od-library://item/item.mp3?id=969038086138737342\"]"},
{t:"11:42:17", c:1, m:"ios.retv: main:767:statusSync:{\"state\":\"playing\",\"pos\":22968,\"dur\":255843,\"path\":\"ipod-library://item/item.mp3?id=969038086138737235\"}"},
{t:"11:42:21", c:1, m:"callIOS: main:768:statusSync:[\"ipod-library://item/item.mp3?id=969038086138737235\",\"ipod-library://item/item.mp3?id=969038086138737483\",\"ipod-library://item/it...od-library://item/item.mp3?id=969038086138737342\"]"},
{t:"11:42:21", c:1, m:"ios.retv: main:768:statusSync:{\"state\":\"playing\",\"pos\":26985,\"dur\":255843,\"path\":\"ipod-library://item/item.mp3?id=969038086138737235\"}"}]};
            return def; }
        function collapsePolling () {
            const cds = [droidLogPollingDef(), iosLogPollingDef()];
            cds.forEach(function (cd) {
                const sidx = buf.length - (2 * cd.mrxs.length);
                if(sidx < 0) { return; }
                const rs1 = buf.slice(sidx, sidx + cd.mrxs.length)
                      .map((r, i) => r.m.match(cd.mrxs[i]));
                if(!rs1.every((m) => m)) { return; }
                const didx = buf.length - cd.mrxs.length;
                const rs2 = buf.slice(didx, didx + cd.mrxs.length)
                      .map((r, i) => r.m.match(cd.mrxs[i]));
                if(!rs2.every((m) => m)) { return; }
                if(cd.icms.every((m) => internalConsistencyMatch(m, rs1)) &&
                   cd.icms.every((m) => internalConsistencyMatch(m, rs2)) &&
                   cd.rmts.every((m) => rowEquivalenceMatch(m, rs1, rs2))) {
                    combineBufferRows(sidx, didx, cd.mrxs.length); } }); }
        function logMessage (text) {
            buf.push({t:timestamp(), c:1, m:text});
            collapsePolling();
            if(buf.length > bufmax) {
                buf.shift(); } }
        function testLogCollapse () {
            var tds = [droidLogPollingDef(), iosLogPollingDef()];
            tds.forEach(function (td, idx) {
                buf.splice(0, buf.length);  //clear buf
                td.samp.forEach(function (tm) { buf.push(tm); });
                collapsePolling();
                jt.log("testLogCollapse " + idx + ": collapsed? " +
                       String(buf.length === td.mrxs.length)); });
            buf.splice(0, buf.length); }  //leave cleared
    return {
        init: function () {
            testLogCollapse();
            jt.log = logMessage;  //catch all app console output
            window.onerror = function(msg, url, line, col, ignore /*error*/) {
                logMessage(msg + " " + url + ":" + line + ":" + col + " " +
                           new Error("stack trace").stack);
                const cancelDefaultSystemErrorHandling = true;
                return cancelDefaultSystemErrorHandling; };
            logMessage("dcm initialized"); },
        emFormat: function () {
            var txt = "Describe what was happening with Digger at the time:" +
                "\n\n\n\n----------------------------------------\n\nDigger " +
                app.top.dispatch("gen", "songDataVersion") +
                " excerpt of console log:\n\n" +
                buf.map((ln) =>
                    ln.t + " " + (ln.c? " (" + ln.c + ") " : "") + ln.m)
                .join("\n\n");
            return txt; },
        copyToClipboard: function () {
            app.svc.dispatch("gen", "copyToClipboard", buf.map((ln) =>
                    ln.t + " " + (ln.c? " (" + ln.c + ") " : "") + ln.m)
                    .join("\n"),
                function () {
                    jt.out("c2cbutton", "Contents Copied");
                    setTimeout(function () {
                        jt.out("c2cbutton", "Copy Log To Clipboard"); },
                               5000); },
                function () {
                    jt.log("filter.dcm.copyToClipboard failed."); }); },
        showLog: function (divid) {
            app.docStaticContent(divid, jt.tac2html(
                ["div", {id:"logdispdiv"},
                 [["div", {id:"logdispheaderdiv"},
                   ["Digger " + app.top.dispatch("gen", "songDataVersion"),
                    " &nbsp; ",
                    ["button", {type:"button", id:"c2cbutton",
                                onclick:mdfs("dcm.copyToClipboard")},
                     "Copy Log To Clipboard"]]],
                  ["div", {id:"logdispcontdiv"},
                   buf.map((ln) =>
                       ["div", {cla:"logdisplinediv"},
                        [["span", {cla:"logdisplinetspan"}, ln.t],
                         ["span", {cla:"logdisplinecspan"},
                          ((ln.c > 1)? (ln.c + "&nbsp;") : "")],
                         ["span", {cla:"logdisplinemspan"}, ln.m]]])]]])); }
    };  //end of mgrs.dcm returned functions
    }());


    //General panel level setup and dispatch
    mgrs.gen = (function () {
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
        initializeInterface: function () {
            mgrs.dcm.init();  //override all console output
            jt.out("panfiltdiv", jt.tac2html(
                ["div", {id:"panfiltcontentdiv"},
                 ["div", {id:"filtpanelcontdiv"},
                  [["div", {id:"rangesdiv"},
                    [["div", {cla:"rangectrldiv", id:"aldiv"}],
                     ["div", {cla:"rangectrldiv", id:"eldiv"}]]],
                   ["div", {id:"kwtogsdiv"}],
                   ["div", {id:"ratdiv"}]]]]));
            mgrs.gen.containingDivEventHooks();
            mgrs.stg.rebuildAllControls(); }
    };  //end of mgrs.gen returned functions
    }());


return {
    init: function () { return; },
    initializeInterface: function () { mgrs.gen.initializeInterface(); },
    initialDataLoaded: function () { mgrs.stg.rebuildAllControls(true); },
    filtersReady: function () { return ctrls.filtersReady; },
    filters: function (mode) { return mgrs.stg.arrayOfAllFilters(mode); },
    summary: function () { return mgrs.dsc.summarizeFiltering(); },
    filteringPanelState: function () { return mgrs.dsc.filteringPanelState(); },
    gradient: function () { return ranger.gradient; },
    movelisten: function (d, s, p) { attachMovementListeners(d, s, p); },
    showLog: function (divid) { mgrs.dcm.showLog(divid); },
    dispatch: function (mgrname, fname, ...args) {
        return mgrs[mgrname][fname].apply(app.filter, args); }


};  //end of returned functions
}());
